// access-sync: keep Nextcloud accounts in step with a role in the Central guild.
// Losing the role (or leaving) disables the account, which also kills its open sessions and app
// passwords; regaining it re-enables only accounts this plugin disabled. See sync.ts for the rules.
import type { Client, Guild, GuildMember } from '@fluxerjs/core';
import type { BotAPI, Command, Logger, PluginConfig, PluginFactory } from 'bitbot';
import { NextcloudTarget, type AccessTarget } from './nextcloud.js';
import { decide, maxSuspensions, memberListProblem, plan, type Verdict } from './sync.js';

// ---- Config (declared settings: stored in the bot's database, editable with !admin config access-sync) --

// Declared in package.json ("bitbot.config"). Each can be pinned by an env variable named
// ACCESS_SYNC_<KEY> (e.g. ACCESS_SYNC_DRY_RUN), which wins over the database. The app password is a
// secret: ACCESS_SYNC_NEXTCLOUD_APP_PASSWORD(_FILE) only. Connection settings apply after a restart; the
// rest at once.

let conf: PluginConfig; // bot.config, set by the factory (before any command or setup can run)
const cfg = {
  get guildId() { return conf.get<string>('guild_id') ?? ''; },
  get roleId() { return conf.get<string>('role_id') ?? ''; },
  get url() { return conf.get<string>('nextcloud_url') ?? ''; },
  get user() { return conf.get<string>('nextcloud_user') ?? 'fluxer-sync'; },
  get appPassword() { return conf.get<string>('nextcloud_app_password') ?? ''; },
  get group() { return conf.get<string>('group') ?? 'fluxer'; },
  get markerGroup() { return conf.get<string>('suspended_group') ?? 'fluxer-suspended'; },
  get intervalMin() { return conf.get<number>('interval_min') ?? 60; },
  get dryRun() { return conf.get<boolean>('dry_run') ?? true; },
};
const missingList = () => conf.missing().join(', ');

// ---- State ----------------------------------------------------------------------------------------

let fluxer: BotAPI['fluxer'];
let client: Client;
let log: Logger;
let target: AccessTarget | null = null;
let timer: NodeJS.Timeout | undefined;
let reconciling = false;

/** One change at a time per user, so an event and a reconcile can't interleave on the same account. */
const queues = new Map<string, Promise<void>>();
function serialize(uid: string, work: () => Promise<void>): Promise<void> {
  const next = (queues.get(uid) ?? Promise.resolve()).then(work, work);
  queues.set(uid, next);
  next.finally(() => queues.get(uid) === next && queues.delete(uid));
  return next;
}

const hasRole = (member: GuildMember) => member.roles.roleIds.includes(cfg.roleId);
const username = async (uid: string) => (await client.users.fetch(uid).catch(() => null))?.username ?? 'unknown';

async function centralGuild(): Promise<Guild | null> {
  return client.guilds.get(cfg.guildId) ?? (await client.guilds.fetch(cfg.guildId).catch(() => null));
}

// ---- Acting ---------------------------------------------------------------------------------------

/** Carry out a verdict for one user. Never throws: failures are logged and retried at the next reconcile. */
async function apply(uid: string, verdict: 'suspend' | 'restore', reason: string, name: string) {
  const what = verdict === 'suspend' ? 'Disable' : 'Re-enable';
  const fields = { uid, user: name, reason };
  if (cfg.dryRun) return log.notice(`[dry run] Would ${what.toLowerCase()} ${name} on ${target!.name}: ${reason}`, fields);
  try {
    await target![verdict](uid);
    log.notice(`${what}d ${name} on ${target!.name}: ${reason}`, fields);
  } catch (error) {
    log.warn(`Couldn't ${what.toLowerCase()} ${name} on ${target!.name}; will retry at the next reconcile`, {
      ...fields,
      error: (error as Error).message,
    });
  }
}

/** Bring one user in line with whether they should have access (fresh state from the target). */
function syncUser(uid: string, wantAccess: boolean, reason: string, name?: string) {
  return serialize(uid, async () => {
    let user;
    try {
      user = await target!.get(uid);
    } catch (error) {
      return log.warn(`Couldn't read ${uid} from ${target!.name}; will retry at the next reconcile`, {
        error: (error as Error).message,
      });
    }
    if (!user) return; // never logged in, or not a managed account
    const verdict: Verdict = decide(user, wantAccess);
    if (verdict === 'admin-disabled') return log.debug(`${uid} is disabled by an admin; leaving it alone`);
    if (verdict) await apply(uid, verdict, reason, name ?? (await username(uid)));
  });
}

// ---- Reconcile ------------------------------------------------------------------------------------

type Result = { aborted?: string; members?: number; managed?: number; suspend?: number; restore?: number; adminDisabled?: number };

/** Compare everyone the target manages against the full member list. Refuses to act on bad data. */
async function reconcile(trigger: string): Promise<Result> {
  if (!target) return { aborted: `not configured (missing ${missingList()})` };
  if (reconciling) return { aborted: 'a reconcile is already running' };
  reconciling = true;
  const abort = (why: string): Result => {
    log.warn(`Access reconcile (${trigger}) aborted, no changes made: ${why}`);
    return { aborted: why };
  };
  try {
    const guild = await centralGuild();
    if (!guild) return abort("the bot isn't in the Central guild (setting guild_id)");

    // Whole member list, fresh (not the cache). Any failure means we don't act.
    const members = new Map<string, { name: string; hasRole: boolean }>();
    try {
      for (let after: string | undefined; ; ) {
        const page = await guild.members.fetch({ limit: 1000, after });
        for (const m of page) members.set(m.id, { name: m.user.username, hasRole: hasRole(m) });
        if (page.length < 1000) break;
        after = page.at(-1)!.id;
      }
    } catch (error) {
      return abort(`couldn't fetch the member list: ${(error as Error).message}`);
    }
    const listProblem = memberListProblem(members.size, guild.memberCount);
    if (listProblem) return abort(listProblem);

    let users;
    try {
      users = await target.listManaged();
    } catch (error) {
      return abort(`couldn't list ${target.name} users: ${(error as Error).message}`);
    }

    const { actions, adminDisabled } = plan(users, (uid) => members.get(uid)?.hasRole ?? false);
    const suspend = actions.filter((a) => a.verdict === 'suspend').length;
    const limit = maxSuspensions(users.length);
    if (suspend > limit) return abort(`it would disable ${suspend} of ${users.length} accounts (limit ${limit})`);

    for (const uid of adminDisabled) log.debug(`${uid} is disabled by an admin; leaving it alone`);
    for (const { uid, verdict } of actions) {
      const member = members.get(uid);
      const reason = verdict === 'restore' ? 'has the role again' : member ? 'no longer has the role' : 'not in the guild';
      // Re-check against fresh target state inside the per-user queue, in case an event got there first.
      await syncUser(uid, verdict === 'restore', `${reason} (${trigger} reconcile)`, member?.name);
    }
    const result = { members: members.size, managed: users.length, suspend, restore: actions.length - suspend, adminDisabled: adminDisabled.length };
    log.info(`Access reconcile (${trigger}) done${cfg.dryRun ? ' [dry run]' : ''}`, result);
    return result;
  } catch (error) {
    return abort(`unexpected error: ${(error as Error).message}`);
  } finally {
    reconciling = false;
  }
}

// ---- Events ---------------------------------------------------------------------------------------

function listen() {
  client.on(fluxer.Events.GuildMemberUpdate, (old, member) => {
    if (member.guild.id !== cfg.guildId) return;
    const now = hasRole(member);
    if (old && hasRole(old) === now) return; // role unchanged (nickname etc.): nothing to do
    syncUser(member.id, now, now ? 'role granted' : 'role removed', member.user.username);
  });
  client.on(fluxer.Events.GuildMemberAdd, (member) => {
    if (member.guild.id !== cfg.guildId) return;
    syncUser(member.id, hasRole(member), hasRole(member) ? 'joined with the role' : 'joined without the role', member.user.username);
  });
  client.on(fluxer.Events.GuildMemberRemove, (member) => {
    if (member.guild.id !== cfg.guildId) return;
    syncUser(member.id, false, 'left the guild', member.user.username);
  });
}

// ---- Commands -------------------------------------------------------------------------------------

const plugin: PluginFactory = (bot) => {
  fluxer = bot.fluxer;
  conf = bot.config;
  log = bot.log;
  const syncCmd: Command = {
    name: 'sync',
    description: 'Run a reconcile now and report what it did.',
    run: async (message) => {
      const r = await reconcile('manual');
      if (r.aborted) return message.reply(`Reconcile aborted, no changes made: ${r.aborted}`);
      return message.reply(
        `${cfg.dryRun ? '**Dry run.** ' : ''}Checked ${r.managed} ${target!.name} accounts against ${r.members} members: ` +
          `${r.suspend} to disable, ${r.restore} to re-enable, ${r.adminDisabled} disabled by an admin (left alone).`,
      );
    },
  };

  const checkCmd: Command = {
    name: 'check',
    description: 'Compare one user\'s role with their account state.',
    usage: '<@user|id>',
    run: async (message, [arg], _rest, ctx) => {
      const uid = arg ? (fluxer.parseUserMention(arg) ?? (/^\d+$/.test(arg) ? arg : null)) : null;
      const prefix = ctx.prefix;
      if (!uid) return ctx.usage();
      if (!target) return message.reply(`Access sync isn't configured (missing ${missingList()}); see \`${prefix}admin config access-sync\`.`);
      const guild = await centralGuild();
      const member = guild ? await guild.members.fetch(uid).catch(() => null) : null;
      const want = member ? hasRole(member) : false;
      let state = 'no account (never logged in, or not a managed user)';
      let next = 'nothing';
      try {
        const user = await target.get(uid);
        if (user) {
          state = `${user.enabled ? 'enabled' : 'disabled'}${user.suspended ? ', suspended by the bot' : ''}`;
          const v = decide(user, want);
          next = v === 'suspend' ? 'disable' : v === 'restore' ? 're-enable' : v === 'admin-disabled' ? 'nothing (disabled by an admin)' : 'nothing';
        }
      } catch (error) {
        state = `couldn't read it: ${(error as Error).message}`;
      }
      return message.reply(
        [
          `**${await username(uid)}** (\`${uid}\`)`,
          `Central: ${member ? (want ? 'member, has the role' : 'member, no role') : 'not a member'}`,
          `${target.name}: ${state}`,
          `Sync would: ${next}${cfg.dryRun ? ' (dry run is on)' : ''}`,
        ].join('\n'),
      );
    },
  };

  const access: Command = {
    name: 'access',
    description: 'Nextcloud access sync (follows a Central guild role).',
    requiredRole: 'admin', // mounted as !admin access
    subcommands: [syncCmd, checkCmd],
  };

  return {
    commands: [access],
    setup: (ctx) => {
      client = ctx.client;
      const missing = conf.missing();
      if (missing.length) return log.warn(`Access sync is off: missing ${missing.join(', ')} (see !admin config access-sync)`);
      target = new NextcloudTarget({ url: cfg.url, user: cfg.user, appPassword: cfg.appPassword, group: cfg.group, markerGroup: cfg.markerGroup });
      listen();
      log.info(`Access sync on${cfg.dryRun ? ' (DRY RUN: logging only)' : ''}, reconciling every ${cfg.intervalMin} min`);
      reconcile('startup');
      timer = setInterval(() => reconcile('scheduled'), cfg.intervalMin * 60_000);
    },
    stop: () => clearInterval(timer),
  };
};

export default plugin;

# Access Sync

Keeps Nextcloud accounts in step with the Nextcloud role in the Central guild. Losing the role, or
leaving the guild, **disables** the account. Nextcloud then invalidates its web sessions and app
passwords on their next request. Getting the role back re-enables the account. Data is kept either way.

## Rules

- Only users in the Nextcloud group `fluxer` are ever touched. The service user is only a group admin
  of `fluxer` and `fluxer-suspended`.
- When the bot disables someone, it first adds them to `fluxer-suspended`. It only ever re-enables
  users in that group.
- A user who is disabled but **not** in `fluxer-suspended` was disabled by an admin, and is left alone.
- Order of steps: disable = add marker, then disable. Enable = enable, then remove marker. If the bot
  dies halfway, the next reconcile finishes the job.
- A reconcile (at startup and every `interval_min` minutes) checks every managed account against
  the full member list. It makes **no changes** if:
  - the member list can't be fetched, is empty, or looks partial (under 90% of the guild's member count);
  - Nextcloud can't be listed, or a user record has no `enabled` field;
  - it would disable more than max(3, 20%) of the accounts.
- Every enable or disable is logged at `notice` level, so it also goes to the bot's log channel if one is set.

## Commands (bot admins and root)

- `!admin access sync`: run a reconcile now and report the counts.
- `!admin access check <@user|id>`: the user's role against their Nextcloud state, and what a sync would do.

## Settings

Set them from chat (`!admin config access-sync`, then `!admin config set access-sync <key> <value>`):

| Setting | Default | |
|---|---|---|
| `guild_id` | required | The Central guild whose role grants access |
| `role_id` | required | The role that grants Nextcloud access |
| `nextcloud_url` | required | Public https URL of Nextcloud (restart to apply) |
| `nextcloud_user` | `fluxer-sync` | The service user (restart to apply) |
| `group` | `fluxer` | Group of Fluxer-login users (restart to apply) |
| `suspended_group` | `fluxer-suspended` | Marker group for accounts the plugin disabled (restart to apply) |
| `interval_min` | `60` | Minutes between full reconciles (restart to apply) |
| `dry_run` | `true` | Log "would disable/enable" only; set to `false` to go live |

The app password is a **secret**: it can't be set from chat. Give it as `ACCESS_SYNC_NEXTCLOUD_APP_PASSWORD`
in the environment, or better as a file with `ACCESS_SYNC_NEXTCLOUD_APP_PASSWORD_FILE=/run/secrets/…`.
Any other setting can be pinned the same way (`ACCESS_SYNC_<SETTING>`, e.g. `ACCESS_SYNC_DRY_RUN=true`);
a pinned value wins over chat.

Forgejo (`FORGEJO_ROLE_ID=1570188802620653568`) is phase 2: a second `AccessTarget` in `nextcloud.ts`'s
interface, once the Fluxer ID → Forgejo username mapping is settled.

Tests: `pnpm test` (decision and safety logic in `sync.ts`).

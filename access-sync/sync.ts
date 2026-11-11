/*
 * Decision and safety logic. No I/O, so it's unit-tested (sync.test.ts).
 *
 * The marker group ("suspended") records which accounts the bot itself disabled. The bot only ever
 * re-enables those; an account disabled without the marker was disabled by an admin and is left alone.
 */

/** A user the target manages (e.g. a Nextcloud user in group "fluxer"). */
export type ManagedUser = { uid: string; enabled: boolean; suspended: boolean };

/** suspend = add marker, then disable. restore = enable, then remove marker. Both are safe to repeat. */
export type Verdict = 'suspend' | 'restore' | 'admin-disabled' | null;

/** What to do for one user, given whether they should have access. */
export function decide(user: ManagedUser, wantAccess: boolean): Verdict {
  if (wantAccess) {
    if (user.suspended) return 'restore'; // disabled by us (or a restore was interrupted): finish restoring
    if (!user.enabled) return 'admin-disabled';
    return null;
  }
  if (user.enabled) return 'suspend'; // includes "marker added, disable didn't happen": finish suspending
  if (!user.suspended) return 'admin-disabled'; // already locked out by an admin; nothing to record
  return null;
}

export type Planned = { uid: string; verdict: 'suspend' | 'restore' };

/** Plan a full reconcile. `hasAccess(uid)` = in the guild and has the role. */
export function plan(users: ManagedUser[], hasAccess: (uid: string) => boolean) {
  const actions: Planned[] = [];
  const adminDisabled: string[] = [];
  for (const user of users) {
    const verdict = decide(user, hasAccess(user.uid));
    if (verdict === 'suspend' || verdict === 'restore') actions.push({ uid: user.uid, verdict });
    else if (verdict === 'admin-disabled') adminDisabled.push(user.uid);
  }
  return { actions, adminDisabled };
}

/** Most suspensions one reconcile may do before it refuses (guards against a bad member list). */
export const maxSuspensions = (managedCount: number) => Math.max(3, Math.ceil(managedCount * 0.2));

/**
 * Sanity checks on the guild member list before acting on it. Returns why it's unusable, or null.
 * `expected` is the guild's reported member count, when known.
 */
export function memberListProblem(fetched: number, expected: number | null): string | null {
  if (fetched === 0) return 'the guild member list came back empty';
  if (expected && fetched < expected * 0.9) return `got ${fetched} members but the guild reports ${expected} (partial list?)`;
  return null;
}

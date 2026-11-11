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
- A reconcile (at startup and every `ACCESS_SYNC_INTERVAL_MIN`) checks every managed account against
  the full member list. It makes **no changes** if:
  - the member list can't be fetched, is empty, or looks partial (under 90% of the guild's member count);
  - Nextcloud can't be listed, or a user record has no `enabled` field;
  - it would disable more than max(3, 20%) of the accounts.
- Every enable or disable is logged at `notice` level, so it also goes to `LOG_CHANNEL_ID` if that's set.

## Commands (bot administrators)

- `!access sync`: run a reconcile now and report the counts.
- `!access check <@user|id>`: the user's role against their Nextcloud state, and what a sync would do.

## Settings (`.env`)

```
CENTRAL_GUILD_ID=1562114954234953728
NC_ROLE_ID=1570188870010535936
NEXTCLOUD_URL=                 # public https URL of Nextcloud
NEXTCLOUD_USER=fluxer-sync
NEXTCLOUD_APP_PASSWORD=
# NEXTCLOUD_GROUP=fluxer               (default)
# NEXTCLOUD_SUSPENDED_GROUP=fluxer-suspended  (default)
ACCESS_SYNC_INTERVAL_MIN=60
ACCESS_SYNC_DRY_RUN=true       # logs "would disable/enable" only; set to false to go live
```

Forgejo (`FORGEJO_ROLE_ID=1570188802620653568`) is phase 2: a second `AccessTarget` in `nextcloud.ts`'s
interface, once the Fluxer ID → Forgejo username mapping is settled.

Tests: `pnpm test` (decision and safety logic in `sync.ts`).

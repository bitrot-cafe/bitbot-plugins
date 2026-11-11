import type { ManagedUser } from './sync.js';

/*
 * Nextcloud via the OCS provisioning API. The service user is only a group admin of the managed and
 * marker groups, so it can't touch anyone outside them; we also check membership before every change.
 * Nextcloud uid == Fluxer user ID (user_oidc is configured that way), so no mapping is needed.
 */

/** Something whose accounts follow a Fluxer role. Forgejo will be a second implementation. */
export interface AccessTarget {
  name: string;
  /** Every managed user with their state. Throws rather than return a partial list. */
  listManaged(): Promise<ManagedUser[]>;
  /** One user, or null if they don't exist or aren't managed (never logged in, or not ours). */
  get(uid: string): Promise<ManagedUser | null>;
  /** Mark, then disable (a crash in between leaves a state the next reconcile finishes). */
  suspend(uid: string): Promise<void>;
  /** Enable, then unmark. */
  restore(uid: string): Promise<void>;
}

type Options = { url: string; user: string; appPassword: string; group: string; markerGroup: string };

export class NextcloudTarget implements AccessTarget {
  name = 'Nextcloud';
  constructor(private o: Options) {}

  private async ocs(method: string, path: string, form?: Record<string, string>): Promise<any> {
    const res = await fetch(`${this.o.url.replace(/\/$/, '')}/ocs/v2.php/cloud${path}${path.includes('?') ? '&' : '?'}format=json`, {
      method,
      headers: {
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.o.user}:${this.o.appPassword}`).toString('base64')}`,
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: form ? new URLSearchParams(form) : undefined,
    });
    const body: any = await res.json().catch(() => null);
    const status = body?.ocs?.meta?.statuscode ?? res.status;
    if (status === 404) return null;
    if (!res.ok || status !== 200) {
      throw new Error(`Nextcloud ${method} ${path}: HTTP ${res.status}, OCS ${status} ${body?.ocs?.meta?.message ?? ''}`.trim());
    }
    return body.ocs.data;
  }

  private toManaged(uid: string, details: any): ManagedUser {
    // Unverified until Nextcloud exists that group admins get "enabled": fail loudly, never guess.
    if (typeof details?.enabled !== 'boolean') throw new Error(`Nextcloud user ${uid} has no "enabled" field; can't sync safely`);
    const groups: string[] = details.groups ?? [];
    return { uid, enabled: details.enabled, suspended: groups.includes(this.o.markerGroup) };
  }

  async listManaged(): Promise<ManagedUser[]> {
    const users: ManagedUser[] = [];
    const limit = 200;
    for (let offset = 0; ; offset += limit) {
      const data = await this.ocs('GET', `/groups/${encodeURIComponent(this.o.group)}/users/details?limit=${limit}&offset=${offset}`);
      if (data === null) throw new Error(`Nextcloud group "${this.o.group}" not found`);
      // An empty page comes back as [] rather than {}.
      const page = Object.entries<any>(Array.isArray(data.users) ? {} : (data.users ?? {}));
      for (const [uid, details] of page) users.push(this.toManaged(details?.id ?? uid, details));
      if (page.length < limit) return users;
    }
  }

  async get(uid: string): Promise<ManagedUser | null> {
    const data = await this.ocs('GET', `/users/${encodeURIComponent(uid)}`);
    if (data === null) return null; // never logged in
    if (!(data.groups ?? []).includes(this.o.group)) return null; // not a Fluxer-login user: never touch
    return this.toManaged(uid, data);
  }

  async suspend(uid: string) {
    await this.ocs('POST', `/users/${encodeURIComponent(uid)}/groups`, { groupid: this.o.markerGroup });
    await this.ocs('PUT', `/users/${encodeURIComponent(uid)}/disable`);
  }

  async restore(uid: string) {
    await this.ocs('PUT', `/users/${encodeURIComponent(uid)}/enable`);
    // groupid in the query: DELETE bodies get dropped by some proxies.
    await this.ocs('DELETE', `/users/${encodeURIComponent(uid)}/groups?groupid=${encodeURIComponent(this.o.markerGroup)}`);
  }
}

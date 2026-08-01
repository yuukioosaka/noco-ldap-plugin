/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2026 Yuki Osaka
 * Authors: Yuki Osaka
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import ldapjs, { Client as LdapClient, Attribute } from 'ldapjs';
import { promisify } from 'util';
import type { SearchEntry } from 'ldapjs';

export type LdapConnectionOptions = {
  url: string;
  connectTimeout?: number;
  timeout?: number;
  /** PEM-encoded CA certificate. Required to trust a self-signed CA over TLS. */
  ca?: string | Buffer;
  /** Disable TLS certificate verification (insecure — only for testing). */
  tlsInsecure?: boolean;
  /** Use STARTTLS to upgrade a plain `ldap://` connection to TLS. */
  starttls?: boolean;
};

export type LdapUser = {
  dn: string;
  attributes: Record<string, string | string[]>;
};

/**
 * Thin, promise-based wrapper around an ldapjs client connection. The auth
 * flow needs only two operations: a `search` to resolve a username to its DN
 * and read the attributes, and an authenticated `bind` to verify the user's
 * password. The underlying `ldapjs` v3 client uses callbacks, so each method
 * here wraps the operation in a promise.
 *
 * Callers are expected to call `connect()` once (to optionally negotiate
 * STARTTLS) and `unbind()` once done.
 */
export class LdapClientWrapper {
  private client: LdapClient;
  private done = false;

  constructor(options: LdapConnectionOptions) {
    this.client = ldapjs.createClient({
      url: options.url,
      connectTimeout: options.connectTimeout ?? 10000,
      timeout: options.timeout ?? 15000,
      tlsOptions: {
        ca: options.ca ? [options.ca] : undefined,
        rejectUnauthorized: options.tlsInsecure ? false : undefined,
      },
    });
  }

  /**
   * Establish the connection and, when configured, negotiate STARTTLS. Must
   * resolve before any bind/search so the socket is ready.
   */
  async connect(starttls: boolean): Promise<void> {
    if (!starttls) {
      return;
    }
    await promisify(this.client.starttls.bind(this.client))({}, {});
  }

  /**
   * Authenticate (bind) using the given DN and password. Resolves on success
   * and rejects with an error otherwise (e.g. invalid credentials).
   */
  async bind(dn: string, password: string): Promise<void> {
    await promisify(this.client.bind.bind(this.client))(dn, password);
  }

  /**
   * Search for a single entry under `baseDN` matching `filter`, requesting the
   * listed `attributes` plus the objectClass for the user record. Returns the
   * first hit or `null` when nothing matches.
   */
  async findUser(baseDN: string, filter: string, attributes: string[]): Promise<LdapUser | null> {
    // Request all attributes (`*`) in addition to the specific mapped ones.
    // Some LDAP servers filter entries against the requested list with a
    // case-sensitive match, which would drop mixed-case attribute names like
    // `sAMAccountName`/`displayName`; `*` causes the whole entry to be returned.
    const wanted = Array.from(new Set(['*', 'objectClass', ...(attributes || [])]));

    return new Promise((resolve, reject) => {
      this.client.search(
        baseDN,
        { filter, scope: 'sub', sizeLimit: 2, timeLimit: 15, attributes: wanted },
        (err, res) => {
          if (err) {
            reject(err);
            return;
          }
          let user: LdapUser | null = null;
          res.on('searchEntry', (entry: SearchEntry) => {
            if (user) {
              return;
            }
            user = {
              dn: entry.objectName.toString(),
              attributes: normalizeAttributes(entry.attributes),
            };
          });
          res.on('error', (searchErr: Error) => reject(searchErr));
          res.on('end', () => resolve(user));
        },
      );
    });
  }

  async unbind(): Promise<void> {
    if (this.done) {
      return;
    }
    this.done = true;
    try {
      await promisify(this.client.unbind.bind(this.client))();
    } catch {
      // The connection may already be torn down; ignore.
    }
    this.client.destroy();
  }
}

function normalizeAttributes(attributes: Attribute[]): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const attr of attributes) {
    if (!attr.type || attr.type === '') {
      continue;
    }
    const values = attr.buffers.map((buf) => buf.toString('utf8'));
    // LDAP attribute names are case-insensitive; servers may return them in any
    // case (e.g. `displayName` vs `displayname`). Lowercase the keys so callers
    // (which look up by the configured attribute name) resolve them reliably.
    result[attr.type.toLowerCase()] = values.length === 1 ? values[0] : values;
  }
  return result;
}

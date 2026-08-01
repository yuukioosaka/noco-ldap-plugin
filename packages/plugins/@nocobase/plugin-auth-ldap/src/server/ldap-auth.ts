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

import { AuthConfig, BaseAuth } from '@nocobase/auth';
import { Model } from '@nocobase/database';
import { AuthModel } from '@nocobase/plugin-auth';
import { namespace } from '../constants';
import { LdapClientWrapper, LdapConnectionOptions } from './ldap-client';

type LdapOptions = {
  serverUrl?: string;
  baseDN?: string;
  bindDN?: string;
  bindPassword?: string;
  filter?: string;
  usernameAttribute?: string;
  displayNameAttribute?: string;
  emailAttribute?: string;
  starttls?: boolean;
  tlsInsecure?: boolean;
  ca?: string;
  autoSignup?: boolean;
};

const DEFAULT_FILTER = '(&(objectClass=user)(sAMAccountName={{username}}))';

function escapeFilterValue(value: string): string {
  return value.replace(/([\\*()\0])/g, '\\$1');
}

function firstValue(attr: string | string[] | undefined): string | undefined {
  if (Array.isArray(attr)) {
    return attr[0];
  }
  return attr;
}

export class LDAPAuth extends BaseAuth {
  // `filter` may contain a `{{username}}` placeholder that must be substituted
  // at sign-in time; exclude it from NocoBase's env-variable template rendering
  // (along with the bind password) so it is not resolved to an empty value when
  // the authenticator is saved/cached.
  static readonly optionsKeysNotAllowedInEnv = ['bindPassword', 'filter'];

  constructor(config: AuthConfig) {
    const userCollection = config.ctx.db.getCollection('users');
    super({ ...config, userCollection });
  }

  get ldapOptions(): LdapOptions {
    const opts = this.authenticator.options || {};
    // `options.public.*` is exposed to sign-in forms via `authenticators:publicList`;
    // merge it in so server reads (`autoSignup`, etc.) work regardless of which
    // section of the config the value was stored in.
    return { ...opts.public, ...opts, public: undefined } as LdapOptions;
  }

  private buildFilter(account: string): string {
    const template = this.ldapOptions.filter || DEFAULT_FILTER;
    return template.replace(/\{\{\s*username\s*\}\}/g, escapeFilterValue(account));
  }

  // Derive the FQDN from a base DN: "DC=example,DC=com" -> "example.com".
  // Used to build a UPN when no bind DN is configured.
  private getDomainFromBaseDN(baseDN: string): string | undefined {
    const dcs = (baseDN || '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => /^DC=/i.test(p))
      .map((p) => p.replace(/^DC=/i, ''));
    if (!dcs.length) {
      return undefined;
    }
    return dcs.join('.');
  }

  // In UPN mode (no bind DN) we bind with the user account directly. Accept
  // either a full UPN (`yukio@example.com`) or a bare ID (`yukio`) that is
  // promoted to a UPN using the base DN. Returns the UPN to bind with and the
  // bare ID to look up attributes with (sAMAccountName).
  private buildUpn(name: string, baseDN: string): { upn: string; bareId: string } {
    if (name.includes('@')) {
      return { upn: name, bareId: name.split('@')[0] };
    }
    const domain = this.getDomainFromBaseDN(baseDN);
    if (domain) {
      return { upn: `${name}@${domain}`, bareId: name };
    }
    // No domain derivable; only usable when the name is already a UPN form.
    return { upn: name, bareId: name };
  }

  async validate(): Promise<Model> {
    const ctx = this.ctx;
    const {
      values: { account, username, password },
    } = ctx.action.params || {};
    // Accept either `account` (basic-auth style) or `username`.
    const name = account || username;

    if (!name) {
      ctx.throw(400, this.ctx.t('Please enter your username', { ns: namespace }));
    }
    if (!password) {
      ctx.throw(400, this.ctx.t('Please enter a password', { ns: namespace }));
    }

    const serverUrl = this.ldapOptions.serverUrl;
    if (!serverUrl) {
      ctx.logger.error('auth-ldap: serverUrl is not configured', { method: 'validate' });
      ctx.throw(500);
    }

    let ldap: LdapClientWrapper;
    try {
      const connectionOptions: LdapConnectionOptions = {
        url: serverUrl,
        starttls: this.ldapOptions.starttls,
        tlsInsecure: this.ldapOptions.tlsInsecure,
        ca: this.ldapOptions.ca,
      };
      ldap = new LdapClientWrapper(connectionOptions);
      await ldap.connect(this.ldapOptions.starttls);

      const baseDN = this.ldapOptions.baseDN || '';
      const attributes = [
        this.ldapOptions.usernameAttribute,
        this.ldapOptions.displayNameAttribute,
        this.ldapOptions.emailAttribute,
      ].filter((attr): attr is string => !!attr);

      const serviceBindDN = this.ldapOptions.bindDN;
      let ldapUser;

      if (serviceBindDN) {
        // ----- bindDN mode: search via the service account, then bind the user DN -----
        // When a service account is configured, bind with it first so that the
        // search is allowed to read the entries needed to build the DN. AD
        // blocks anonymous LDAP operations by default, so without this every
        // user search fails. This also supports non-UPN user IDs.
        const filter = this.buildFilter(name);
        await ldap.bind(serviceBindDN, this.ldapOptions.bindPassword || '');
        ldapUser = await ldap.findUser(baseDN, filter, attributes);
        if (!ldapUser) {
          ctx.logger.warn(
            'auth-ldap: user could not be found via service bind search — check Base DN / User search filter / Bind DN',
            { method: 'validate', baseDN, filter },
          );
          ctx.throw(401, this.ctx.t('The username or password is incorrect, please re-enter', { ns: namespace }));
        }
        // Verify the end user's password with a bind against their own DN.
        await ldap.bind(ldapUser.dn, password);
      } else {
        // ----- UPN mode (default): bind the user account directly, no search needed -----
        // No bind DN is configured, so we cannot search the directory to resolve a DN.
        // Instead the user's own account is bound via its UPN. This is the recommended
        // default and requires UPN-style logins (`user@domain` or a bare ID promoted
        // with the domain from the base DN).
        const { upn, bareId } = this.buildUpn(name, baseDN);
        try {
          await ldap.bind(upn, password);
        } catch (bindErr) {
          ctx.logger.error(bindErr, { method: 'validate', mode: 'upn', upn });
          ctx.throw(401, this.ctx.t('The username or password is incorrect, please re-enter', { ns: namespace }));
        }
        // Try to fetch attributes as the now-bound user (e.g. sAMAccountName, display
        // name, email) for signup. AD ACLs may hide other entries, so a failure here
        // must not block a login that already succeeded via the UPN bind.
        try {
          const userFilter = this.buildFilter(bareId);
          ldapUser = await ldap.findUser(baseDN, userFilter, attributes);
        } catch (searchErr) {
          ctx.logger.warn(searchErr, { method: 'validate', mode: 'upn', baseDN });
        }
        if (!ldapUser) {
          const key = (this.ldapOptions.usernameAttribute || 'sAMAccountName').toLowerCase();
          ldapUser = { dn: upn, attributes: { [key]: bareId } };
        }
      }

      return await this.handleSignin(ldapUser.attributes);
    } catch (err) {
      ctx.logger.error(err, { method: 'validate' });
      throw new Error((err as Error).message);
    } finally {
      if (ldap) {
        await ldap.unbind();
      }
    }
  }

  private async handleSignin(attributes: Record<string, string | string[]>): Promise<Model> {
    const ctx = this.ctx;
    const authenticator = this.authenticator as AuthModel;

    // LDAP attribute names are case-insensitive and `normalizeAttributes`
    // lowercases returned keys, so look up by the lowercased configured name.
    const attr = (name?: string) => (name ? attributes[name.toLowerCase()] : undefined);

    const rawUsername = firstValue(attr(this.ldapOptions.usernameAttribute || 'sAMAccountName'));
    const username = rawUsername || this.ctx.action.params.values.account || this.ctx.action.params.values.username;
    if (!username) {
      ctx.throw(401, this.ctx.t('The username or password is incorrect, please re-enter', { ns: namespace }));
    }

    const nicknameAttr = this.ldapOptions.displayNameAttribute
      ? firstValue(attr(this.ldapOptions.displayNameAttribute))
      : undefined;
    const email = this.ldapOptions.emailAttribute ? firstValue(attr(this.ldapOptions.emailAttribute)) : undefined;

    // autoSignup defaults to true.
    const autoSignup = this.ldapOptions.autoSignup !== false;
    if (autoSignup) {
      return authenticator.findOrCreateUser(username, {
        username,
        nickname: nicknameAttr || username,
        ...(email ? { email } : {}),
      });
    }

    const user = await authenticator.findUser(username);
    if (!user) {
      ctx.throw(401, this.ctx.t('The username is not registered, please contact the administrator', { ns: namespace }));
    }
    return user;
  }
}

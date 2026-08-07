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
import ldapjs from 'ldapjs';
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

function escapeFilterValue(value: string): string {
  return value.replace(/([\\*()\0])/g, '\\$1');
}

// Escape a value for use inside a DN (LDAP string-typed attribute escape). Used
// to substitute `$login` in a login-template bind DN, like Redmine's `Net::LDAP::DN.escape`.
function escapeDnValue(value: string): string {
  return value.replace(/([/\\,\0])/g, '\\$1');
}

// Validate an LDAP filter string; returns true only when it parses cleanly. Used
// to mirror Redmine's `Filter.construct`, which yields nil (→ `(objectClass=*)`)
// when the configured filter is invalid.
function isValidFilter(filter: string): boolean {
  try {
    ldapjs.parseFilter(filter);
    return true;
  } catch {
    return false;
  }
}

function firstValue(attr: string | string[] | undefined): string | undefined {
  if (Array.isArray(attr)) {
    return attr[0];
  }
  return attr;
}

export class LDAPAuth extends BaseAuth {
  // `bindPassword` must never be templated from env vars (would leak/render it).
  // The `filter` is an LDAP filter string; keep it literal too so it is not
  // mangled by env-variable template rendering.
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

  // Build the LDAP search filter exactly like Redmine: the (optional) `filter`
  // setting is AND-combined with a term matching the login attribute
  // (`usernameAttribute`, defaulting to sAMAccountName). If the configured filter
  // is malformed, drop it and fall back to `(objectClass=*)` (Redmine's
  // `base_filter`), keeping the login term so authentication still works.
  private buildFilter(account: string): string {
    const loginAttr = this.ldapOptions.usernameAttribute || 'sAMAccountName';
    const loginFilter = `(${escapeFilterValue(loginAttr)}=${escapeFilterValue(account)})`;
    const configured = this.ldapOptions.filter;
    const extra = configured && isValidFilter(configured) ? configured : undefined;
    if (!extra) {
      return `(&(objectClass=*)${loginFilter})`;
    }
    return `(&${extra}${loginFilter})`;
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

      const bindDn = this.ldapOptions.bindDN;
      const bindPassword = this.ldapOptions.bindPassword || '';
      let ldapUser;
      let filter: string | undefined;

      // Redmine mirrors three bind strategies via its `account` field: a fixed
      // service account, a `$login`-template account (bind as the end user
      // himself), or none at all (anonymous). The `bindDN` option plays the role
      // of Redmine's `account` here, so a `$login` token selects the template mode.
      const useServiceBind = !!bindDn && !bindDn.includes('$login');
      const useLoginTemplate = !!bindDn && bindDn.includes('$login');

      if (useServiceBind) {
        // ----- service-account mode: bind the service account, then search, then bind the user DN -----
        filter = this.buildFilter(name);
        await ldap.bind(bindDn, bindPassword);
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
      } else if (useLoginTemplate) {
        // ----- login-template mode: bind as the end user, then search -----
        // `bindDN` contains a `$login` token (e.g. `uid=$login,ou=people,dc=example,dc=com`).
        // The user is bound directly with their own DN and password, which also
        // authorizes the subsequent attribute search. Mirrors Redmine's `$login` account.
        const userDn = bindDn.replace(/\$login/g, escapeDnValue(name));
        try {
          await ldap.bind(userDn, password);
        } catch (bindErr) {
          ctx.logger.error(bindErr, { method: 'validate', mode: 'login-template', userDn });
          ctx.throw(401, this.ctx.t('The username or password is incorrect, please re-enter', { ns: namespace }));
        }
        filter = this.buildFilter(name);
        ldapUser = await ldap.findUser(baseDN, filter, attributes);
        if (!ldapUser) {
          ctx.logger.warn(
            'auth-ldap: user could not be found via login-template search — check Base DN / User search filter / Bind DN',
            { method: 'validate', baseDN, filter },
          );
          ctx.throw(401, this.ctx.t('The username or password is incorrect, please re-enter', { ns: namespace }));
        }
      } else {
        // ----- anonymous mode: search anonymously, then bind the user DN -----
        // No service account or `$login` template is configured, so the directory is
        // searched anonymously to resolve the user's DN, then their password is
        // verified by binding that DN. Mirrors Redmine, which also does an anonymous
        // search when no service `account` is set. Anonymous search is unavailable on
        // AD, which blocks it by default; configure a Bind DN in that case.
        filter = this.buildFilter(name);
        ldapUser = await ldap.findUser(baseDN, filter, attributes);
        if (!ldapUser) {
          ctx.logger.warn(
            'auth-ldap: user could not be found via anonymous search — check Base DN / User search filter, or configure a Bind DN (AD disallows anonymous search)',
            { method: 'validate', baseDN, filter },
          );
          ctx.throw(401, this.ctx.t('The username or password is incorrect, please re-enter', { ns: namespace }));
        }
        await ldap.bind(ldapUser.dn, password);
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

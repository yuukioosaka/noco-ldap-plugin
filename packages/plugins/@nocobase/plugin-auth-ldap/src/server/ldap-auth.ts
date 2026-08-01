/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
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
      const filter = this.buildFilter(name);
      const attributes = [
        this.ldapOptions.usernameAttribute,
        this.ldapOptions.displayNameAttribute,
        this.ldapOptions.emailAttribute,
      ].filter((attr): attr is string => !!attr);

      // When a service account is configured, bind with it first so that the
      // search is allowed to read the entries needed to build the DN. AD
      // blocks anonymous LDAP operations by default, so without this every
      // user search fails.
      const serviceBindDN = this.ldapOptions.bindDN;
      let searchedWithServiceBind = false;
      if (serviceBindDN) {
        await ldap.bind(serviceBindDN, this.ldapOptions.bindPassword || '');
        searchedWithServiceBind = true;
      }

      const ldapUser = await ldap.findUser(baseDN, filter, attributes);
      if (!ldapUser) {
        if (!searchedWithServiceBind) {
          ctx.logger.warn(
            'auth-ldap: user could not be found via anonymous search — check Base DN / User search filter, or configure a Bind DN (AD disallows anonymous search)',
            { method: 'validate', baseDN, filter },
          );
        }
        ctx.throw(401, this.ctx.t('The username or password is incorrect, please re-enter', { ns: namespace }));
      }

      // Verify the end user's password with a bind against their own DN.
      await ldap.bind(ldapUser.dn, password);

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

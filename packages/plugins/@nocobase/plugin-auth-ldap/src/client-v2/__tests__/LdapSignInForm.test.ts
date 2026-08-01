/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Authenticator } from '@nocobase/plugin-auth/client-v2';
import { describe, expect, it } from 'vitest';
import { pickLdapPublicOptions } from '../forms/LdapSignInForm';

function makeAuthenticator(options: Record<string, unknown>): Authenticator {
  return {
    name: 'ldap',
    authType: 'LDAP',
    authTypeTitle: 'LDAP',
    options,
  };
}

describe('LdapSignInForm pickLdapPublicOptions', () => {
  it('reads autoSignup directly off authenticator.options (the flattened public shape)', () => {
    expect(pickLdapPublicOptions(makeAuthenticator({ autoSignup: true })).autoSignup).toBe(true);
  });

  it('returns autoSignup=false when the option is missing or falsy', () => {
    expect(pickLdapPublicOptions(makeAuthenticator({})).autoSignup).toBe(false);
    expect(pickLdapPublicOptions(makeAuthenticator({ autoSignup: 0 })).autoSignup).toBe(false);
  });

  it('returns autoSignup=false when the authenticator has no options at all', () => {
    expect(pickLdapPublicOptions(null)).toEqual({ autoSignup: false });
    expect(pickLdapPublicOptions(undefined)).toEqual({ autoSignup: false });
    expect(pickLdapPublicOptions({ name: 'ldap', authType: 'LDAP', authTypeTitle: 'LDAP' })).toEqual({
      autoSignup: false,
    });
  });

  it('does NOT read from authenticator.options.public — that path is server-side storage only', () => {
    const out = pickLdapPublicOptions(makeAuthenticator({ public: { autoSignup: true } }));
    expect(out).toEqual({ autoSignup: false });
  });
});

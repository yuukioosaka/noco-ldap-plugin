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

import ldapjs, { Server as LdapServer } from 'ldapjs';
import { Database, Model } from '@nocobase/database';
import { createMockServer, MockServer } from '@nocobase/test';
import { authType } from '../../constants';

type MockEntry = {
  dn: string;
  attributes: Record<string, string | string[]>;
  password: string;
};

async function startLdapServer(): Promise<{
  server: LdapServer;
  url: string;
  entries: MockEntry[];
  close: () => Promise<void>;
}> {
  const entries: MockEntry[] = [
    {
      dn: 'CN=taro,OU=Users,DC=example,DC=com',
      password: 'secret123',
      attributes: {
        sAMAccountName: 'taro',
        displayName: 'Taro Yamada',
        mail: 'taro@example.com',
      },
    },
  ];

  const server = ldapjs.createServer();
  // Mount handlers at the empty (root) suffix. ldapjs v3 server DN routing
  // compares the request base/bind DN against the mount suffix with a
  // case/format-sensitive lookup that can mis-match `DC=example,DC=com`, so a
  // catch-all mount is the reliable way to serve a mock directory.
  server.bind('', (req: any, res: any, next: any) => {
    const entry = entries.find((e) => e.dn.toLowerCase() === String(req.dn).toLowerCase());
    if (entry && req.credentials === entry.password) {
      res.end();
    } else {
      return next(new ldapjs.InvalidCredentialsError());
    }
  });
  server.search('', (req: any, res: any) => {
    const filterStr = req.filter?.toString?.() || '';
    const match = filterStr.match(/sAMAccountName=([^)]+)/i);
    const expected = match ? match[1] : null;
    const entry = expected ? entries.find((e) => e.attributes.sAMAccountName === expected) : undefined;
    if (entry) {
      res.send(
        {
          dn: entry.dn,
          attributes: { ...entry.attributes, objectClass: ['user'] },
        },
        true, // nofiltering: ldapjs server filters plain-object attributes against the (case-sensitive) requested list, which would drop e.g. `sAMAccountName`/`displayName` when the client requests them mixed-case.
      );
    }
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const url = server.url;
  return {
    server,
    url,
    entries,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

describe('LDAP signin', () => {
  let app: MockServer;
  let db: Database;
  let ldapServer: ReturnType<typeof startLdapServer> extends Promise<infer T> ? T : never;
  let agent;

  beforeAll(async () => {
    ldapServer = await startLdapServer();

    app = await createMockServer({
      plugins: ['field-sort', 'users', 'auth', 'acl', 'auth-ldap', 'data-source-manager'],
    });
    db = app.db;

    const authenticatorRepo = db.getRepository('authenticators');
    await authenticatorRepo.create({
      values: {
        name: 'ldap-auth',
        authType: authType,
        enabled: 1,
        options: {
          serverUrl: ldapServer.url,
          baseDN: 'DC=example,DC=com',
          filter: '(&(objectClass=user)(sAMAccountName={{username}}))',
          usernameAttribute: 'sAMAccountName',
          displayNameAttribute: 'displayName',
          emailAttribute: 'mail',
          public: {
            autoSignup: true,
          },
        },
      },
    });
    agent = app.agent();
  });

  afterAll(async () => {
    await ldapServer.close();
    await app.destroy();
  });

  it('should create a new user and sign in via LDAP bind', async () => {
    const res = await agent
      .set({ 'X-Authenticator': 'ldap-auth' })
      .post('/auth:signIn')
      .send({ account: 'taro', password: 'secret123' });
    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    expect(data.token).toBeDefined();
    expect(data.user).toBeDefined();
    expect(data.user.username).toBe('taro');
    expect(data.user.nickname).toBe('Taro Yamada');
    expect(data.user.email).toBe('taro@example.com');
  });

  it('should reject invalid credentials with 401', async () => {
    const res = await agent
      .set({ 'X-Authenticator': 'ldap-auth' })
      .post('/auth:signIn')
      .send({ account: 'taro', password: 'wrong' });
    expect(res.statusCode).toBe(401);
  });

  it('should sign in an existing user when autoSignup is disabled', async () => {
    // The first test already provisioned and linked `taro` (uuid=username) with
    // autoSignup enabled. Now disable autoSignup: signing in an already-known
    // account must still succeed, while a never-seen account must fail.
    const repo = db.getRepository('authenticators');
    const auth = await repo.findOne({ filter: { name: 'ldap-auth' } });
    const optionsWithAutoSignup = (autoSignup: boolean) => ({
      ...auth.options,
      public: { ...(auth.options.public || {}), autoSignup },
    });
    await repo.update({
      filterByTk: auth.id,
      values: { options: optionsWithAutoSignup(false) },
    });
    const res = await agent
      .set({ 'X-Authenticator': 'ldap-auth' })
      .post('/auth:signIn')
      .send({ account: 'taro', password: 'secret123' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.username).toBe('taro');

    // A never-seen username fails when autoSignup is off.
    ldapServer.entries.push({
      dn: 'CN=jiro,OU=Users,DC=example,DC=com',
      password: 'pw',
      attributes: { sAMAccountName: 'jiro', displayName: 'Jiro', mail: 'jiro@example.com' },
    });
    const resUnknown = await agent
      .set({ 'X-Authenticator': 'ldap-auth' })
      .post('/auth:signIn')
      .send({ account: 'jiro', password: 'pw' });
    expect(resUnknown.statusCode).toBe(401);

    // Restore autoSignup for subsequent tests.
    await repo.update({
      filterByTk: auth.id,
      values: { options: optionsWithAutoSignup(true) },
    });
  });
});

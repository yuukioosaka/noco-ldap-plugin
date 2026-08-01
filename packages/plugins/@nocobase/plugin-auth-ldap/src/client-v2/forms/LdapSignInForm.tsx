/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { type Authenticator, useSignIn } from '@nocobase/plugin-auth/client-v2';
import { Alert, Button, Form, Input, Typography } from 'antd';
import React, { useState } from 'react';
import { useAuthLDAPTranslation } from '../locale';

export type LdapPublicOptions = {
  autoSignup: boolean;
};

/**
 * Extract sign-in–facing options from an authenticator returned by
 * `/authenticators:publicList`. That endpoint flattens server-side
 * `options.public.*` into `options.*`, so the auto-signup hint reads from
 * `authenticator.options.autoSignup` rather than `options.public.autoSignup`.
 */
export function pickLdapPublicOptions(authenticator: Authenticator | null | undefined): LdapPublicOptions {
  return {
    autoSignup: !!authenticator?.options?.autoSignup,
  };
}

/**
 * LDAP/AD sign-in form rendered on the v2 `/signin` page when the user picks an
 * LDAP authenticator tab. Submits `account` + `password` through `useSignIn`
 * (same hook the password sign-in form uses) — the server binds the
 * credentials against the AD/LDAP server in `LDAPAuth.validate()`.
 */
export default function LdapSignInForm({ authenticator }: { authenticator: Authenticator }) {
  const { t } = useAuthLDAPTranslation();
  const [form] = Form.useForm();
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const signIn = useSignIn(authenticator.name);

  const { autoSignup } = pickLdapPublicOptions(authenticator);

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={async (values) => {
        setErrorMessage('');
        setLoading(true);
        try {
          await signIn.run(values);
        } catch (error: any) {
          setErrorMessage(error?.response?.data?.errors?.[0]?.message || error?.message || String(error));
        } finally {
          setLoading(false);
        }
      }}
    >
      {errorMessage ? <Alert style={{ marginBottom: 16 }} type="error" showIcon message={errorMessage} /> : null}
      <Form.Item name="account" rules={[{ required: true, message: t('Please enter your username') }]}>
        <Input autoComplete="username" placeholder={t('Username')} />
      </Form.Item>
      <Form.Item name="password" rules={[{ required: true, message: t('Please enter a password') }]}>
        <Input.Password autoComplete="current-password" placeholder={t('Password')} />
      </Form.Item>
      <Form.Item style={{ marginBottom: 12 }}>
        <Button loading={loading} htmlType="submit" type="primary" block>
          {t('Sign in')}
        </Button>
      </Form.Item>
      {autoSignup ? (
        <Typography.Text type="secondary">{t('User will be registered automatically if not exists.')}</Typography.Text>
      ) : null}
    </Form>
  );
}

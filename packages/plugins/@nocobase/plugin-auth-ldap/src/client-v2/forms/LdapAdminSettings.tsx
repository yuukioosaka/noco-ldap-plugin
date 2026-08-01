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

import { Checkbox, Form, Input, Switch } from 'antd';
import React from 'react';
import { useAuthLDAPTranslation } from '../locale';

/**
 * Admin-side configuration for an LDAP authenticator. Rendered inside the
 * Authenticators page drawer below the common fields. Server connection and
 * attribute-mapping settings are stored under `options.*`, while the
 * sign-in-facing `autoSignup` flag lives under `options.public.*` so it is
 * exposed through `authenticators:publicList` to the sign-in form.
 */
export default function LdapAdminSettings() {
  const { t } = useAuthLDAPTranslation();
  const bindDN = Form.useWatch(['options', 'bindDN']);

  return (
    <>
      <Form.Item
        name={['options', 'serverUrl']}
        label={t('Server URL')}
        tooltip="ldap://host:389, ldaps://host:636 or ldap://host:389 with STARTTLS"
        rules={[{ required: true, message: t('Server URL') }]}
      >
        <Input placeholder="ldap://dc.example.com:389" />
      </Form.Item>
      <Form.Item name={['options', 'baseDN']} label={t('Base DN')} rules={[{ required: true, message: t('Base DN') }]}>
        <Input placeholder="DC=example,DC=com" />
      </Form.Item>
      <Form.Item name={['options', 'bindDN']} label={t('Bind DN')} tooltip={t('Bind DN')}>
        <Input placeholder="CN=svc-ldap,OU=Service Accounts,DC=example,DC=com" />
      </Form.Item>
      <Form.Item
        name={['options', 'bindPassword']}
        label={t('Bind password')}
        rules={[
          {
            validator(_, value) {
              // Only required when a bind DN is configured.
              if (bindDN && !value) {
                return Promise.reject(new Error(t('Bind password')));
              }
              return Promise.resolve();
            },
          },
        ]}
      >
        <Input.Password autoComplete="off" />
      </Form.Item>
      <Form.Item name={['options', 'filter']} label={t('User search filter')}>
        <Input placeholder="(&(objectClass=user)(sAMAccountName={{username}}))" />
      </Form.Item>
      <Form.Item name={['options', 'usernameAttribute']} label={t('Username attribute')} initialValue="sAMAccountName">
        <Input placeholder="sAMAccountName" />
      </Form.Item>
      <Form.Item
        name={['options', 'displayNameAttribute']}
        label={t('Display name attribute')}
        initialValue="displayName"
      >
        <Input placeholder="displayName" />
      </Form.Item>
      <Form.Item name={['options', 'emailAttribute']} label={t('Email attribute')} initialValue="mail">
        <Input placeholder="mail" />
      </Form.Item>
      <Form.Item
        name={['options', 'starttls']}
        label={t('Use STARTTLS')}
        valuePropName="checked"
        tooltip={t('Use STARTTLS')}
      >
        <Switch />
      </Form.Item>
      <Form.Item
        name={['options', 'tlsInsecure']}
        label={t('Skip TLS certificate verification')}
        valuePropName="checked"
        tooltip={t('Skip TLS certificate verification')}
      >
        <Checkbox />
      </Form.Item>
      <Form.Item name={['options', 'ca']} label={t('CA certificate')}>
        <Input.TextArea rows={4} placeholder="-----BEGIN CERTIFICATE-----" />
      </Form.Item>
      <Form.Item
        name={['options', 'public', 'autoSignup']}
        label={t('Sign up automatically when the user does not exist')}
        valuePropName="checked"
        initialValue
      >
        <Checkbox />
      </Form.Item>
    </>
  );
}

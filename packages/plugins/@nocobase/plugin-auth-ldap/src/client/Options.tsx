/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { SchemaComponent } from '@nocobase/client';
import React from 'react';
import { useAuthLDAPTranslation } from './locale';

/**
 * Admin-side configuration for an LDAP authenticator (legacy client). Writes
 * connection/attribute settings to `options.*` and the sign-in-facing
 * `autoSignup` flag to `options.public.autoSignup`, matching what the server's
 * `LDAPAuth`` reads.
 */
export const Options = () => {
  const { t } = useAuthLDAPTranslation();
  return (
    <SchemaComponent
      scope={{ t }}
      schema={{
        type: 'object',
        properties: {
          serverUrl: {
            type: 'string',
            title: '{{t("Server URL")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            required: true,
          },
          baseDN: {
            type: 'string',
            title: '{{t("Base DN")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            required: true,
          },
          bindDN: {
            type: 'string',
            title: '{{t("Bind DN")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          bindPassword: {
            type: 'string',
            title: '{{t("Bind password")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Input.Password',
          },
          filter: {
            type: 'string',
            title: '{{t("User search filter")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          usernameAttribute: {
            type: 'string',
            title: '{{t("Username attribute")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': { placeholder: 'sAMAccountName' },
          },
          displayNameAttribute: {
            type: 'string',
            title: '{{t("Display name attribute")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': { placeholder: 'displayName' },
          },
          emailAttribute: {
            type: 'string',
            title: '{{t("Email attribute")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': { placeholder: 'mail' },
          },
          starttls: {
            type: 'boolean',
            title: '{{t("Use STARTTLS")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Checkbox',
          },
          tlsInsecure: {
            type: 'boolean',
            title: '{{t("Skip TLS certificate verification")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Checkbox',
          },
          ca: {
            type: 'string',
            title: '{{t("CA certificate")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Input.TextArea',
            'x-component-props': { rows: 4 },
          },
          public: {
            type: 'object',
            properties: {
              autoSignup: {
                type: 'boolean',
                title: '{{t("Sign up automatically when the user does not exist")}}',
                'x-decorator': 'FormItem',
                'x-component': 'Checkbox',
                default: true,
              },
            },
          },
        },
      }}
    />
  );
};

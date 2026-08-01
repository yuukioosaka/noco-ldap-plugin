/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { SchemaComponent } from '@nocobase/client';
import { ISchema } from '@formily/react';
import { useSignIn } from '@nocobase/plugin-auth/client';
import React from 'react';
import { Authenticator } from '@nocobase/plugin-auth/client';
import { useAuthLDAPTranslation } from './locale';

const ldapForm: ISchema = {
  type: 'object',
  name: 'ldapForm',
  'x-component': 'FormV2',
  properties: {
    account: {
      type: 'string',
      'x-component': 'Input',
      'x-decorator': 'FormItem',
      'x-component-props': { placeholder: '{{t("Username")}}', style: {} },
    },
    password: {
      type: 'string',
      'x-component': 'Password',
      required: true,
      'x-decorator': 'FormItem',
      'x-component-props': { placeholder: '{{t("Password")}}', style: {} },
    },
    actions: {
      type: 'void',
      'x-component': 'div',
      properties: {
        submit: {
          title: '{{t("Sign in")}}',
          type: 'void',
          'x-component': 'Action',
          'x-component-props': {
            htmlType: 'submit',
            block: true,
            type: 'primary',
            useAction: '{{ useLdapSignIn }}',
            style: { width: '100%' },
          },
        },
      },
    },
  },
};

export const SigninPage = (props: { authenticator: Authenticator }) => {
  const { t } = useAuthLDAPTranslation();
  const authenticator = props.authenticator;
  const useLdapSignIn = () => {
    return useSignIn(authenticator.name);
  };

  return <SchemaComponent schema={ldapForm} scope={{ useLdapSignIn, t }} />;
};

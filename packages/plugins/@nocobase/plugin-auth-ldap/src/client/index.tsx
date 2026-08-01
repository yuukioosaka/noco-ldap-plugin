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

import { Plugin } from '@nocobase/client';
import AuthPlugin from '@nocobase/plugin-auth/client';
import { authType } from '../constants';
import { Options } from './Options';
import { SigninPage } from './SigninPage';

export class PluginAuthLDAPClient extends Plugin {
  async load() {
    const auth = this.app.pm.get(AuthPlugin);
    auth.registerType(authType, {
      components: {
        SignInForm: SigninPage,
        AdminSettingsForm: Options,
      },
    });
  }
}

export default PluginAuthLDAPClient;

# Auth: LDAP

LDAP / Active Directory authentication for NocoBase via LDAP bind.

Users sign in with their LDAP username and password. The plugin binds to the
LDAP/AD server, looks up the user, verifies the credentials with a bind, maps
the user's attributes to a NocoBase `users` record and (by default) creates the
user automatically on first sign-in.

## Features

- Active Directory / LDAP bind authentication
- Supports `ldap://` (plaintext), `ldaps://` (TLS) and STARTTLS
- Automatic user provisioning enabled by default (`autoSignup`)
- Attribute mapping to NocoBase user fields (username / nickname / email)
- Sensitive bind password can be overridden with an environment variable

## Usage

Enable the plugin and create an LDAP authenticator from the Authentication
settings page. Configure the LDAP server URL, base DN, bind DN template, user
search filter and attribute mapping, then sign in with an LDAP username and
password.

## Build & Distribution (dist-only tar)

The distributable package contains only `package.json` and the compiled `dist/`
directory (no `src/`, no entry stubs, no dev docs). NocoBase loads the plugin
from `dist/server/index.js` (server) and `dist/client*/` (client), so this shape
is sufficient and avoids shipping source code.

### Build the plugin first

From the repository root (after `yarn install`):

```bash
yarn build @nocobase/plugin-auth-ldap --tar --no-dts
```

The `--no-dts` avoids the declaration step. Note: the default `--tar` also packs
`src/`, entry stubs and dev files. For a **dist-only** package, create the
tarball manually instead:

### Create the dist-only tarball

```bash
# from the repository root
mkdir -p storage/tar/@nocobase
tar -czf "storage/tar/@nocobase/plugin-auth-ldap.tgz" \n  -C packages/plugins/@nocobase/plugin-auth-ldap ./package.json ./dist
```

Output: `storage/tar/@nocobase/plugin-auth-ldap-$VERSION.tgz`

### Install into a target NocoBase app

1. Extract the tarball into the target app: `storage/plugins/@nocobase/plugin-auth-ldap/`
   (must contain `package.json` and `dist/`).
2. Ensure plugin symlinks are resolved (NocoBase links `storage/plugins` into
   `node_modules/@nocobase/plugin-auth-ldap`). On Windows enable Developer Mode
   (or add your user to the symlink policy) so `fs.symlink` is permitted.
3. Restart the app, then enable the plugin from the Plugin Manager UI or:

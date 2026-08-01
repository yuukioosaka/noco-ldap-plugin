# Auth: LDAP

LDAP / Active Directory authentication for NocoBase via LDAP bind.

Users sign in with their LDAP username and password. The plugin binds to the
LDAP/AD server, looks up the user, verifies the credentials with a bind, maps
the user's attributes to a NocoBase `users` record and (by default) creates the
user automatically on first sign-in.

## Features

- Active Directory / LDAP bind authentication
- **Two bind modes** — UPN direct bind (default) and service-account (Bind DN)
  lookup (see below)
- Supports `ldaps://` (TLS) and STARTTLS
- Automatic user provisioning enabled by default (`autoSignup`)
- Attribute mapping to NocoBase user fields (username / nickname / email)
- Sensitive bind password can be overridden with an environment variable

## Usage

Enable the plugin and create an LDAP authenticator from the Authentication
settings page. Configure the LDAP server URL, base DN, and the bind mode, then
sign in with an LDAP username and password.

## Transport: use `ldaps://` with Active Directory

By default **Active Directory refuses anonymous operations and unsigned simple
binds**, so a plaintext `ldap://host:389` URL usually fails with one of these
errors:

- `Strong Auth Required` (error code 8) — the DC requires LDAP signing, which
  `ldapjs` does not do, or
- `No Such Object` — anonymous search is blocked, so the user cannot be found.

LDP.exe may still authenticate in that environment because it issues a *signed*
simple bind, but `ldapjs` cannot, so `ldap://` will not work there. Use
**`ldaps://` (TLS, e.g. port 636)** or STARTTLS instead, which are accepted.

- `ldaps://host:636` — TLS from the start (recommended)
- STARTTLS over `ldap://host:389` if the server advertises it

## Bind modes

The authenticator supports two flows. The required form of the login ID depends
on which one is used.

### Mode 1 — UPN direct bind (default)

When **no Bind DN is configured**, the plugin cannot search the directory to
resolve a DN (AD blocks anonymous search). Instead it binds the user's own
account directly via its **UPN (User Principal Name)**:

- `user@example.com` is used as-is.
- a bare ID such as `yukio` is promoted to `yukio@example.com` using the domain
  derived from the **Base DN** (`DC=example,DC=com` → `example.com`), then bound.

So both `yukio` and `yukio@example.com` work in this mode, and **UPN logins are
the recommended default**. After a successful bind the plugin searches the
directory (as the bound user) to fetch attributes (`sAMAccountName`, display
name, email) for auto-provisioning; if the ACL hides the entry, the login still
succeeds using the bare ID as the username. Leave **Bind DN** / **Bind
Password** empty.

### Mode 2 — Service-account lookup (Bind DN)

Configure a **Bind DN** (a service account with read access) to search for a
user before binding. The plugin binds with the service account, looks up the
user with the **User search filter**, then verifies the end user's password by
binding to the found DN. This also supports **non-UPN user IDs** (e.g. a
`sAMAccountName` such as `yukio`). Use one of the following as the Bind DN:

- `yukio@example.com` (UPN of an account with read access), or
- the full DN, e.g. `CN=Yuki Y. Osaka,CN=Users,DC=example,DC=com`.

For production, prefer a dedicated read-only service account instead of a real
user.

## Sample configuration

A working setup for an Active Directory domain `example.com` with a user whose
`sAMAccountName` is `yukio` (UPN `yukio@example.com`):

### Default — UPN direct bind (no Bind DN)

| Setting              | Value                              |
| -------------------- | ---------------------------------- |
| **Server URL**       | `ldaps://your-dc.example.com:636` |
| **Start TLS**        | off                                |
| **Base DN**          | `DC=example,DC=com`                |
| **Bind DN**          | *(leave empty)*                    |
| **Bind Password**    | *(leave empty)*                    |
| **User search filter** | `(&(objectClass=user)(sAMAccountName={{username}}))` |
| **Username attribute** | `sAMAccountName`                |
| **Display name attribute** | `displayName`                  |
| **Email attribute**  | `mail`                             |
| **Auto signup**      | on                                 |
| **Verify TLS / insecure**   | on (if using a self-signed CA) |

Log in as `yukio` or `yukio@example.com`.

### Service-account lookup (with Bind DN)

Same as above, but fill in:

| Setting           | Value                                |
| ----------------- | ------------------------------------ |
| **Bind DN**       | `svc-ldap-read@example.com`          |
| **Bind Password** | `svc-ldap-read-PASSWORD`             |

Log in as `yukio` (the bare `sAMAccountName`).

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

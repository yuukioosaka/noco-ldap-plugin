# Auth: LDAP

LDAP / Active Directory authentication for NocoBase via LDAP bind.

Users sign in with their LDAP username and password. The plugin binds to the
LDAP/AD server, looks up the user, verifies the credentials with a bind, maps
the user's attributes to a NocoBase `users` record and (by default) creates the
user automatically on first sign-in.

## Features

- Active Directory / LDAP bind authentication
- **Three bind modes** — anonymous search (default), service-account (Bind DN),
  and login-template (`$login`) bind (see below)
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

The plugin picks one of three flows depending on the **Bind DN** setting. The
required form of the login ID depends on which one is in effect.

| Bind DN setting                  | Mode                         |
| -------------------------------- | ---------------------------- |
| *(empty)*                        | anonymous search (default)   |
| contains `$login`                | login-template bind          |
| set but no `$login`              | service-account lookup       |

### Mode 1 — Anonymous search (default)

When **Bind DN is left empty**, the plugin cannot bind a service account, so it
searches the directory **anonymously** to resolve the user's DN, then verifies
the end user's password by binding that DN. No login template is required.

- The login ID is matched literally against the **Username attribute**. With
  `sAMAccountName` (AD default) a UPN like `yukio@example.com` does **not**
  match; set the Username attribute to `userPrincipalName`/`mail` instead if
  you want to sign in with a UPN/email address.

This works on any directory that **allows anonymous searches**. Active Directory
**blocks anonymous search by default**, so on AD you must configure a Bind DN
(service account or `$login` template) instead.

### Mode 2 — Service-account lookup (Bind DN)

Configure a **Bind DN** (a service account with read access) — **without** the
literal `$login` token — to search for a user before binding. The plugin binds
with the service account, looks up the user, then verifies the end user's
password by binding to the found DN. This supports **non-UPN user IDs** (e.g. a
`sAMAccountName` such as `yukio`). Use one of the following as the Bind DN:

- `svc-ldap-read@example.com` (UPN of an account with read access), or
- the full DN, e.g. `CN=LDAP Read,CN=Users,DC=example,DC=com`.

For production, prefer a dedicated read-only service account instead of a real
user.

### Mode 3 — Login-template bind (`$login`)

When the **Bind DN contains the literal token `$login`**, the plugin substitutes
the login ID into the template and binds **the end user's own account directly**,
then searches the directory as that bound user to fetch attributes.

Example Bind DN:

- `uid=$login,ou=people,dc=example,dc=com`
- `cn=$login,dc=example,dc=com`

This is useful when every user's DN follows a predictable pattern but you do not
want to provision a service account, and the directory blocks anonymous search.
The token match is literal (`$login` only).

## Sample configuration

A working setup for an Active Directory domain `example.com` with a user whose
`sAMAccountName` is `yukio` (the anonymous and service-account subsections are
AD-oriented; the `$login` subsection is directory-agnostic):

> **Login ID format.** The typed login ID is matched literally against the
> **Username attribute** (`sAMAccountName` by default), i.e. `(sAMAccountName=<input>)`.
> Enter the bare attribute value — a UPN like `yukio@example.com` will **not**
> match `sAMAccountName`. The exact `<input>` expected in each mode is shown
> below as **Log in as**.

### Default — anonymous search (no Bind DN)

| Setting              | Value                              |
| -------------------- | ---------------------------------- |
| **Server URL**       | `ldaps://your-dc.example.com:636` |
| **Start TLS**        | off                                |
| **Base DN**          | `DC=example,DC=com`                |
| **Bind DN**          | *(leave empty)*                    |
| **Bind Password**    | *(leave empty)*                    |
| **User search filter** | *(optional)* `(&(objectClass=user))` |
| **Username attribute** | `sAMAccountName`                |
| **Display name attribute** | `displayName`                  |
| **Email attribute**  | `mail`                             |
| **Auto signup**      | on                                 |
| **Verify TLS / insecure**   | on (if using a self-signed CA) |

- **Log in as** → `yukio`

  The bare value is required: with `sAMAccountName` as the Username attribute,
  `yukio@example.com` does not match.

Note the **search filter** is an *optional* AND condition on top of the username
term; it does **not** embed the login ID (`{{username}}` is no longer substituted).

> Anonymous search does **not** work on Active Directory, which blocks it by
> default. On AD, use one of the two Bind DN modes below instead.

### Service-account lookup (with Bind DN)

Same as above, but fill in:

| Setting           | Value                                |
| ----------------- | ------------------------------------ |
| **Bind DN**       | `svc-ldap-read@example.com`          |
| **Bind Password** | `svc-ldap-read-PASSWORD`             |

- **Log in as** → `yukio`

  (The search runs as the service account and resolves `yukio` by `sAMAccountName`)

### Login-template bind (with `$login` in Bind DN)

The `$login` template is directory-agnostic; the sample below uses an OpenLDAP
style `uid=` DN. On AD there is no single attribute that reliably equals
`sAMAccountName` in the DN (AD DNs use `CN=`), so prefer the service-account mode
on AD. Same settings as above, but fill in:

| Setting                        | Value                                        |
| ------------------------------ | -------------------------------------------- |
| **Bind DN**                    | `uid=$login,ou=people,dc=example,dc=com`     |
| **Bind Password**              | *(unused — the end user's password is used)* |

- **Log in as** → `yukio`

  (`$login` is replaced with `yukio`, binding `uid=yukio,ou=people,dc=example,
  dc=com` with the supplied password, then the attribute search runs as that
  bound user using the Username attribute)

### Input-variation summary

The typed login ID always equals the **Username attribute value**. Pick the row
that matches how the directory keys users:

| Directory login key              | Username attribute  | Example input       |
| -------------------------------- | ------------------- | ------------------- |
| `sAMAccountName` (AD)            | `sAMAccountName`    | `yukio`             |
| `mail` / `userPrincipalName` (AD)| `mail`              | `yukio@example.com` |
| `uid` (OpenLDAP)                 | `uid`               | `yukio`             |
| `cn`                             | `cn`                | `yukio`             |

- In every mode the input must be the **Username attribute value** itself:
- with `sAMAccountName`, `yukio@example.com` does not match; conversely, if the
  Username attribute is `mail`, then `yukio@example.com` is the correct input.
- In **login-template mode**, the `$login` token is placed inside a DN RDN whose
  attribute (**must**) correspond to the login key. For consistency pick a
  template whose RDN attribute matches the Username attribute value you type
  (e.g. `cn=$login,...` with an input of `yukio`, or `mail=$login,...` with a
  UPN input). The subsequent attribute search also uses the Username attribute.

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

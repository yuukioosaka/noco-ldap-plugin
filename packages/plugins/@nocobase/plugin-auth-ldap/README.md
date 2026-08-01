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

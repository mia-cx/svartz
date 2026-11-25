---
title: "Reader sign-in"
description: "Let readers sign in and give plugins account and permission checks."
---

Run `npm install -D @svartz/auth`. Import `auth` from `@svartz/auth` and add it to the vault's plugins:

```ts
plugins: [auth({
  providers: { github: { clientId: "Iv23liExample", clientSecret: { env: "PRIVATE_GITHUB_CLIENT_SECRET" } } },
  admins: ["github:583231"],
  privacyNotice: "/privacy/",
})],
```

Use a [[plugins/server-plugins|server target]]. Set `PRIVATE_SVARTZ_SESSION_SECRET` to at least 32 random characters and set the provider secret on the server. Register `https://<host><base><mount>/_svartz/auth/callback/<provider>/` with the provider. On Node, set `ORIGIN` to the site's origin.

| Option | Type | Default |
| --- | --- | --- |
| `providers` | Map of `github`, `google`, `discord`, or `x` to `{ clientId: string; clientSecret: { env: string } }` | Required |
| `privacyNotice` | URL string | None |
| `admins` | List of provider identity IDs | Empty |
| `callbackVault` | Vault ID string | First auth-enabled host vault |
| `userPages` | Folder path string | `"users"` |

Bind D1 as `SVARTZ_DB` for accounts, handles, sessions, and grants. Auth creates its tables on first use. Without D1 the provider sign-in still works, but there are no site accounts, and `readAccount` returns `null`. Host vaults share accounts. When several enable auth, use the same `admins` and `userPages` on each and make sure the callback vault offers all providers they use.

No frontmatter enables sign-in. Published notes at `users/<handle>.md`, or in the folder set by `userPages`, serve as user pages. With D1, `/-/account/` shows the reader's account and `/-/dashboard/` shows permitted panels. In a host, prefix these paths with the mount. In server code, use `readAccount(request, context.env)` and `can(account, permission, target, context.env)` from `@svartz/auth/server`. See the [permissions reference](https://github.com/mia-cx/svartz/blob/sveltekit-rewrite/docs/auth.md#permissions) for roles, scoped grants, and reputation.

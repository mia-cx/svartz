# `@svartz/auth`

Readers sign in with Google, Discord, X or GitHub and get an account with a handle, and server plugins read who is signed in. Accounts and sessions live in the site's own D1 database; no hosted service.

```ts
import { auth } from "@svartz/auth";

plugins: [auth({
  providers: { github: { clientId: "Iv23liExample", clientSecret: { env: "PRIVATE_GITHUB_CLIENT_SECRET" } } },
  privacyNotice: "/privacy/",
  admins: ["github:583231"],
})]
```

```ts
import { readAccount } from "@svartz/auth/server";

const reader = await readAccount(request, context.env); // Account | null
```

Bind a D1 database as `SVARTZ_DB`, and set `PRIVATE_SVARTZ_SESSION_SECRET` (32+ random characters) and the client secret on the server. Setup, routes and the sign-in dialog: [docs/auth.md](../../docs/auth.md).

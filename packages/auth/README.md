# `@svartz/auth`

Readers sign in with Google, Discord, X or GitHub, and server plugins read who is signed in. Runs on Workers and Node with no hosted service.

```ts
import { auth } from "@svartz/auth";

plugins: [auth({
  providers: { github: { clientId: "Iv23liExample", clientSecret: { env: "PRIVATE_GITHUB_CLIENT_SECRET" } } },
  privacyNotice: "/privacy/",
})]
```

```ts
import { readIdentity } from "@svartz/auth/server";

const reader = await readIdentity(request, context.env); // Identity | null
```

Set `PRIVATE_SVARTZ_SESSION_SECRET` (32+ random characters) and the client secret on the server. Setup, routes and the sign-in dialog: [docs/auth.md](../../docs/auth.md).

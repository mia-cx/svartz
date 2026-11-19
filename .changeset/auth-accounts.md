---
"@svartz/auth": minor
---

Signing in now creates a real account. Bind a D1 database as `SVARTZ_DB` and auth keeps each reader's account, linked provider accounts and sessions there, creating its tables on first use. A reader's first sign-in asks them to choose a handle, prefilled from their provider username. The session cookie holds only a session id, so deleting the session in D1 signs that browser out on its next request.

Server plugins read the signed-in person with `readAccount(request, env)` from `@svartz/auth/server`, and the reason there is none with `readSignIn`. `readIdentity` keeps working unchanged. `auth({ admins: ["github:583231"] })` names bootstrap admins, whose accounts always hold the `admin` role whatever the database says.

Readers signed in before this release stay signed in: their cookie becomes an account and a session the first time a plugin reads it. Without `SVARTZ_DB`, as on Node, sign-in works as before, with no accounts.

---
'@svartz/auth': minor
---

New package: readers sign in with GitHub through `auth({ providers: { github: { clientId, clientSecret: { env } } } })`, and server plugins read who is signed in with `readIdentity(request, env)` from `@svartz/auth/server`. The session is an AES-GCM sealed cookie keyed by `PRIVATE_SVARTZ_SESSION_SECRET`; only the reader's identity is kept. Any element with `data-svartz-sign-in` opens the sign-in dialog, which can link the site's privacy notice. See `docs/auth.md`.

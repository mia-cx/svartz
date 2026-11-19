---
"@svartz/auth": minor
---

Server plugins can list the provider accounts linked to an account. `linkedIdentities(account, env)` from `@svartz/auth/server` answers each one, the first linked first, with the profile it last signed in with, so a plugin can find a reader's GitHub account even when they signed in with Discord. It answers `[]` when the site binds no `SVARTZ_DB`.

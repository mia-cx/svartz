---
"@svartz/auth": minor
---

`findProfiles(ids, env)` from `@svartz/auth/server` answers the public profiles of the accounts with those ids, by id, for plugins that stored an account's id and need to show who it is. Ids no account has are left out.

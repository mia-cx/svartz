---
"@svartz/auth": minor
---

Accounts can be suspended. While a suspension is in force, every session of the account reads as signed out: `readAccount` answers `null` and `readSignIn` answers `{ account: null, reason: "suspended", suspension: { reason, until?, since } }`, so the account is a guest on every plugin, with no plugin changing. The check joins the session's own D1 batch, so a signed-in request costs no extra call. Sessions are kept, and the account is signed in again once the suspension's `until` passes; one without `until` lasts until it's lifted. An account config's `admins` names is never suspended and never locked out.

Server plugins suspend and lift with `suspend(env, actor, { handle, reason, until? })` and `liftSuspension(env, actor, handle)` from `@svartz/auth/server`, each committed with its audit entry, `auth:account:suspend` or `auth:account:lift`; `suspend` refuses an admin and the actor's own account. `findSuspension(handle, env)` and `listSuspensions(env)` read them. The caller checks who may; `@svartz/plugin-moderation` checks `moderation:accounts:write`.

A suspended reader's `/-/account/` says why and until when, without naming the moderator, and offers **Sign out**. `POST sign-out/` takes a same-site `?returnTo=<path>` and redirects there, so a plain form can sign out. `GET viewer/` answers `{ suspended: true }` for a suspended reader, and the site actions keep the **Account** link for them.

`readAuditLog(env, { actor?, target?, before?, limit? })` reads the audit log, newest first, a page at a time in one query, filtered by who made each entry (any handle they've held) and by its exact target. `findProfileByIdentity(identity, env)` answers the account a provider account such as `github:583231` is linked to.

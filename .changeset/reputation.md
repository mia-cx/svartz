---
"@svartz/auth": minor
---

Accounts earn reputation, and reputation can promote them. Each account's score is the sum of its entries in an append-only ledger in `SVARTZ_DB`; each event, such as a merged edit or a **+1** on a comment, is recorded once however often it is reported. Server plugins post events with `postReputation(env, event)` from `@svartz/auth/server`.

By default a merged edit scores 1 + log2 of the lines it changed, a merged new page 5, a **+1** received on a comment 0.5, a moderator's kudos 5, and a declined pull request 0, and an account earns at most 100 points a day from edits, pages and **+1**s. Admins change these on the dashboard's new Reputation panel, and set thresholds there: an account whose score reaches a threshold gets its role, with an entry in the audit log. Nothing takes a role away automatically. A role reputation gave can only be removed by an admin, and once removed, reputation never gives it back.

Moderators who hold the new `auth:kudos:write` permission give kudos, with a reason, on the Kudos panel: at most one a day to each account, never to themselves. Readers see their score and next threshold on `/-/account/`, and `GET <mount>/_svartz/auth/users/<handle>/` answers an account's score as `reputation`.

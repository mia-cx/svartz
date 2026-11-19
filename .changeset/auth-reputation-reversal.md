---
"@svartz/auth": minor
---

Plugins can take reputation back when the content it was earned for is undone. `reverseReputation(env, reversals)` from `@svartz/auth/server` takes back what each `edit` or `page` event, named by its account and the `ref` it was posted with, earned that account: one `reversal` entry per event in the ledger, all in one transaction. An event is taken back once however often it is reversed, an event reversed before it was posted scores nothing when it is, and an event that earned the account nothing gets no entry. A lower score never takes away a role the account already holds.

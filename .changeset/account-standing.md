---
"@svartz/auth": minor
---

Plugins can show a page about an account. `findStanding(handle, env)` from `@svartz/auth/server` answers the account that holds or held `handle`, under its current handle, with its id, its user page under any handle it has held, and its reputation: its score and the next threshold it hasn't reached. `userPageOf(handle)` answers the URL of the user page at a handle. Show the next threshold only to the account itself.

The Reputation section of `/-/account/` leaves an empty `data-svartz-region="account-activity"` element, its `data-svartz-handle` naming the account, where plugins' browser scripts add links to the account's activity. It takes no space while empty.

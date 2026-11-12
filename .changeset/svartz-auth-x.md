---
'@svartz/auth': minor
---

Readers can sign in with X. `providers.x` asks only for `users.read tweet.read`, the scopes X requires to read the signed-in account, and never for the email address. The identity is `x:<user id>`, with name, handle, profile picture and profile link. The sign-in dialog shows X's logo. See "X setup" in `docs/auth.md`.

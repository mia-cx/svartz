---
'@svartz/auth': minor
---

Readers can sign in with Google (`providers.google`) or Discord (`providers.discord`), and the sign-in dialog shows each brand's mark. Their ids are `google:<sub>` and `discord:<user id>`. `Identity.handle`, `avatarUrl` and `profileUrl` are now optional: Google accounts have no username or public profile page. See `docs/auth.md` for each provider's console setup.

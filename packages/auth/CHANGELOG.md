# @svartz/auth

## 2.4.0

### Minor Changes

- a4c869f: One sign-in covers every host vault in an app. Every vault's sign-in runs through `callbackVault` (default: the first host vault that enables auth), so each provider needs one callback URL, and the session reads as signed in on every vault. A `callbackVault` that names no vault, a vault without auth, or a vault missing one of the providers fails config loading, naming the vault. Plugins can now read sibling vaults through a `forVault({ vault, vaults })` hook that runs at config resolution. See "Several vaults" in `docs/auth.md`.
- 626d6f1: New package: readers sign in with GitHub through `auth({ providers: { github: { clientId, clientSecret: { env } } } })`, and server plugins read who is signed in with `readIdentity(request, env)` from `@svartz/auth/server`. The session is an AES-GCM sealed cookie keyed by `PRIVATE_SVARTZ_SESSION_SECRET`; only the reader's identity is kept. Any element with `data-svartz-sign-in` opens the sign-in dialog, which can link the site's privacy notice. See `docs/auth.md`.
- 832fc32: Readers can sign in with Google (`providers.google`) or Discord (`providers.discord`), and the sign-in dialog shows each brand's mark. Their ids are `google:<sub>` and `discord:<user id>`. `Identity.handle`, `avatarUrl` and `profileUrl` are now optional: Google accounts have no username or public profile page. See `docs/auth.md` for each provider's console setup.
- ae978d6: Readers can sign in with X. `providers.x` asks only for `users.read tweet.read`, the scopes X requires to read the signed-in account, and never for the email address. The identity is `x:<user id>`, with name, handle, profile picture and profile link. The sign-in dialog shows X's logo. See "X setup" in `docs/auth.md`.

### Patch Changes

- 23bd2dd: The sign-in dialog works in a host app that sets SvelteKit's `paths.base`. Its provider links used to leave the base out and answer 404; the dialog now adds the deployment base it is mounted with, so standalone and host vaults both reach their sign-in routes.
- fe00cef: Closing the sign-in dialog reopens the popover its opener sat in, which opening the dialog had hidden, so focus goes back to a control the reader can see instead of falling to the page.
- Updated dependencies [020d144]
- Updated dependencies [a4c869f]
- Updated dependencies [7a1d5f9]
- Updated dependencies [d7303ae]
- Updated dependencies [d01cd5e]
- Updated dependencies [e46840b]
- Updated dependencies [f55f8fa]
- Updated dependencies [14bc204]
- Updated dependencies [639e96d]
  - @svartz/core@2.4.0

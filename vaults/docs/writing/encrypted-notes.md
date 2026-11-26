---
title: "Encrypted notes"
description: "Publish a locked note with a shared password set at build time."
---

Name a password group in `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  passwordGroups: { friends: { env: "SVARTZ_FRIENDS_PASSWORD" } },
  vaults: [{ id: "notes", path: "vault", target: { type: "static" } }],
});
```

Set `SVARTZ_FRIENDS_PASSWORD` in the build environment. Do not commit the password or use a public `PUBLIC_` or `VITE_` variable. Add `password_group: friends` to a published note. An unknown group or missing password fails the build.

The public page shows a title and password prompt. Svartz encrypts the body and attachments used only by protected notes. Entering the password unlocks the group for the current page session. Set `hide_locked: true` to omit the note from public listings without removing its URL.

This is shared-password publication, not account access. Anyone with the password and payload can decrypt it. Change the password and rebuild to rotate access; this cannot revoke a copy someone already has. Keep client imports browser-safe. Svartz rejects server-only imports and imports of unpublished notes or notes in another group.

A host with a Content Security Policy must permit blob module imports and any blob resources its unlocked notes use. See [the host CSP example](https://github.com/mia-cx/svartz/blob/main/docs/encrypted-notes.md) before enabling encrypted notes in an existing app.

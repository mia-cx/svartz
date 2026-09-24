# Encrypted notes

Add `password_group` to a published `.svx` note to publish a locked page. Svartz builds the note, its client-side imports, metadata, and private attachments into an encrypted group payload. The page contains only its public title and URL until a reader enters the group password. Only `.svx` files can run Svelte code.

```ts
export default {
  version: "1.0.0",
  passwordGroups: {
    friends: { env: "SVARTZ_FRIENDS_PASSWORD" },
  },
  vaults: [{ id: "notes", path: "vault", target: { type: "static" } }],
};
```

Set `SVARTZ_FRIENDS_PASSWORD` in the build environment. A missing group or password fails the build. Do not put the password in `svartz.config.ts` or frontmatter. Password variables cannot use the client-public `PUBLIC_` or `VITE_` prefixes. Cloudflare SvelteKit hosts should use their configured server-only `PRIVATE_` prefix.

```svx
---
title: Friends only
password_group: friends
---

<h1>Our photos</h1>
<img src="./photo.webp" alt="Friends together" />
```

Notes in the same group share one password and unlock together for the current browser page session. Locking removes the group's key, rendered content, discovery data, and private attachment URLs. A browser may retain imported module code until the page closes. Another group stays unlocked. Reloading the page requires the password again.

Set `hide_locked: true` to omit a protected note from public navigation, search, feeds, sitemaps, and graphs. Its URL remains reachable by someone who knows it. Listed protected notes expose their title and URL before unlock. Search and graph details for listed notes appear only after unlock and disappear on lock. `draft: true` and `private: true` still prevent publication; `published_at` publishes immediately, without scheduling a future build.

Attachments used only by protected notes enter the encrypted payload. An attachment also referenced by a public note is public. Use normal Markdown links and images, or static `src`, `href`, `poster`, and `srcset` attributes in `.svx`. Client-side imports must be safe for browsers. Host-owned `$lib` imports use the host's module instance, so a context key imported by both a layout and a protected note keeps its identity. Keep protected-only code inside the vault. Svartz rejects server-only imports and unpublished or cross-group note imports. Unsupported compiler-emitted assets fail the build.

For a SvelteKit host, allow decrypted module imports and styles in its CSP:

```js
kit: {
  csp: {
    directives: {
      'script-src': ['self', 'blob:'],
      'style-src': ['self', 'blob:', 'unsafe-inline'],
      'img-src': ['self', 'blob:'],
      'media-src': ['self', 'blob:'],
      'frame-src': ['self', 'blob:']
    }
  }
}
```

The standalone Svartz shell already sets these directives. Adapt them to any stricter host policy. SvelteKit adds hashes for its own prerendered inline scripts. A static site's CSP appears in a meta tag; a dynamic host sends it as a header. The browser must support Web Crypto and blob module imports.

Anyone with the password and payload can decrypt the note. This is password-based publication, not user accounts or per-reader revocation. Change the password and rebuild to rotate access.

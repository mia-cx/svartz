---
title: "What gets published"
order: 4
description: "Use publication modes, globs, and frontmatter to control the build."
---

Start with a public vault or use inclusion mode in `svartz.config.ts` to select public folders:

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "notes",
      path: "vault",
      target: { type: "static" },
      publicationMode: "inclusion",
      include: ["index.md", "public/**"],
      exclude: ["public/scratch/**"],
    },
  ],
});
```

Patterns match paths inside the vault. The default `exclusion` mode starts with all discovered notes and ignores `include`. In `inclusion` mode, `include` selects notes by path. An empty list selects none by path. `exclude` applies in both modes.

Svartz skips dotfiles and dot folders such as `.obsidian` and `.trash`, plus entries such as `node_modules`. Set `draft: true` to hold back a note. Set `published_at` (or the configured publication field) to `true` or a date to override `draft`, `include`, and `exclude`. An invalid but nonblank date still publishes the note, so do not rely on date parsing to hold it back. It does not override discovery ignores or `private: true`. Use `private: true` on a note you never want to publish.

Only referenced attachments that pass discovery and exclusion are copied. [[writing/encrypted-notes|Encrypted notes]] are a separate choice and still have public URLs.

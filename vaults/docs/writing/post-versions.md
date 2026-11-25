---
title: "Post versions from Git"
description: "Publish historical versions of a note without a running server."
---

Install [[plugins/history|the history plugin]] and enable Git mode in `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";
import { history } from "@svartz/plugin-history";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "notes",
      path: "vault",
      target: { type: "static" },
      plugins: [history({ source: "git" })],
    },
  ],
});
```

Give the build a Git checkout with the file's history; fetch full history in CI. Add `versions: true` to the frontmatter of each note you want to publish versions of.

A note needs at least two eligible revisions. Readers open **Previous versions** at `<note>/versions/`, then compare a revision with the previous one at `<note>/versions/<commit>/`. The pages are prerendered and excluded from search, feeds, and sitemaps. The build fails if another page or alias claims one of their URLs.

The build follows renames and skips merge commits. It skips past drafts, private notes, protected notes, and revisions whose paths would not pass your publication rules. It renders historical text using the current pipeline and resolves links to currently published notes. A referenced attachment deleted since that revision can be copied from Git, subject to publication rules.

Review the file's Git history before opting in, because public revisions can expose text you later removed. The default maximum is 50 versions per note. Change it with `history({ source: "git", maxVersions: 20 })`. Keep `.svartz` build state between CI runs to reuse compiled versions when their inputs have not changed.

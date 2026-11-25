---
title: "History"
description: "Show page revisions from Git at build time or from GitHub at runtime."
---

Run `npm install -D @svartz/plugin-history` and add `history()` to a vault in `svartz.config.ts`. Choose one mode per vault:

| Option | Type and default |
| --- | --- |
| `source` | `"github"` (default) or `"git"`. |
| `maxVersions` | Git mode only. Integer of at least 2, default 50. |

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

Git mode works on any target and has no server prerequisites. See [[writing/post-versions|Post versions from Git]] for the per-note `versions: true` opt-in.

## Live history

Add `history()` alongside [[plugins/submissions|submissions]] with `sync` enabled. This needs the Cloudflare GitHub mirror and a server target. Live mode has no per-note frontmatter or independent credentials.

| Route below the vault mount | Shows |
| --- | --- |
| `/-/history/<slug>/` | Revisions and comparisons for a published Markdown page. |
| `/-/changes/` | Recent changes from the mirror. Link it from navigation if you want readers to find it there. |
| `/-/contributions/<handle>/` | Changes the site attributes to an account, when the accounts database is bound. |

History does not show drafts, private revisions, or protected pages. Live mode follows the file at its current path; it does not follow renames. It fetches up to 1,100 revisions for one page (11 GitHub pages of 100 commits). The mirror's backfill limits how far Recent changes and account contributions reach. Account attribution comes from site save records, not commit authorship or trailers.

Reverting needs a GitHub App, accounts, and `history:reverts:write`. It creates a new commit and requires the branch's current state to match what the moderator reviewed.

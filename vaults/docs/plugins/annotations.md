---
title: "Annotations"
description: "Let readers comment on a selected passage."
---

Run `npm install -D @svartz/plugin-annotations @svartz/auth`. Import `annotations` from `@svartz/plugin-annotations` and add `annotations({ database: { env: "SVARTZ_DB" } })` to the vault's `plugins` next to [[plugins/auth|auth]]. Use Workers, Pages, or a Cloudflare SvelteKit host; the plugin needs D1. It creates its tables on first use.

| Option | Type | Default |
| --- | --- | --- |
| `database` | `{ env: string }`, naming a D1 binding | Required |
| `reactions` | List of `{ id: string; label: string; src: string }` | Empty |
| `moderators` | List of identity IDs; prefer a permission grant | Empty |
| `limits.writesPerHour` | Positive integer | 30 per reader per clock hour |

Anyone can read comments. Signed-in readers can select text, comment, agree with a comment, and delete their own. Light edits can keep an annotation anchored; if its passage is gone the comment moves to a separate list below the note. Comments are keyed by slug, so changing it leaves the existing comments under the old one.

Selections can be up to 1,000 characters and comments up to 2,000. There is no frontmatter to add. Protected notes and listing pages do not show annotations. A custom theme needs to mark the note body, or a host can use `SvartzNoteContent` or `attach` from `@svartz/plugin-annotations/browser`. To hide comments through [[plugins/moderation|moderation]], use the accounts database `SVARTZ_DB` for annotations too.

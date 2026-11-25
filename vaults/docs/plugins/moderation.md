---
title: "Moderation"
description: "Queue reader reports and manage suspensions from the dashboard."
---

Run `npm install -D @svartz/plugin-moderation @svartz/auth`. Import `moderation` from `@svartz/plugin-moderation` and add `moderation()` alongside [[plugins/auth|auth]] in the vault's `plugins`. Use a Cloudflare target and bind D1 as `SVARTZ_DB`. The plugin creates its tables on first use.

`limits.reportsPerHour` is an optional positive integer, default 10 per reader per clock hour. For example, `moderation({ limits: { reportsPerHour: 5 } })`. No note frontmatter is needed. Signed-in readers can report a published page or account and give a reason of at most 1,000 characters. Installed plugins can also add reports on comments, submissions, or commits.

Moderators open the Reports, Suspensions, and Audit log panels at `/-/dashboard/`. Grants control which panels and actions they can use. To hide comments from reports, configure [[plugins/annotations|annotations]] to use `SVARTZ_DB`. Closing submissions needs [[plugins/submissions|submissions with sync]] and the review permission. Reverting is a separate [[plugins/history|history]] action. Resolve the report after taking any of those actions.

---
"@svartz/plugins": minor
---

`@svartz/plugins/preview` finds attachments as the build does: from the note's folder, then by vault path, then by a file name no other attachment has, so Obsidian's shortest links such as `![chart](chart.png)` show their image. `![[…]]` attachment embeds render as images, audio, video, PDF frames or links. `renderPreview` takes the published attachments' vault paths as `attachments`; a link to any other file stays unresolved. `publishedAttachments(ctx)` lists the attachments a build publishes.

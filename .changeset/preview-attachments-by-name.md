---
"@svartz/plugins": minor
---

`@svartz/plugins/preview` finds attachments as the build does: from the note's folder, then by vault path, then by a file name no other attachment has, so Obsidian's shortest links such as `![chart](chart.png)` show their image. `![[…]]` attachment embeds render as images, audio, video, PDF frames or links. `renderPreview` takes the published attachments' vault paths as `attachments`, and as `sharedNames` the file names unpublished files share with them; a link to any other file, or by a shared name alone, stays unresolved. `publishedAttachments(ctx)` lists the attachments a build publishes, and `sharedAttachmentNames(ctx)` those shared names.

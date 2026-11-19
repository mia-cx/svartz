---
"@svartz/plugins": minor
---

Plugins can judge and build another version of a note, such as an earlier one from git, by the build's own rules.

- `publishesNote(config, path, frontmatter)` answers whether the build publishes a note at `path` inside the vault with that frontmatter: discovery reads its folder, `include` and `exclude` let it through, and it isn't a draft or private, with a publication date overriding the patterns and the draft flag as before. A note it publishes may still be password-protected.
- `keepsAttachment(config, path)` answers whether the build may publish the attachment at `path`: discovery reads its folder and `exclude` lets it through. The build publishes it once a published note references it.
- `compileNoteVersion(ctx, note, version, options)`, called from `emitArtifacts`, compiles a version's Markdown as the build compiles the note itself: the vault's plugins run their frontmatter, link, OFM and embed stages on it among the published notes and attachments, then its Markdown steps and sanitizer, giving the Svelte markup a note page holds. It answers which of `options.attachments` the version references, shows a relative link to anything `options.published` doesn't hold unresolved, and prefixes relative URLs with `options.prefix` for a page below the note's own.

`core:filter-unpublished` decides with `publishesNote` and `keepsAttachment`, so its behaviour is unchanged.

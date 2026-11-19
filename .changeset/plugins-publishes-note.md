---
"@svartz/plugins": minor
---

`publishesNote(config, path, frontmatter)` answers whether the build publishes a note at `path` inside the vault with that frontmatter: discovery reads its folder, `include` and `exclude` let it through, and it isn't a draft or private, with a publication date overriding the patterns and the draft flag as before. A note it publishes may still be password-protected. `core:filter-unpublished` decides with it, so a plugin that judges another version of a note, such as an earlier one from git, applies the same rule.

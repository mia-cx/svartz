---
'@svartz/plugin-annotations': minor
'@svartz/ui': minor
---

Host apps get annotations on their own pages. `SvartzNoteContent` marks a public note's body like theme-minimal does, so the vault's annotations show on it with no code. On markup the host renders itself, `attach(element, { vault, slug })` takes a vault from `virtual:svartz/host` and the note's slug, and finds the routes under the deployment base and mount itself. See "Annotations" in `docs/host-vaults.md`.

---
title: VaultView
description: Published, vault-scoped data for SvelteKit loaders and theme components.
tags: [vault]
symbol:
  kind: interface
  name: VaultView
  signature: "interface VaultView"
  members:
    - name: entries
      kind: property
      signature: "readonly entries: readonly IndexEntry[]"
      description: Every published note, with final URLs.
    - name: tags
      kind: property
      signature: "readonly tags: readonly TagIndexEntry[]"
    - name: folders
      kind: property
      signature: "readonly folders: readonly FolderIndexEntry[]"
    - name: note
      kind: method
      signature: "note(reference: string): VaultNoteView | undefined"
      description: Look up a note by slug or URL path, with its outgoing links and backlinks.
  source: https://github.com/mia-cx/svartz/blob/main/packages/core/src/vault-view.ts
  since: 1.0.0
---

Every URL in the view already includes the SvelteKit base path and the vault's mount path. Build one with [[createVaultView]].

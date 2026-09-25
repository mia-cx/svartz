---
title: createVaultView
description: Build a vault view from the published index.
tags: [vault]
symbol:
  kind: function
  name: createVaultView
  signature: "createVaultView(index: Index, id: string, basePath?: string): VaultView"
  parameters:
    - name: index
      type: Index
      description: The published index artifact.
    - name: id
      type: string
      description: The vault's id from the config.
    - name: basePath
      type: string
      optional: true
      default: '""'
      description: SvelteKit's deployment base, prefixed to every URL.
  returns:
    type: "[[VaultView]]"
  source: https://github.com/mia-cx/svartz/blob/main/packages/core/src/vault-view.ts
  since: 1.0.0
---

---
title: Getting started
description: Write a theme manifest and check it against the contract.
---

A theme is a function that returns a [[SvartzTheme]]. Wrap it in [[defineTheme]] so Svartz validates it when the vault builds.

```ts title="theme.ts"
import { defineTheme } from '@svartz/core';
import Layout from './Layout.svelte';

export default defineTheme(() => ({
  id: '@acme/theme',
  version: '1.0.0',
  contractVersion: '1.0.0',
  layouts: { defaultPage: { default: Layout }, notePage: { default: Layout } },
  routes: [{ id: 'note', pattern: '/:slug' }]
}));
```

> [!note]
> `contractVersion` must share its major version with [[CONTRACT_VERSION]].

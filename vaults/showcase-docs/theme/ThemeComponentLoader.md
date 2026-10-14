---
title: ThemeComponentLoader
description: A Svelte component, either imported or loaded on demand.
tags: [theme]
symbol:
  kind: type
  name: ThemeComponentLoader
  signature: "type ThemeComponentLoader = (() => Promise<{ default: unknown }>) | { readonly default: unknown }"
  source: https://github.com/mia-cx/svartz/blob/main/packages/core/src/theme/types.ts
  since: 1.0.0
---

Use the eager form in a theme's runtime manifest and the lazy form in its Node manifest. [[materializeTheme]] turns lazy loaders into modules.

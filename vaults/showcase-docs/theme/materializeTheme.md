---
title: materializeTheme
description: Load every lazy component in a theme so it can render on the server.
tags: [theme, ssr]
symbol:
  kind: function
  name: materializeTheme
  signature: "materializeTheme(theme: SvartzTheme): Promise<SvartzTheme>"
  parameters:
    - name: theme
      type: "[[SvartzTheme]]"
      description: A manifest whose layouts, routes, or components may be lazy loaders.
  returns:
    type: "Promise<[[SvartzTheme]]>"
    description: The same manifest with every loader replaced by its module.
  source: https://github.com/mia-cx/svartz/blob/main/packages/core/src/theme/materialize-theme.ts
  since: 1.0.0
---

Each loader runs once, even when several slots share it.

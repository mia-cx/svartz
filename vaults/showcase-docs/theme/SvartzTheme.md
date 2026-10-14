---
title: SvartzTheme
description: The theme manifest a theme package exports.
tags: [theme]
symbol:
  kind: interface
  name: SvartzTheme
  signature: "interface SvartzTheme"
  members:
    - name: id
      kind: property
      signature: "readonly id: string"
      description: The package name, for example `@svartz/theme-minimal`.
    - name: contractVersion
      kind: property
      signature: "readonly contractVersion: string"
      description: Must share its major version with CONTRACT_VERSION.
    - name: layouts
      kind: property
      signature: "readonly layouts: ThemeLayoutMap"
      description: Layout components by slot. `defaultPage` and `notePage` are required.
    - name: routes
      kind: property
      signature: "readonly routes: readonly ThemeRouteDefinition[]"
      description: Route patterns. One must have the id `note` and a `:slug` parameter.
    - name: components
      kind: property
      signature: "readonly components?: ThemeComponentRegistry"
      description: Content slots and reusable components hosts may pick up.
    - name: pluginPreset
      kind: property
      signature: "readonly pluginPreset?: ThemePluginPreset"
      description: Build-time plugins that replace core plugins with the same id.
    - name: renderCapabilities
      kind: property
      signature: "readonly renderCapabilities?: ThemeRenderCapabilities"
      deprecated: Use capabilities.
  source: https://github.com/mia-cx/svartz/blob/main/packages/core/src/theme/types.ts
  since: 1.0.0
---

Themes rarely build this object by hand; [[defineTheme]] checks it, and [[materializeTheme]] loads its lazy components before server rendering.

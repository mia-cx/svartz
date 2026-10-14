---
title: defineTheme
description: Wrap a theme manifest so Svartz validates it before use.
tags: [theme]
symbol:
  kind: function
  name: defineTheme
  signatures:
    - "defineTheme(theme: SvartzTheme): () => SvartzTheme"
    - "defineTheme<T>(factory: (options?: T) => SvartzTheme): (options?: T) => SvartzTheme"
  typeParameters:
    - name: T
      constraint: Record<string, unknown>
      description: The theme's options, read from the vault's `theme` config.
  parameters:
    - name: factory
      type: "(options?: T) => [[SvartzTheme]]"
      description: Builds the manifest from the vault's theme options.
  returns:
    type: "(options?: T) => [[SvartzTheme]]"
    description: A factory that validates each manifest it builds.
  throws:
    - type: ThemeValidationError
      description: When the manifest breaks the contract, for example a missing note route.
  source: https://github.com/mia-cx/svartz/blob/main/packages/core/src/theme/define-theme.ts
  since: 1.0.0
---

Validation runs each time the factory is called, so a vault that passes bad options fails at build time instead of rendering a broken site.

## Example

```ts
export default defineTheme((options?: { accent?: string }) => ({
  id: '@acme/theme',
  version: '1.0.0',
  contractVersion: '1.0.0',
  layouts: { defaultPage: Layout, notePage: Layout },
  routes: [{ id: 'note', pattern: '/:slug' }]
}));
```

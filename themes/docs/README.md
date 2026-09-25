# @svartz/theme-docs

Reference docs for a package: guides, then every exported class, interface, function, type, and constant, one note per symbol. The structure follows TypeDoc, rustdoc, and Starlight; the look is Svartz's.

```ts
// svartz.config.ts
vaults: [{
  id: "docs",
  path: "docs",
  target: { type: "static" },
  theme: {
    base: "@svartz/theme-docs",
    version: "1.0.0",
    routes: { folders: "api" },
    nav: { GitHub: "https://github.com/you/package" },
  },
}],
```

## What it renders

| Page | Contents |
| --- | --- |
| Symbol | Kind badge, name, since, summary, signature (tabs for overloads), deprecation, type parameters, parameters, returns, throws, the note's own Markdown, hierarchy, members by kind, "Defined in" |
| Guide | Any note without a `symbol`: plain prose |
| Home | The home note, then one card per module |
| Module | `/folders/:module/` (or your `routes.folders`): symbols grouped by kind with summaries |
| Reference | `/folders/`: every symbol by kind |
| Recently updated | `/feed/` |

The sidebar lists guides first, then each top-level folder as a module with its symbols grouped by kind. "On this page" includes the generated sections.

## Frontmatter

```yaml
description: Wrap a theme manifest so Svartz validates it.   # the summary
symbol:
  kind: function        # namespace, class, interface, type, enum, function, variable
  name: defineTheme
  signatures:           # or `signature` for one
    - "defineTheme(theme: SvartzTheme): () => SvartzTheme"
  typeParameters: [{ name: T, constraint: Record<string, unknown> }]
  parameters:
    - { name: factory, type: "(options?: T) => [[SvartzTheme]]", optional: false, description: … }
  returns: { type: "[[SvartzTheme]]", description: … }
  throws: [{ type: ThemeValidationError, description: … }]
  extends: ["[[Base]]"]
  implements: []
  members:              # for classes and interfaces
    - { name: load, kind: method, signature: "load(): Promise<void>", description: …, static: false }
  source: https://github.com/…/define-theme.ts
  since: 1.0.0
  deprecated: Use `[[VaultView]]`.
```

`[[Name]]` in types and descriptions links to that symbol's note; backticks render as code. The schema is exported as `DocSymbol`. A TypeDoc plugin should emit exactly this shape.

## Develop

```sh
pnpm svartz dev --vault showcase-docs
```

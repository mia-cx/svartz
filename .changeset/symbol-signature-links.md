---
"@svartz/theme-docs": minor
"@svartz/ui": patch
---

Symbol pages link `[[Name]]` in signatures, in member signatures and in type parameter defaults, as they already did in parameter types. A member takes a `default`, shown under its description, so an options interface lists each field's type, default and description:

```yaml
members:
  - { name: mode, kind: property, signature: "mode?: [[Mode]]", default: '`"light"`' }
```

A class with a `constructor` member renders again; it used to fail the build.

A frontmatter wikilink that names a note by its vault path now resolves when the file name has an underscore, as in `[[reference/api/core/CONTRACT_VERSION|CONTRACT_VERSION]]`.

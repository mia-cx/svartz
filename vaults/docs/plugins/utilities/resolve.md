# Link resolution

Internal helpers behind [[plugins/resolve-links]] and recursive embeds.

**Source:** `packages/plugins/src/internal/resolve.ts`

## buildSlugMap

```typescript
function buildSlugMap(
  entries: ReadonlyArray<{ slug: string; path?: string; aliases?: readonly string[] }>,
): Record<string, string>
```

Maps lowercase lookup keys to slugs: canonical slugs, physical paths with and without extensions, unique basenames, and unique aliases. Ambiguous basenames and aliases are left out.

## resolveLink

```typescript
function resolveLink(
  link: RawLink,
  slugMap: Record<string, string>,
  allSlugs: readonly string[],
  strategy: LinkResolutionStrategy,
  sourceSlug: string,
  sources?: readonly { slug: string; path: string }[],
): string | null
```

Returns the target slug, or `null`. A Markdown link tries its path relative to the source note's physical folder first. `sources` supplies that folder when a frontmatter slug moved the note. Every link then tries the slug map, then the `strategy` across matching basenames.

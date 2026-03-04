# @svartz/vault

Obsidian vault traversal and metadata extraction for Svartz. Pure TypeScript, no runtime dependencies beyond `gray-matter` and `commander`.

## API

### `traverseVault(vaultPath: string, options?: TraverseVaultOptions): Promise<VaultFile[]>`

Recursively discovers `.md` files in an Obsidian vault. Skips `.obsidian`, `.git`, `node_modules`, and hidden files. Follows symlinks with loop detection (max depth 4). Supports `include`/`exclude` glob filtering relative to vault root.

```ts
import { traverseVault } from "@svartz/vault";

const files = await traverseVault("/path/to/vault", {
  include: ["projects/**/*.md"],
  exclude: ["projects/archive/**"],
});
// [{ path: "note.md", name: "note", extension: ".md", isDirectory: false }, ...]
```

### `buildIndex(files: VaultFile[], options?: BuildIndexOptions): Promise<Index>`

Builds a complete vault index from discovered files. Single file read per note — frontmatter, links, headings, and metadata extracted in one pass.

```ts
import { traverseVault, buildIndex } from "@svartz/vault";

const files = await traverseVault("/path/to/vault");
const index = await buildIndex(files, { vaultPath: "/path/to/vault" });

// index.notes — IndexEntry[] with slug, title, links, tags, etc.
// index.graph — Record<string, string[]> mapping slug → outgoing link slugs
// index.version — package version string
```

### `BuildIndexOptions`

- `titleField` (`"title"`): Frontmatter field for title
- `descriptionField` (`"description"`): Frontmatter field for description
- `tagsField` (`"tags"`): Frontmatter field for tags
- `aliasesField` (`"aliases"`): Frontmatter field for aliases
- `createdAtField` (`"created_at"`): Frontmatter field for creation date
- `updatedAtField` (`"updated_at"`): Frontmatter field for modified date
- `draftField` (`"draft"`): Frontmatter field for draft status (path mode / legacy behavior)
- `publishedField` (optional): Frontmatter field used for draft inference (`draft = !published`)
- `concurrency` (`10`): Parallel file processing concurrency
- `maxRetries` (`3`): Retries for failed file reads
- `vaultPath` (optional): Absolute vault path for file reads
- `linkResolution` (`"closest"`): Strategy for resolving ambiguous wikilinks
- `include` (`[]`): Include glob patterns for vault file discovery
- `exclude` (`[]`): Exclude glob patterns for vault file discovery

## CLI

```bash
svartz-vault index [vault-ref] [options]

# Path mode (fallback when config is unavailable)
# Default output: .svartz/vaults/<vault-name>/index.json
svartz-vault index vaults/docs

# Custom output
svartz-vault index vaults/docs -o dist/index.json

# Verbose
svartz-vault index vaults/docs -v

# Config mode (vault id from svartz.config)
# Default output: <configDir>/.svartz/vaults/<vault-id>/index.json
svartz-vault index --vault docs
svartz-vault index docs

# Include/exclude patterns (repeatable, relative to vault root)
svartz-vault index vaults/docs \
  --include "projects/**/*.md" \
  --exclude "projects/archive/**"
```

### CLI Mode Behavior

- `index [vault-ref]` and `--vault <id>` both select config vault ids in config mode.
- If both are provided, positional `vault-ref` wins.
- In config mode, vault behavior options come from config and override CLI flag values for include/exclude, frontmatter fields, link resolution, concurrency, and retries.
- `-o/--output` always overrides the output path in both modes.
- Path mode remains available when config cannot be loaded and positional `vault-ref` is a filesystem path (or path-like).

## Index Shape

```ts
interface Index {
  version: string;
  notes: IndexEntry[];
  graph: Record<string, string[]>; // slug → outgoing link slugs
}

interface IndexEntry {
  slug: string;
  title: string;
  path: string;
  frontmatter: FrontmatterData;
  tags: string[];
  aliases: string[];
  draft: boolean;
  description?: string;
  createdAt?: Date;
  modifiedAt?: Date;
  links: string[];         // resolved outgoing slugs (deduplicated)
  externalLinks: string[]; // http/https/mailto URLs
  headings: string[];      // heading texts for TOC/search
  wordCount: number;
  readingTimeMinutes: number;
}
```

## Link Resolution Strategies

When a wikilink like `[[setup]]` could match multiple notes (e.g. `notes/setup`, `projects/setup`), the resolution strategy determines which one wins:

- `closest`: Prefers the candidate sharing the most path segments with the source note. Tiebreaks by depth, then alphabetically. **Default.**
- `shallowest`: Prefers the candidate with the fewest path segments (least nested). Tiebreaks alphabetically.
- `absolute`: Only resolves exact full-path slug matches. Bare basenames that don't match a canonical slug are left unresolved.

Exact slug matches (e.g. `[[projects/setup]]`) always resolve regardless of strategy.

```bash
svartz-vault index vaults/docs --link-resolution shallowest
```

## Error Handling

Throws `VaultError` with typed error codes:

- `VAULT_NOT_FOUND` — vault path doesn't exist
- `INVALID_SLUG_CONFLICT` — two files resolve to the same slug
- `FILE_READ_ERROR` — file read failed after retries
- `PARSE_ERROR` — malformed frontmatter
- `FRONTMATTER_ERROR` — frontmatter extraction failure

## Slugification

Aligned with Quartz conventions:

- Remove file extension
- Replace spaces → `-`, `&` → `-and-`, `%` → `-percent`
- Remove `?` and `#`
- Lowercase all segments

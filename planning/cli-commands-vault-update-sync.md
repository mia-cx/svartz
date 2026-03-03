# CLI: `svartz vault`, `svartz update`, `svartz sync`, and compatibility

## `svartz vault` (replaces Quartz-style "create" for content)

Focused on **vault setup only** (not full project scaffold — that’s `svartz init`).

### Usage

```bash
# New empty vault
svartz vault add my-vault

# Copy from existing path
svartz vault add my-vault --from /path/to/obsidian-vault --strategy copy

# Symlink (content stays in place)
svartz vault add my-vault --from /path/to/obsidian-vault --strategy symlink

# Just register path (no copy/symlink); config gets absolute path
svartz vault add my-vault --from /path/to/obsidian-vault --strategy path
```

### Behavior

- **`add <name>`** — Creates `vaults/<name>/` (empty) or copies/links from `--from`.
- **`--strategy`** — `new` | `copy` | `symlink` | `path`.
  - **`path`** — No copy/symlink; write vault entry in `svartz.config.ts` with absolute path. User’s content stays where it is.
- **Config** — Append new vault to `vaults` array (with sensible default `target` or prompt).
- **Link resolution** — Optional `--links absolute|shortest|relative` for copy/symlink strategies (like Quartz).

### Why separate from `init`

- **`svartz init`** — Scaffolds whole project (apps/web, config, optional default theme, git).
- **`svartz vault`** — Adds or registers a single vault in an existing project. Fits “I already have an Obsidian vault elsewhere” or “add another vault later.”

### `svartz vault config`

Edit or inspect **vault-related** config (the `vaults` array in `svartz.config.ts`).

### Usage

```bash
# Open config in $EDITOR (whole file or scoped to vaults)
svartz vault config edit
svartz vault config edit my-vault

# Show resolved vault config (with defaults)
svartz vault config show
svartz vault config show my-vault
```

### Behavior

- **`edit`** — Open `svartz.config.ts` in `$EDITOR`. Optional vault name to scroll to or highlight that vault's entry.
- **`show`** — Print the `vaults` array (or one vault's entry) with defaults applied. Useful for scripts and sanity-checking.

---

## `svartz update`

Updates Svartz-related dependencies and optionally the CLI / app.

### Scope

- **Themes & components** — e.g. `@svartz/theme-default`, `@svartz/ui` in `apps/web` (and anywhere else they’re referenced).
- **CLI** — If run via global install or `pnpm dlx`, suggest upgrading: `npm update -g svartz` or re-run with latest.
- **apps/web** — Optional: bump SvelteKit, Vite, adapter, etc. (could be a separate command or flag to avoid surprise.)

### Usage (conceptual)

```bash
# Update all svartz deps (themes, @svartz/ui) in the project
svartz update

# Include CLI self-update check
svartz update --cli

# Dry run
svartz update --dry-run
```

### Implementation

- Detect workspace packages that depend on `@svartz/*` (and maybe `svartz`).
- Run `pnpm update @svartz/theme-default @svartz/ui ...` (or equivalent) in the right workspace roots.
- Optional: resolve latest `svartz` from registry and compare with current CLI version; prompt to upgrade.

---

## Compatibility: minimum Svartz version for themes/plugins

Themes and plugins can declare a **minimum compatible Svartz (or apps/web) version**.

### Package.json field

```json
{
  "name": "@svartz/theme-default",
  "version": "1.2.0",
  "svartz": {
    "minVersion": "1.0.0"
  }
}
```

Or use **`engines`**:

```json
{
  "engines": {
    "svartz": ">=1.0.0"
  }
}
```

### Resolving at install / update time

- **CLI** reads project’s Svartz version (from `apps/web` or a root `svartz` version field).
- When adding/updating a theme: fetch package metadata from npm, read `svartz.minVersion` or `engines.svartz`, compare with project version. Warn or fail if incompatible.

### Is fetching package.json from npm trivial?

Yes.

**Option 1: npm view (CLI)**

```bash
npm view @svartz/theme-default version engines
```

**Option 2: Registry API**

```ts
const res = await fetch(
  "https://registry.npmjs.org/@svartz/theme-default/latest",
);
const pkg = await res.json();
const minVersion = pkg.svartz?.minVersion ?? pkg.engines?.svartz;
```

**Option 3: `pacote`** (Node)

```ts
import { packument } from "pacote";
const manifest = await packument("@svartz/theme-default");
const minVersion = manifest["dist-tags"].latest?.svartz?.minVersion;
```

So: fetching metadata is trivial; the only design choice is where to put the field (`svartz.minVersion` vs `engines.svartz`) and whether to enforce on `theme:add` / `update` or only warn.

---

## `svartz sync` (port of Quartz sync)

Git workflow: commit, push, pull to keep the project in sync with GitHub (or another remote).

### Behavior (mirror Quartz)

- **Commit** — Stage and commit local changes (default message or `-m`).
- **Push** — Push to `origin`.
- **Pull** — Pull from `origin` (with optional rebase).

### Usage

```bash
svartz sync
svartz sync --no-push
svartz sync --no-pull
svartz sync -m "Update docs"
```

### Implementation

- Same idea as Quartz: `git add .`, `git commit`, `git push`, `git pull`.
- Low maintenance; no Svartz-specific logic beyond maybe commit message convention and ensuring we’re in the project root (from `findProjectRoot()`).

---

## Summary

| Command                   | Purpose                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **`svartz vault`**        | Add new vault (empty, copy, symlink, or path-only); update config.                                                  |
| **`svartz vault config`** | Edit or show vault-related config (`vaults` in svartz.config.ts).                                                   |
| **`svartz update`**       | Update `@svartz/*` deps (themes, ui); optional CLI/app check.                                                       |
| **Compatibility**         | Themes/plugins declare `svartz.minVersion` or `engines.svartz`; CLI fetches from registry and checks on add/update. |
| **`svartz sync`**         | Git commit + push + pull; direct port of Quartz sync.                                                               |

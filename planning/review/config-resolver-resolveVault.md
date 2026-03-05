# analyze-function: `resolveVault` (resolver.ts)

## Step 1: Understand

**What**: Resolve one vault config into a `ResolvedVaultConfig`: absolute paths, merged defaults, and validation that the vault path exists and is a directory.

**How**: (1) Resolve `vault.path` against `rootDir` to get `absolutePath`. (2) `stat(absolutePath)`; if not a directory, yield `VaultPathInvalid`. (3) Resolve `outDir` (vault → defaults → `.svartz/vaults/${vault.id}`). (4) Build result object: `id`, `path`, `outDir`, then include/exclude/linkResolution/theme/frontmatter/target with vault ?? vaultDefaults ?? hardcoded defaults (using `mergeThemes`, `mergeFrontmatter`).

**Inputs/outputs**: `(vault: VaultConfig, defaults: SvartzDefaults | undefined, rootDir: string) => Effect.Effect<ResolvedVaultConfig, VaultPathInvalid>`. Side effects: `stat(absolutePath)` (filesystem).

---

## Step 2: Find usage

**Count**: 1 call site.

**Locations**: `packages/config/src/resolver.ts` — inside `resolveConfigPathsEffect` (line 134): `Effect.forEach(config.vaults, (vault) => resolveVault(vault, config.defaults, rootDir), { concurrency: 1 })`.

**Usage**: Caller uses the return value (array of `ResolvedVaultConfig` from the forEach).

---

## Step 3: Evaluate

- **Inlining**: Single call site, but body is ~45 lines and encodes a clear domain step (“resolve one vault”). Inlining into `resolveConfigPathsEffect` would bloat it. **Do not inline.**

- **DRY**: Same “vault options + defaults” pattern appears in two places:
  - **resolveVault** return object: `include: vault.include ?? vaultDefaults?.include ?? DEFAULT_INCLUDE`, same for `exclude`, `linkResolution`.
  - **resolveConfigPathsEffect** when building `defaults.vault`: `include: vaultDefaults?.include ?? DEFAULT_INCLUDE`, same for `exclude`, `linkResolution`.
  A single `DEFAULT_VAULT_OPTIONS` (include, exclude, linkResolution) and spread (`{ ...DEFAULT_VAULT_OPTIONS, ...vaultDefaults?.include etc }` or a small helper) could unify these and make adding new default vault options one place. Theme/frontmatter already use merge helpers; include/exclude/linkResolution are the only ones still inlined with `??` chains.

- **DI**: Uses module-level `DEFAULT_*` constants and `stat` from `node:fs/promises`. No need for DI for testability here; the Effect is already testable by passing a mock or by testing against a real fs in tests.

- **Strategy / conditionals**: One conditional (path exists and is directory); no type/mode switch. **N/A.**

- **Export surface**: `resolveVault` is not exported; only used inside `resolveConfigPathsEffect`. **Correct.**

---

## Step 4: Recommend

1. **Optional — DRY vault defaults**: Introduce a shared default for vault-level options (include, exclude, linkResolution) and use spread in both `resolveVault` and `resolveConfigPathsEffect` when building vault/defaults.vault, so both places stay in sync and new default options are added once. Low priority; current code is clear.

2. **No other changes**: Keep `resolveVault` as a named, private Effect; it’s a clear domain unit and not a thin wrapper. No inlining, no export change.

---

**Summary**: One internal use; purpose is clear. Only actionable follow-up is optional DRY for vault default options (include/exclude/linkResolution) between resolveVault and resolveConfigPathsEffect.

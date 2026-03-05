# packages/config — function naming workshop

Space to propose and compare names for the public and internal APIs. Add alternatives under each section; note rationale and any breaking-change impact.

---

## Current names (reference)

| Current name | What it does | Promise / Effect / Pure |
|--------------|---------------|--------------------------|
| `runEffect` | Runs an Effect, returns Promise; throws tagged error on failure | boundary adapter |
| `loadConfig` | Find config file → import → decode; returns `{ config, configDir }` | Promise |
| `parseConfig` | Parse (validate) raw object against schema + version; returns `SvartzConfig` | Promise |
| `resolveConfigPaths` | Resolve vault paths, merge defaults, validate vault dirs exist → `ResolvedSvartzConfig` | Promise |
| `getVault` | Look up one vault by id from resolved config | Promise |
| `listVaults` | Return `VaultSummary[]` from resolved config | Pure |
| `defineConfig` | Identity helper for config files (type preservation) | Pure |

Effect variants: `loadConfigEffect`, `parseConfigEffect`, `resolveConfigPathsEffect`, `getVaultEffect` (same names + `Effect` suffix).

---

## Load / decode

**`loadConfig`** — find file, import, decode  
- Alternatives:  
- Notes:  

**`parseConfig`** — parse (validate) raw → `SvartzConfig`  
- Alternatives:  
- Notes:  

---

## Resolve / paths

**`resolveConfigPaths`** — config + configDir → resolved config (paths, defaults, vault dirs)  
- Alternatives:  
- Notes:  

---

## Vaults

**`getVault`** — (resolvedConfig, vaultId) → resolved vault  
- Alternatives:  
- Notes:  

**`listVaults`** — (resolvedConfig) → vault summaries  
- Alternatives:  
- Notes:  

---

## Helpers / boundary

**`runEffect`** — Effect → Promise (internal boundary; might stay internal)  
- Alternatives:  
- Notes:  

**`defineConfig`** — identity for config file default export  
- Alternatives:  
- Notes:  

---

## Effect suffix convention

Current: Promise API has “clean” names; Effect API adds `Effect` suffix.  
- Keep / drop / rename (e.g. `loadConfigFromEffect`, `loadConfigAsync`)?  
- Notes:  

---

## Summary (fill after decisions)

| New name | Replaces | Rationale |
|----------|----------|-----------|
|          |          |           |

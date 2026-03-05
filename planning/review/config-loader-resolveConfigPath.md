# analyze-function: `resolveConfigPath` (loader.ts)

## Step 1: Understand

**What**: Resolve the config file path from an explicit path or by searching upward from CWD. Respects `SVARTZ_CONFIG` env var.

**How**: If `configPath` or `SVARTZ_CONFIG` is set, resolve it (relative to CWD if relative), check file exists, return or throw `ConfigNotFound`. Otherwise call `searchUpward(process.cwd())`; if nothing found, throw `ConfigNotFound`.

**Inputs/outputs**: `(configPath?: string) => Effect.Effect<string, ConfigNotFound>`. Side effects: reads `process.env["SVARTZ_CONFIG"]`, filesystem via `fileExists` and `searchUpward`.

---

## Does it search until `/`?

**Yes.** `searchUpward` (in `utils/path-resolver.ts`) walks up with `dir = dirname(dir)` and stops when `parent === dir || parent === root` (where `root` is the fs root when `dirname(dir) === dir`). So it climbs from `process.cwd()` up to the filesystem root; if no `svartz.config.{ts,js,mjs}` is found in any directory along the way, it returns `null` and `resolveConfigPath` fails with `ConfigNotFound`.

---

## Step 2: Find usage

**Count**: 1 call site.

**Locations**: `packages/config/src/loader.ts` — only inside `loadConfig` (line 116): `const resolvedPath = yield* resolveConfigPath(configPath);`

**Usage**: Caller uses the return value (resolved absolute path string).

---

## Step 3: Evaluate

- **Inlining**: Single call site, body ~20 lines. Inlining would bloat `loadConfig`; the name “resolve config path” is a clear domain step. **No inlining.**
- **DRY**: No duplicate “find config file” logic found elsewhere.
- **DI / globals**: Uses `process.env["SVARTZ_CONFIG"]` and `process.cwd()` directly. Testability could improve by injecting (cwd, env) or a small context; only worth it if we need to test “env override” vs “explicit path” vs “search” in isolation.
- **Strategy / conditionals**: Straightforward branching (explicit path vs search). No table-driven opportunity.
- **Export**: Not exported; internal to loader. **Correct.**

---

## Step 4: Recommend

### Product decision (no code changes in this file)

**Omit `searchUpward` entirely.** Config resolution should be explicit:

- Config is either **in the CWD** of the current CLI process (e.g. `./svartz.config.js` or a single well-known name in CWD), or
- Caller provides a **path** to the config (absolute or relative to CWD).

We do **not** climb the directory tree to discover a config. That simplifies behavior, avoids surprising “found a config in a parent repo” and keeps the contract: “you tell us where the config is, or it’s here.”

### Implementation notes (for a future change)

1. **Behavior**: When no explicit path and no `SVARTZ_CONFIG`:
   - Option A: Look only in CWD for a single well-known name (e.g. `svartz.config.{ts,js,mjs}` in `process.cwd()`). No upward search.
   - Option B: Require an explicit path (or env) and never default to CWD; fail with a clear “provide config path or set SVARTZ_CONFIG” message.

2. **Code**: Remove or bypass `searchUpward`; in `resolveConfigPath`, the “no explicit path” branch becomes “look in CWD only” (Option A) or “fail” (Option B). `searchUpward` in `path-resolver.ts` can be deleted or left unused once loader no longer calls it.

3. **Tests**: Update loader tests that rely on “search upward from fixture dir”; point them at an explicit path or CWD-only resolution.

---

**Summary**: One internal use; no export change. Recommend dropping upward search and resolving only from explicit path or CWD, per product decision above. No code changes made here; this file is for review and planning.

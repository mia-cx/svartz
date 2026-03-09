# Coverage baseline audit

Baseline captured after adding `@vitest/coverage-v8` and `test:coverage` to all targeted workspaces. Execution order: config → core → plugins → vite → cli → ui → themes/minimal → apps/web.

Excluded from this audit: `packages/vault (old, to be superseded)`, `packages/reference`.

---

## Coverage workflow (repeatable)

### Commands

- **From repo root (all targeted workspaces):**  
  `pnpm test:coverage`  
  (Runs Turbo task `test:coverage`; only workspaces that define this script are run. Build runs first via `dependsOn: ["build"]`.)

- **Per workspace:**  
  From the workspace directory (e.g. `packages/config`):  
  `pnpm test` — run tests  
  `pnpm test:coverage` — run tests with V8 coverage and print a summary (and write `coverage/` if reporters include `html`).

- **Install rule:** Use `pnpm i -D @vitest/coverage-v8` (or add to `package.json` and run `pnpm i` from root). Do not use `pnpm add`.

### In-scope workspaces

These have `test:coverage` and are included in the coverage rollout:

- `packages/config`
- `packages/core`
- `packages/plugins`
- `packages/vite`
- `packages/cli`
- `packages/ui`
- `themes/minimal`
- `apps/web`

### Exclusions (out of scope)

- **`packages/vault (old, to be superseded)`** — Defunct; not updated with coverage tooling.
- **`packages/reference`** — Upstream Quartz; uses `tsx --test`, not Vitest. Do not add Vitest or coverage-v8 there.

### Accepted non-goals (first rollout)

- **No coverage thresholds** in config (e.g. `coverage.lines: 80`) until baseline is stable; report-first only.
- **Vitest major alignment** — Do not combine this rollout with upgrading Vitest 3 → 4; keep majors per workspace as-is.
- **Type-only / barrel files** — Files that only re-export types (e.g. `src/types/*.ts` barrels) may show 0%; exclude in config or document as accepted.
- **CLI subprocess coverage** — CLI E2E runs built binary in a subprocess; 0% source coverage from that is expected. Improve via unit tests for extracted helpers.
- **apps/web standalone build** — Root `pnpm build` can fail for `apps/web` (virtual:svartz/theme injected by CLI at dev/build). Run tests from inside `apps/web` when verifying.

### Config locations

- **packages/config:** `packages/config/vitest.config.ts` — `test.coverage.provider: "v8"`.
- **packages/ui, themes/minimal, apps/web:** `test.coverage` in each app’s `vite.config.ts` (same provider + reporters).
- **Other packages:** No standalone vitest config; `vitest run --coverage` uses defaults and picks up `@vitest/coverage-v8` when installed.

---

## 1. packages/config

| Metric     | Value  |
|-----------|--------|
| Statements| 91.16% |
| Branches  | 86.45% |
| Functions | 92%    |
| Lines     | 91.16% |

**Top uncovered / classification**

| File | Coverage | Why uncovered |
|------|----------|----------------|
| `src/loader.ts` | 77.14% stmts | Lines 78, 93–112, 129–132: error paths / edge cases |
| `src/types/config.ts`, `resolved.ts`, `tailwind.ts`, `wrangler.ts` | 0% | Barrel/type-only re-exports; no executable code (acceptable to exclude) |
| `src/utils/merge-version.ts` | 73.46% stmts, 36.36% branch | Branches 48, 54–57, 65–68: missing branch tests |
| `src/resolver.ts` | 100% stmts, branches 137, 174 uncovered | Edge branches |

---

## 2. packages/core

| Metric     | Value  |
|-----------|--------|
| Statements| 90.58% |
| Branches  | 87.65% |
| Functions | 94.23% |
| Lines     | 90.58% |

**Top uncovered / classification**

| File | Coverage | Why uncovered |
|------|----------|----------------|
| `src/types.ts`, `src/tailwind/types.ts`, `src/wrangler/types.ts` | 0% | Type-only re-exports (acceptable to exclude) |
| `src/plugin/utils.ts` | 65.44% stmts, 70% funcs | 22–46, 63–64, 68–76, 90–91, 95–125, 142–144: validation/helper paths |
| `src/plugin/runner.ts` | 87.98% | 60–61, 135–141, 194–195, 208–209, 227–230, 239–241, 245–246, 253–254, 259–260, 291–292: error-path / lifecycle |
| `src/plugin/schema.ts` | 95.79% | 133–137: schema branch |
| `src/theme/route-matcher.ts` | 91.85% | 32, 96–101, 131–135: edge branches |
| `src/theme/define-theme.ts` | 100% stmts, branch 30 | Single uncovered branch |

---

## 3. packages/plugins

| Metric     | Value  |
|-----------|--------|
| Statements| 69.74% |
| Branches  | 75.33% |
| Functions | 67.21% |
| Lines     | 69.74% |

**Top uncovered / classification**

| File | Coverage | Why uncovered |
|------|----------|----------------|
| `src/discover-files.ts` | 18.07% | 17–19, 26–103: main discovery logic (missing tests) |
| `src/transform-ofm.ts` (transform-embeds) | 17.67% | 30–98, 105–225: embed transform logic |
| `src/transform-toc.ts` | 58.82% | 16–23: default export / entry |
| `src/internal/datetime.ts` | 32.25% | 12–13, 16–27, 33–40: date parsing branches |
| `src/internal/ignore.ts` | 36.84% | 19–23, 28–49: ignore-list logic |
| `src/internal/parse.ts` | 61.62% | 131–162, 165–213: frontmatter/parse edge cases |
| `src/emit-artifacts.ts` | 92.93% | 163–175, 183–184: artifact emit edge paths |
| `src/resolve-links.ts` | 74.31% | 55% branches, 88–90, 101–108 |
| `src/transform-description.ts` | 83.33% | 28–32: branches |
| `transform-gfm.ts`, `transform-latex.ts`, `transform-syntax.ts` | 90% | Line 16: default-export / wrapper (minor) |

---

## 4. packages/vite

**Status:** Pre-existing test failures (2 failing tests). No stable baseline.

- `tests/artifacts.test.ts`: assertion on generated source shape (expected vs actual export list).
- `tests/index.test.ts`: `ENOENT: mkdir '/workspace'` — test environment path assumption.

**Classification:** Test infrastructure / environment; fix tests first, then re-run coverage.

---

## 5. packages/cli

| Metric     | Value |
|-----------|-------|
| Statements| 0%   |
| Branches  | 0%   |
| Functions | 0%   |
| Lines     | 0%   |

**Why:** Single E2E test runs the built CLI in a subprocess (`node packages/cli/dist/index.js build`). Source is not exercised in-process, so V8 coverage is 0%.

**Classification:** Subprocess limitation. Plan: extract testable helpers (argument parsing, vault selection, error handling) and add unit tests; keep E2E as smoke test.

---

## 6. packages/ui

| Metric     | Value |
|-----------|-------|
| Statements| 0%   |
| Branches  | 0%   |
| Functions | 0%   |
| Lines     | 0%   |

**Why:** Two Vitest projects (client + server). Coverage report showed only `+page.svelte` at 0%; likely only one project’s coverage is reported or src paths not fully included in coverage scope.

**Classification:** Browser/server split; coverage merge or include settings may need adjustment. Add tests for route/helper logic to raise meaningful coverage.

---

## 7. themes/minimal

| Metric     | Value |
|-----------|-------|
| Statements| 0%   |
| Branches  | 0%   |
| Functions | 0%   |
| Lines     | 0%   |

**Why:** Same as packages/ui — client + server projects; reported coverage minimal (e.g. `+page.svelte` only).

**Classification:** Same as ui; test logic in `.ts`/`.svelte` first.

---

## 8. apps/web

| Metric     | Value  |
|-----------|--------|
| Statements| 66.66% |
| Branches  | 63.04% |
| Functions | 79.16% |
| Lines     | 65.33% |

**Top uncovered / classification**

| File | Coverage | Why uncovered |
|------|----------|----------------|
| `src/lib/svartz/SvartzRuntimePage.svelte` | 59.25% stmts | 33–136, 141–144: rendering/route branches |
| `src/lib/svartz/testing/StubNotFoundPage.svelte` | 0% | Test stub; low priority |
| `src/lib/svartz/testing/StubPage.svelte` | 90.9% stmts, 50% funcs | 13–19: stub branches |
| `StubLayout.svelte` | 100% | Covered |

---

## Summary for test-writing pass

- **config, core:** High baseline (~90%+). Close gaps in loader/utils/runner/route-matcher and optionally exclude type-only barrels.
- **plugins:** Lowest baseline (~70%). Prioritize discover-files, transform-ofm (embeds), internal (datetime, ignore, parse), then resolve-links and transform-*.
- **vite:** Fix the two failing tests and re-run coverage before investing in new tests.
- **cli:** Add unit tests for extracted helpers; accept 0% from E2E-only for now.
- **ui, themes/minimal:** Confirm coverage include/merge for multi-project setup; add tests for route and shared logic.
- **apps/web:** Add tests for SvartzRuntimePage branches and any shared runtime logic; stubs are low priority.

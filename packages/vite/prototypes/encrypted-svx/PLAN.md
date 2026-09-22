# Throwaway encrypted SVX prototype

Question: can a static SvelteKit site decrypt and dynamically import an interactive SVX note with imported components, scoped CSS, and an attachment?

Mia authorized this investigation to preserve SSG. This is a bounded compiler/browser experiment, not production encryption implementation or UI design.

1. Build a protected SVX entry separately in memory, including its private dependencies.
2. Encrypt its JS, extracted CSS, and attachment in one authenticated payload.
3. Prerender a public shell that decrypts, imports a blob module, and mounts it.
4. Verify locked/wrong-password/tampered/unlocked states, navigation cleanup, and public output isolation.

- [x] Tests: nine output/browser checks pass against adapter-static files in Chromium through CDP.
- [x] Capture Knowledge: README records bundle isolation, CSP, runtime duplication, and untested integration cases.
- [x] Documentation: README documents commands, verdict, attempts, sources, and limits; results.json captures the checks.
- [x] Review & Close: reviewed output isolation and browser evidence; preserve this experiment on `prototype/encrypted-svx-ssg` for the linked encryption decision.

Scope limits: one note/group fixture; standalone Svelte runtime inside the protected bundle; no arbitrary import graph rewriting. This tests feasibility, not the final package API.

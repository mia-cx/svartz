# Throwaway encrypted SVX prototype

## Host integration extension

Question: can protected SVX use host reactive props, context, shared context helpers, and SvelteKit client APIs without publishing protected source?

Mia authorized investigation before further product questions. Work only on `prototype/encrypted-svx-host`; preserve the original SSG proof.

1. Compare isolated Svelte with an explicit host-runtime bridge.
2. Probe reactive props/context, callbacks, an imported host component, routing, and teardown.
3. Scan public output and retain password/tamper/CSP checks.
4. Record evidence and limits without claiming arbitrary dependency support.

- [x] Tests: 11 shared-runtime checks and four isolated-control checks pass, including output scans.
- [x] Capture Knowledge: README distinguishes evidence from remaining production work.
- [x] Documentation: commands and machine-readable results captured for the decision ticket.
- [x] Review & Close: prototype diff and screenshots reviewed; preserve source on the isolated branch with production untouched.

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

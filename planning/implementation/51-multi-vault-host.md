# #51 Compose mounted vaults in one SvelteKit host

## Outcome

A host build reads all configured host vaults once, keeps each vault's theme and artifacts separate, and routes by non-overlapping mount paths. Standalone single-vault builds remain compatible.

## TODOs

- [x] Tests: reject duplicate/overlapping host mounts and prove a two-vault host build/dev route plus asset isolation.
- [x] Create one generated host registry of per-vault runtime modules; let the shared runtime and catchall resolve routes from it.
- [x] Run all selected host vault pipelines in one Vite build/dev session with mount-scoped assets and themes.
- [x] Update CLI build, dev, preview, init integration, and host watch setup for composed host vaults.
- [x] Capture Knowledge: record host registry and mount ownership in a scoped rule.
- [x] Documentation: explain multi-vault host config and `--vault` behavior.
- [x] Review & Close: build, test, run a packed host consumer, and file the stacked PR.

## Constraints

Manual SvelteKit routes win. The host owns its adapter and Kit base. Reject overlapping mounts, including root plus a child. No content or assets cross vaults. This follows #47 and does not change UI design.

Packed validation: seven local `pnpm pack` tarballs installed into a clean npm SvelteKit host outside the repository. Its Node adapter build, served output, and Vite preview returned distinct `/blog/` and `/work/` content. `/blog/missing` returned 404. Workspace `pnpm build` passed (7 tasks); final `pnpm test` passed (16 tasks), including the two-vault host and clean docs builds. Svelte checks retain the pre-existing duplicate Vite and missing Paraglide fixture errors.

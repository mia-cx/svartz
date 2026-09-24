# #50 Encrypted SVX publication

Keep the site static. Compile protected `.svx` and its private dependencies outside the public Vite graph, encrypt authenticated payloads, and mount them with the host's Svelte runtime after a group unlock. A missing password fails the build before any public output is written.

## Standing checks

- [x] Tests: publication boundary, password failures/tampering, assets, imports, route lifecycle, output scans, and representative standalone/host builds.
- [x] Capture knowledge: record the protected graph, bridge, CSP, and stale-output rules in `.cursor/rules/`.
- [x] Documentation: author password-group config, frontmatter, CSP, and unlock behavior in `docs/encrypted-notes.md`.
- [ ] Review & Close: generated outputs and trust boundaries reviewed locally; request independent security review before release.

## Review follow-up

- [x] Tests: reproduce and cover the security and publication findings on PR #65.
- [x] Capture Knowledge: correct the protected-publication rule and record the query-import boundary.
- [x] Documentation: correct CSP and relock guarantees for host consumers.
- [ ] Review & Close: resolve actionable PR threads, rerun focused and consumer checks, push the clean branch.

## Implementation slices

1. [x] Define and validate password groups and protected note metadata. Missing group or password fails closed; a protected build remains blocked until the encrypted emitter is ready.
2. [x] Split public and protected indexes, embeds, assets, and discovery before public emission. Hidden routes stay reachable without index entries.
3. [x] Compile and encrypt executable SVX module graphs, CSS, and assets without writing plaintext output or source maps.
   - [x] Share one versioned AES-GCM/PBKDF2 envelope between build and browser code, with password, tamper, and route-binding tests.
   - [x] Compile transformed group notes and nested Svelte imports in memory; reject server-only, cross-group, and unpublished-note imports.
   - [x] Bundle static client-safe imports and classify protected attachments; fail on unsupported imports or compiler assets.
   - [x] Encrypt note modules, CSS, assets, and group discovery before public emission.
4. [x] Bridge the host SvelteKit runtime and client-safe imports with live semantics. Reject transitive server-only imports.
   - [x] Generate host-owned runtime facade modules and record bridge imports inside the sealed group payload.
   - [x] Verify that Vite keeps facade exports and their module URLs in a client build.
   - [x] Prove shared Svelte context and encrypted blob imports in a built SvelteKit host.
5. [x] Unlock/relock the group in the browser; keep session keys in memory and merge protected search/graph only for the session.
   - [x] Add the shared in-memory session and versioned decrypted payload shape.
   - [x] Add a minimal unlock form, browser blob import, group reuse/relock, and private attachment object URLs.
   - [x] Merge protected search/graph after unlock and remove them on relock.
   - [x] Verify image, CSS, nested component interaction, and SvelteKit navigation in a mounted host.
   - [x] Check responsive image, media poster, image/link URLs, and static-browser CSP.
6. [x] Run wrong-password, tampering, CSP, navigation, repeated-mount, host, adapter, and output-scan acceptance checks.

## Notes

The two prototype branches prove static encryption and shared-runtime feasibility, but use fixed imports and a throwaway global registry. Production must classify imports and own the bridge internally. The public Vite graph eagerly imports note artifacts, so protected notes must enter it only as locked shells.

The public index and eager artifact graph now use redacted locked entries and shell components. Protected-only attachments stay out of public assets; full note metadata and protected asset membership remain build-local. The encrypted emitter and browser unlock path must consume that build-local data before the fail-closed publication guard can be lifted.

The Vite plugin packages protected groups after the public emitter and writes ciphertext only. A build-local token links locked shells to their sealed group payload without exposing the group name. The compiler rejects unclassified output assets and imports. The production publication guard is open after static and host acceptance; standalone filter calls still fail closed without the Vite pipeline.

The browser loader unlocks and mounts a protected component with its host bridge, rewrites rendered attachment links to private blob URLs, and merges group search/graph for that page session. Hidden protected notes remain unlisted. Adapter-static and adapter-node scans cover generated artifacts, SvelteKit output, and public files. The host browser test covers wrong password, shared Svelte context, `$app/state`, nested component interaction, scoped CSS, a private image, search visibility, navigation/remount, relock, and stale-output cleanup. Static Chromium acceptance covers the generated CSP and independent group unlock/relock. Independent security review remains before release.

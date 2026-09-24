# #50 Encrypted SVX publication

Keep the site static. Compile protected `.svx` and its private dependencies outside the public Vite graph, encrypt authenticated payloads, and mount them with the host's Svelte runtime after a group unlock. A missing password fails the build before any public output is written.

## Standing checks

- [ ] Tests: publication boundary, password failures/tampering, assets, imports, route lifecycle, output scans, and representative standalone/host builds.
- [ ] Capture knowledge: record the protected graph, bridge, CSP, and stale-output rules in `.cursor/rules/`.
- [ ] Documentation: author password-group config, frontmatter, CSP, and unlock behavior.
- [ ] Review & Close: inspect every output category and request security review before release.

## Implementation slices

1. [x] Define and validate password groups and protected note metadata. Missing group or password fails closed; a protected build remains blocked until the encrypted emitter is ready.
2. [ ] Split public and protected indexes, embeds, assets, and discovery before public emission. Hidden routes stay reachable without index entries.
3. [ ] Compile and encrypt executable SVX module graphs, CSS, and assets without writing plaintext output or source maps.
4. [ ] Bridge the host SvelteKit runtime and client-safe imports with live semantics. Reject transitive server-only imports.
5. [ ] Unlock/relock the group in the browser; keep session keys in memory and merge protected search/graph only for the session.
6. [ ] Run wrong-password, tampering, CSP, navigation, repeated-mount, host, adapter, and output-scan acceptance checks.

## Notes

The two prototype branches prove static encryption and shared-runtime feasibility, but use fixed imports and a throwaway global registry. Production must classify imports and own the bridge internally. The public Vite graph eagerly imports note artifacts, so protected notes must enter it only as locked shells.

The public index and eager artifact graph now use redacted locked entries and shell components. Protected-only attachments stay out of public assets; full note metadata and protected asset membership remain build-local. The encrypted emitter and browser unlock path must consume that build-local data before the fail-closed publication guard can be lifted.

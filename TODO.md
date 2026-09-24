# Svartz v1 status

The v1 backend is implemented in the pull request stack above [#16](https://github.com/mia-cx/svartz/pull/16), through [#70](https://github.com/mia-cx/svartz/pull/70). It is not yet integrated into `sveltekit-rewrite`. [#17](https://github.com/mia-cx/svartz/issues/17) tracks that integration.

The backend stack includes publication filtering, configurable Markdown plugins, canonical routes, multi-vault SvelteKit hosts, `npx svartz init`, static discovery outputs, package archives, content overrides, analytics, encrypted SVX, and lazy theme pages. The seven v1 archives use MCX v1.0. Packed fresh and host consumers have been tested; no package has been published to npm.

The shared UI and first-party themes are being built separately under [#21](https://github.com/mia-cx/svartz/issues/21). Do not treat the old `feat/mvp-launch` demo UI as the finished v1 theme.

## Still required for v1

- Review and integrate the backend PR stack in order, then incorporate the finished UI branch. Keep host routes, adapters, plugin hooks, and vault privacy intact.
- Revalidate the integrated branch with serial builds, tests, a public-URL static build, a mounted host build, and packed consumers. See [#17](https://github.com/mia-cx/svartz/issues/17).
- Finish the shared UI and first-party theme handoff in [#21](https://github.com/mia-cx/svartz/issues/21).
- Keep npm publication and deployment as separate release actions after integration. The docs vault has no public URL in the repository config.

## After v1

- Community translations and a translation platform: [#24](https://github.com/mia-cx/svartz/issues/24).
- Community plugin/theme browser and management commands: [#35](https://github.com/mia-cx/svartz/issues/35).
- Vite+ migration after GA: [#15](https://github.com/mia-cx/svartz/issues/15).
- Obsidian sync plugin: [#12](https://github.com/mia-cx/svartz/issues/12).

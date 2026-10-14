# Svartz v1 status

The backend stack from [#16](https://github.com/mia-cx/svartz/pull/16) through [#70](https://github.com/mia-cx/svartz/pull/70) is merged.
The theme stack from [#168](https://github.com/mia-cx/svartz/pull/168) through [#172](https://github.com/mia-cx/svartz/pull/172) is merged.
Both are integrated into `sveltekit-rewrite`.

The backend includes publication filtering, Markdown plugins, canonical routes, multi-vault hosts, and `npx svartz init`.
It includes discovery outputs, content overrides, analytics, encrypted SVX, and lazy theme pages.
The shared UI and five first-party themes ship with eleven public MCX v1.0 archives.
No v1 package has been published to npm.

## Still required for v1

- [#173](https://github.com/mia-cx/svartz/issues/173). Build note URLs from the slug property before the file name.
- [#174](https://github.com/mia-cx/svartz/issues/174). Render one note's body inside a host-owned page.
- [#175](https://github.com/mia-cx/svartz/issues/175). Release packages with Changesets and publish from CI. Implementation is ready for review.
- [#17](https://github.com/mia-cx/svartz/issues/17). Run the integrated v1 acceptance pass.

The acceptance pass covers serial workspace checks, public URL output, mounted host routes, hydration, and packed consumers.
Keep npm publication and deployment as separate actions.
The docs vault has no public URL in the repository config.

## After v1

- Community translations and a translation platform. [#24](https://github.com/mia-cx/svartz/issues/24).
- Community plugin and theme browsing and management. [#35](https://github.com/mia-cx/svartz/issues/35).
- Vite+ migration after GA. [#15](https://github.com/mia-cx/svartz/issues/15).
- Obsidian sync plugin. [#12](https://github.com/mia-cx/svartz/issues/12).

# Next steps for v1

The backend stack #16 through #70 and the theme stack #168 through #172 are merged into `sveltekit-rewrite`.

1. Finish [#173](https://github.com/mia-cx/svartz/issues/173), which makes the slug property control note URLs.
2. Finish [#174](https://github.com/mia-cx/svartz/issues/174), which embeds a note body in a host-owned page.
3. Review [#175](https://github.com/mia-cx/svartz/issues/175), which adds Changesets, workspace CI, and trusted npm publication.
4. Run the [#17](https://github.com/mia-cx/svartz/issues/17) acceptance pass on the integrated branch.
5. Complete the [one-time npm setup](docs/releasing.md#one-time-setup) before the first automated release.

The acceptance pass covers workspace checks, public URL metadata, 404 and asset output, mounted routes, hydration, and packed consumers.
npm publication and production deployment remain separate actions.
No v1 package has been published or deployed.

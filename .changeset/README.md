# Changesets

Run `pnpm changeset` with each public package change.
Select the affected package and write a short release note.
Commit the generated Markdown file in your implementation PR.

All twelve public packages share one fixed version group.
Private workspace packages are ignored.
CI requires a changeset for public package source, theme source, and the CLI template.
Use the `no changeset` label when a change needs no release note.

The bot collects notes in `changeset-release/sveltekit-rewrite`.
Review and merge that PR to validate, publish, tag, and create the combined GitHub release.
The action only creates the PR. Publication runs separately through npm trusted publishing.

Releases stay on the major version `RELEASE_LINE` names in `scripts/release-packages.mjs`. A `major` declaration passes validation only while the packages are below that line, so a new major release starts by raising it.

See [release setup and retries](../docs/releasing.md).

# `@svartz/plugin-history`

Every published page's history, with the diff between any two revisions, Recent changes for the whole wiki, and each account's contributions. Read from the GitHub mirror that `@svartz/plugin-submissions` keeps with `sync` set, which the vault needs.

```ts
import { history } from "@svartz/plugin-history";

plugins: [auth({ … }), submissions({ repo, app, sync: { … } }), history()]
```

Pages: `/-/history/<page>`, `/-/changes/` and `/-/contributions/<handle>/`, in the theme's shell, with a **History** action beside Edit and a Contributions section below each user page. Moderators holding `history:reverts:write` revert a page to an earlier revision from its history. What they show, what stays out, and how far back they go: [docs/history.md](../../docs/history.md).

A blog or any other vault, on any target, can instead publish the previous versions of the notes that set `versions: true`, read from its own git repository when it builds and prerendered like notes:

```ts
plugins: [history({ source: "git" })]
```

See [Previous versions from git](../../docs/history.md#previous-versions-from-git).

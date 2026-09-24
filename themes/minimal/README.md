# @svartz/theme-minimal

Publish an Obsidian vault the way Quartz does, in the Svartz design language: an explorer, search, a link graph, contents, and backlinks around the note.

```ts
// svartz.config.ts
export default defineConfig({
  defaults: { theme: "@svartz/theme-minimal" },
  vaults: [{ id: "notes", path: "vault", target: { type: "static" } }],
});
```

## What it renders

| Area | Contents |
| --- | --- |
| Left | Site name, search (Ctrl/⌘ K, `#tag` filter), light/dark toggle, reader mode, explorer |
| Centre | Breadcrumbs, title, date and reading time, tags, the note, Giscus comments when configured |
| Right | Local graph (Ctrl/⌘ G opens the whole vault), contents with scroll tracking, backlinks |
| Lists | `/tags/`, `/tags/:tag/`, `/folders/`, `/folders/:path/`, `/feed/`, and a 404 page |

Below 1200px the right column moves under the note and the contents hide. Below 800px the left column becomes a top bar and the explorer a drawer. Internal links show a preview on hover.

Callouts, code, embeds, math, footnotes, and task lists use the shared `@svartz/ui` content components, so they look the same in every first-party theme. See `DESIGN.md` at the repository root.

## Settings

Set these on the vault's `theme`:

```ts
theme: {
  base: "@svartz/theme-minimal",
  routes: { tags: "tags", folders: "folders", feed: "feed" },
  footer: { links: { GitHub: "https://github.com/you/notes" } },
  comments: { repo: "you/notes", repoId: "R_…", category: "Comments", categoryId: "DIC_…" },
}
```

Comments need all four Giscus ids; a note with `comments: false` hides them. See `docs/comments-and-analytics.md`.

## Develop

Preview with real content from the repository root:

```sh
pnpm svartz dev --vault showcase
```

`vaults/showcase` uses every Obsidian Markdown feature the theme renders.

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
| Centre | Breadcrumbs, title, date and reading time, tags, the note, previous and next pages in explorer order, Giscus comments when configured |
| Right | Local graph (the expand button opens the whole vault), contents with scroll tracking, backlinks |
| Lists | `/tags/`, `/tags/:tag/`, `/folders/`, `/folders/:path/`, `/feed/`, and a 404 page |

The explorer lists folders, then notes, each by title. An `order` number in a note's frontmatter sorts it first, lowest first; a folder takes the `order` of its folder note (`index.md` or `_index.md`).

Below 1200px the right column moves under the note and the contents hide. Below 800px the left column becomes a top bar and the explorer a drawer. Internal links show a preview on hover.

Callouts, code, embeds, math, footnotes, and task lists use the shared `@svartz/ui` content components, so they look the same in every first-party theme. See `DESIGN.md` at the repository root.

## Extending minimal

Every first-party theme extends minimal: this layout is the shell they all share. A theme swaps the frame or any region (header, explorer, page head, right column, page foot, footer), adds page renderers chosen by frontmatter, and switches minimal's furniture on or off; everything it doesn't change stays minimal's. `composeThemes` combines several themes in one site, and each page's `theme:` frontmatter, its folder note's, or its metadata picks which one renders it. [Composing themes](../../docs/composing-themes.md) has the contract.

## Settings

Set these on the vault's `theme`:

```ts
theme: {
  base: "@svartz/theme-minimal",
  routes: { tags: "tags", folders: "folders", feed: "feed" },
  logo: { src: "/logo.svg", dark: "/logo-dark.svg" },
  footer: { links: { GitHub: "https://github.com/you/notes" } },
  comments: { repo: "you/notes", repoId: "R_…", category: "Comments", categoryId: "DIC_…" },
}
```

`logo` puts a mark before the site title in the header of every first-party theme, sized to the title. `dark` is optional and replaces `src` in dark mode. Each is a URL (`https:`, `data:`) or a path from the site root, such as a file in a SvelteKit host's `static/` folder; Svartz adds the deployment base to root paths. The title stays beside the mark, so `alt` defaults to empty.

Comments need all four Giscus ids; a note with `comments: false` hides them. See `docs/comments-and-analytics.md`.

## Develop

Preview with real content from the repository root:

```sh
pnpm svartz dev --vault showcase
```

`vaults/showcase` uses every Obsidian Markdown feature the theme renders.

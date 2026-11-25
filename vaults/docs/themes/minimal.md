---
title: "Minimal"
description: "Publish a browsable Obsidian vault with search, backlinks, and a graph."
---

Try the [Backyard Weather Station demo](https://minimal.demo.svartz.mia.cx). Minimal is Svartz's default. To select it explicitly, set:

```ts
theme: { base: "@svartz/theme-minimal", routes: { feed: "updates" } },
```

The shell puts search and folders on the left, the note in the middle, and the graph, contents, and backlinks on the right. It renders home and note pages, tags, folders, a chronological feed, and a 404. Search opens with Ctrl+K or Command+K. On a narrow screen the explorer moves into a drawer.

| Setting | Type and default |
| --- | --- |
| `routes.tags`, `routes.folders`, `routes.feed` | Path segments; `tags`, `folders`, `feed`. |
| `tokens` | Map of design token names to values; theme defaults apply when absent. |
| `logo` | `{ src: string; dark?: string; alt?: string }`; no logo by default. |
| `footer.links` | Map of labels to URLs; no extra links by default. |
| `comments` | Giscus settings; off unless configured. See [[reference/configuration]]. |

In frontmatter, use a number for `order` to place a note before unordered notes in the explorer. Lower comes first. A folder uses its folder note's order. Use `comments: false` to hide Giscus for a note. Other [[writing/frontmatter|standard fields]] work without theme-specific metadata.

Minimal supplies the shared shell, content slots, and list routes to every other [[themes|first-party theme]].

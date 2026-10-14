# @svartz/theme-blog

A starting point for a blog: a front page with a featured post and a filterable grid, long-form post pages, tags, and an archive. The structure follows Ghost's Casper; the look is Svartz's.

```ts
// svartz.config.ts
vaults: [{
  id: "blog",
  path: "vault",
  target: { type: "static" },
  theme: { base: "@svartz/theme-blog", nav: { Archive: "/feed/", Tags: "/tags/", About: "/about/" } },
  site: { title: "Plot 14", url: "https://example.com" },
}],
```

## What it renders

| Page | Contents |
| --- | --- |
| Front page | Site name and description, the featured post (or the newest), then every other post with tag filters (`?tag=`) and a Show more button |
| Post | Primary tag, title, excerpt, byline (author, date, reading time), cover, the post, tags, older/newer links, related posts by shared tags |
| Tags | `/tags/` lists topics by use; `/tags/:tag/` is a post grid |
| Archive | `/feed/`, grouped by year and month |
| Series | `/folders/` and `/folders/:path/` group posts by folder |

Posts are every note except `index.md`. If `index.md` exists, it renders as an introduction above the post feed. Dates come from `published_at`, then the created date.

With `site.url` set, the footer links the vault's RSS feed.

## Frontmatter

```yaml
published_at: 2026-09-12
cover: hero.jpg     # published with the post
coverAlt: A gravel path through the allotment
excerpt: One or two sentences for cards; falls back to description.
author: Mia
featured: true      # lead the front page
```

The type is exported as `PostMeta`.

## Settings

`theme.nav` sets the header links (default: Archive and Tags). `theme.routes`, `theme.footer.links`, and `theme.comments` work as in every Svartz theme.

## Develop

```sh
pnpm svartz dev --vault showcase-blog
```

---
title: "Blog"
description: "Publish long-form posts with bylines, covers, and a dated archive."
---

Try the [Plot 14 demo](https://blog.demo.svartz.mia.cx). Install `@svartz/theme-blog` and configure `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "blog",
      path: "vault",
      target: { type: "static" },
      theme: { base: "@svartz/theme-blog", nav: { Archive: "/feed/", Tags: "/tags/" } },
    },
  ],
});
```

The home introduces the site, then shows a featured post and a tag-filterable grid. Tag and folder pages list posts; the feed is an archive grouped by year and month. Post pages show a byline, cover, previous and next links, and related posts by tag.

```yaml
published_at: 2026-04-01
cover: seedlings.webp
coverAlt: Tomato seedlings in a tray
excerpt: What sprouted in the first week.
author: Mia
featured: true
```

`excerpt` falls back to the note description. The post date uses the publication date, then creation date, then modification date. If no post is featured, the newest leads the grid. Put site introduction prose in the root `index.md`.

Blog extends [[themes/minimal|minimal]]. It uses its own post layout, not a metadata-specific renderer, and retains search, the mobile drawer, and navigation between notes. `nav` is a map of labels to URLs; it defaults to Archive and Tags. The shared [[themes/minimal|minimal settings]] still apply.

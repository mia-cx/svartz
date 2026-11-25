---
title: "Feeds, sitemaps, and llms.txt"
description: "Expose your public notes through RSS, a sitemap, and Markdown copies."
---

Set `site.url` to the public origin plus any deployment base in `svartz.config.ts`. Leave off the vault's `mountPath`; Svartz adds it. With `site.url` set, Svartz writes `rss.xml` and `sitemap.xml` under the mount. A production build needs the URL if either output is explicitly enabled.

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "notes",
      path: "vault",
      target: { type: "static" },
      site: { title: "Field notes", url: "https://notes.example.com" },
      discovery: {
        feed: { limit: 20, content: "full", sort: "modified" },
        dateSources: ["frontmatter", "git", "filesystem"],
      },
    },
  ],
});
```

RSS defaults to 10 summaries in publication order. A full feed renders note Markdown and uses absolute links. Executable `.svx` notes and protected notes stay out of RSS. The sitemap lists public notes and generated listing pages, including visible locked notes. It leaves out `hide_locked: true` notes and redirects. An owned host route takes priority. Rename a public attachment if its name conflicts with a generated discovery file.

Svartz tries the date sources in order. A frontmatter date without an offset uses UTC. Give CI enough Git history if you depend on Git dates.

## Markdown copies

By default Svartz emits a `.md` copy beside each public, unprotected note and lists the copies in `llms.txt`. The home copy is `index.md`. Notes link to their copies. The copies omit hidden comments and executable script and style blocks. They use absolute listing links when `site.url` exists, relative links otherwise.

Standalone Node, Workers, and Pages targets redirect requests that prefer `text/markdown` to the copy. Static hosting exposes the copy URL without negotiation. A host must use [[plugins/server-plugins|svartzHandle]] and may need the adapter wrapper for prerendered requests.

Set `discovery.llms.enabled: false` to disable both the listing and the copies. The [[reference/configuration|configuration reference]] lists the other toggles.

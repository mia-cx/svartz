# Feeds and sitemaps

Set `site.url` to the public origin and deployment base for each vault. For a site at `https://example.com/site` with a vault mounted at `/journal`, use `site.url: 'https://example.com/site'`. Svartz adds the mount and note path. A production build with an enabled feed or sitemap requires this URL.

`site.title` is optional. When omitted, the vault ID becomes the site and feed title.

When `site.url` exists, each vault emits `<mountPath>/rss.xml` and `<mountPath>/sitemap.xml`. Both are disabled by default without a public URL. A manual SvelteKit route at either path wins. The generated files are ordinary static assets, so the host adapter copies them without a runtime endpoint. Svartz removes old generated files on the next build when an output is disabled.

```ts
{
  id: 'journal',
  path: './content/journal',
  mountPath: '/journal',
  target: { type: 'host' },
  site: { title: 'Journal', url: 'https://example.com' },
  discovery: {
    feed: { limit: 10, content: 'summary', sort: 'published' },
    sitemap: { enabled: true },
    dateSources: ['frontmatter', 'git', 'filesystem']
  }
}
```

`feed.content` can be `summary` or `full`. Full content renders published Markdown with the vault's active compiler plugins. Executable `.svx` notes and encrypted or hidden notes never enter feeds. Sitemaps include published note, tag, and folder routes, but omit encrypted and hidden notes. `published_at` publishes immediately and controls feed order when sorting by `published`; it never schedules a future build. Blank and `false` publication values do not override `draft: true`. If `published_at` is blank, the configured publication field applies to both filtering and feed dates. Date sources are tried in the configured order for creation and modification dates. New files without Git history fall through to filesystem dates.

An existing SvelteKit host can opt into one combined feed or sitemap by selecting vault IDs in its own route. This keeps the host route, title, and adapter under the host's control:

```ts
// src/routes/rss.xml/+server.ts
import { vaults } from 'virtual:svartz/host';
import { renderHostRss } from '@svartz/vite/discovery';

export const prerender = true;
export const GET = () => new Response(
  renderHostRss(vaults, ['journal', 'work'], {
    title: 'All writing', url: 'https://example.com'
  }),
  { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } }
);
```

For a combined sitemap, call `renderHostSitemap(vaults, ['journal', 'work'])` in a `sitemap.xml/+server.ts` route. Selected vaults must share one public origin. Both helpers use each vault's published index; vaults outside the selected ID list are never included.

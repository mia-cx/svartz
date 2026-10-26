# Feeds, sitemaps, and llms.txt

Set `site.url` to the public origin and deployment base for each vault. For a site at `https://example.com/site` with a vault mounted at `/journal`, use `site.url: 'https://example.com/site'`. Svartz adds the mount and note path. A production build with an enabled feed or sitemap requires this URL.

For standalone `target.basePath: '/site'`, use the same `/site` suffix in `site.url`. The runtime keeps that base exactly once in canonical links, social images, and navigation, while generated favicon paths resolve beneath it.

`site.title` is optional. When omitted, the vault ID becomes the site and feed title.

When `site.url` exists, each vault emits `<mountPath>/rss.xml` and `<mountPath>/sitemap.xml`. Both are disabled by default without a public URL. A manual SvelteKit route at either path wins. The generated files are ordinary static assets, so the host adapter copies them without a runtime endpoint. Svartz removes old generated files on the next build when an output is disabled.

A publicly emitted vault asset named `rss.xml` or `sitemap.xml` conflicts with an enabled generated file. Rename the asset or disable that discovery output. Svartz fails the build instead of silently replacing either file. An attachment used only by protected notes stays encrypted and does not conflict.

Sitemaps include published note URLs, tag and folder listings, the feed page, and the vault home page when Svartz owns it. They omit redirects, encrypted or hidden notes, and manually owned routes. Combined host sitemaps use the same rules for the selected vaults.

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

`feed.content` can be `summary` or `full`. Full content renders published Markdown with the vault's active compiler plugins and makes links and responsive-image candidates absolute against each note URL. Malformed authored URLs remain as written rather than failing the feed build. Executable `.svx` notes and encrypted or hidden notes never enter feeds. Sitemaps include published note, tag, and folder routes, but omit encrypted and hidden notes. `published_at` publishes immediately and controls feed order when sorting by `published`; it never schedules a future build. Blank and `false` publication values do not override `draft: true`. If `published_at` is blank, the configured publication field applies to both filtering and feed dates. Date sources are tried in the configured order for creation and modification dates. Git dates retain a note's first commit across renames within the vault, but a deleted path reused for a new note starts a new history. New files without Git history fall through to filesystem dates.

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

## Markdown for LLM agents

Each vault writes a Markdown copy of every public note beside its page: `/journal/trip/` has `/journal/trip.md`, and the vault home has `/journal/index.md`. A copy holds the note's published properties as YAML front matter, its title, and the authored Markdown. Links point at other copies, and attachments keep their public URLs. Obsidian `%%comments%%`, HTML comments, and `.svx` `<script>` and `<style>` blocks stay out. Protected notes get no copy, and links to them point at their locked page.

`<mountPath>/llms.txt` lists every copy with its description, in the [llms.txt](https://llmstxt.org/) format. Links are absolute when `site.url` exists, and relative otherwise, so neither file needs a public URL. A manual SvelteKit route at `llms.txt` wins.

Every theme shows two buttons on a note: Copy page puts the copy on the clipboard, and View as Markdown opens it. Each page also links its copy with `<link rel="alternate" type="text/markdown">`, so an agent that reads the page finds the copy.

Turn all of it off with `discovery: { llms: { enabled: false } }`.

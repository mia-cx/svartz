---
title: "Feeds, sitemaps, and llms.txt"
description: "Expose your public notes through RSS, a sitemap, robots.txt, and Markdown copies."
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

## robots.txt

A vault served at the origin root, such as `https://notes.example.com/`, writes `robots.txt`. By default it admits every crawler and, when the sitemap is on, names the sitemap's absolute URL:

```txt
User-agent: *
Disallow:

Sitemap: https://notes.example.com/sitemap.xml
```

`discovery.robots` chooses which crawlers come in. `bots` covers every crawler. `search` covers search engines and the AI search and agent fetchers that cite pages in answers: Googlebot, bingbot, DuckDuckBot, Applebot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot and Perplexity-User. `training` covers the crawlers that collect pages to train AI models: GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Meta-ExternalAgent and Bytespider. `search` and `training` follow `bots` unless you set them.

```ts
discovery: { robots: { bots: false } }                 // block every crawler
discovery: { robots: { training: false } }             // stay in search and AI answers, opt out of training
discovery: { robots: { bots: false, search: true } }   // admit only search and AI answers
```

`rules` adds groups for any other crawler, such as `{ userAgent: "Amazonbot", disallow: ["/drafts/"] }`. A rule narrows the preset that covers its crawler rather than replacing it. With `bots: false`, `{ userAgent: "Amazonbot", allow: ["/public/"] }` admits Amazonbot to `/public/` and nothing else. A crawler a rule names reads only that rule's group, so the group repeats the preset's line. A crawler a preset admits gets an empty `Disallow:`, never `Allow: /`, so a rule's `disallow` always blocks what it names, `*` included. `contentSignals` adds Cloudflare's [Content Signals](https://contentsignals.org/), which say how crawled pages may be used: `contentSignals: { search: true, aiInput: true, aiTrain: false }` writes `Content-Signal: search=yes, ai-input=yes, ai-train=no` into every group, since a crawler with a group of its own never reads the `*` group. They're a stated preference, not a block.

A host app's own `robots.txt`, as a route or in `static/`, takes priority. Crawlers fetch `robots.txt` only from the origin root, `/robots.txt`, so a vault under a `mountPath` or a deployment base (`target.basePath`, the host's SvelteKit `paths.base`, or a path in `site.url`) writes none: put the rules in the origin's own `robots.txt`. Set `robots.enabled: false` to write none at all.

## Markdown copies

By default Svartz emits a `.md` copy beside each public, unprotected note, lists the copies in [llms.txt](https://llmstxt.org/), and joins them into `llms-full.txt`. The home copy is `index.md`. Notes link to their copies. The copies omit hidden comments and executable script and style blocks. They use absolute listing links when `site.url` exists, relative links otherwise.

`llms.txt` has a section per top-level folder, in the order the explorer shows them. The home page and other notes at the vault root share a Pages section. Each entry shows the note's `description`, or else its first paragraph, cut at the last whole sentence within 300 characters. `llms-full.txt` holds every public page in the same order, each under its own heading and a `Source:` line with its URL. Its links are absolute, or start at the deployment base without `site.url`, and each page keeps its own reference links and footnotes.

Tag pages, folder listings, and the feed help people browse but give agents little. To list them in an Optional section that agents can skip, turn it on. A folder named Optional is listed as Optional (folder), so agents still read it.

```ts
discovery: { llms: { optional: true } },
```

An owned host route at `llms.txt` or `llms-full.txt` takes priority.

Standalone Node, Workers, and Pages targets redirect requests that prefer `text/markdown` to the copy. Static hosting exposes the copy URL without negotiation. A host must use [[plugins/server-plugins|svartzHandle]] and may need the adapter wrapper for prerendered requests.

Set `discovery.llms.enabled: false` to disable both the listing and the copies. The [[reference/configuration|configuration reference]] lists the other toggles.

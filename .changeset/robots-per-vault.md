---
"@svartz/plugins": minor
"@svartz/config": minor
"@svartz/core": minor
"@svartz/vite": minor
"svartz": minor
---

Each vault served at the origin root writes its own `robots.txt`, beside `sitemap.xml`. It names the sitemap's absolute URL whenever the sitemap is on, and still admits every crawler by default. `discovery.robots` chooses who comes in: `bots: false` blocks every crawler, `training: false` keeps search engines and AI search and agent fetchers while blocking AI training crawlers such as GPTBot, ClaudeBot and Google-Extended, and `bots: false, search: true` admits only search. `rules` adds groups for any other crawler, such as `{ userAgent: "Amazonbot", disallow: ["/drafts/"] }`, and `contentSignals: { search: true, aiInput: true, aiTrain: false }` adds Cloudflare's `Content-Signal` line. A vault below the origin root, under a mount or a deployment base, writes none, since crawlers fetch only `/robots.txt`. A host app's own `robots.txt` takes priority, whether it's a route or a file in `static/`; any other file in the host's `static/` folder at the vault's mount likewise takes priority over a generated discovery file of the same name, and `svartz dev` notices one as it's added or removed.

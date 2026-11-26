---
"@svartz/plugins": minor
"@svartz/config": minor
"@svartz/core": minor
---

`llms.txt` follows [llmstxt.org](https://llmstxt.org/) more closely. It has a `##` section per top-level folder, in explorer order, instead of one flat Pages list, and links `llms-full.txt`, a new file that holds every page's Markdown in the same order. Set `discovery: { llms: { optional: true } }` to list tag pages, folder listings and the feed under `## Optional`, which agents can skip. Every link in `llms-full.txt` is absolute, or root-relative without `site.url`. Each page keeps its own reference links and footnotes, and a code fence left open at the end of a page closes there. A host route at `llms-full.txt` wins, as one at `llms.txt` already did. A page whose `.md` URL a host route owns still appears in `llms-full.txt`.

A note without a `description` now takes its first paragraph, cut at the last whole sentence within 300 characters, so a description never ends mid-sentence. A hard break counts as a space, and a note that is only an embed gets no description. This applies wherever descriptions show, including page metadata, search and RSS. Inline code and hyphenated words stay in it, and embeds stay out.

---
title: "Obsidian Markdown"
description: "Write wikilinks, embeds, callouts, math, and diagrams in your notes."
---

Write ordinary Markdown in `.md` or `.mdx` files. Svartz renders these as content, not as executable Svelte. Use `.svx` for notes you author with Svelte components.

| Feature | Write |
| --- | --- |
| Wikilink | `[[Setup]]` or `[[Setup\|Install the sensor]]` |
| Heading link | `[[Setup#Wiring]]` |
| Embed | `![[Setup]]` for a note, `![[photo.png]]` for an image |
| Highlight | `==check the battery==` |
| Inline tag | `#hardware/sensors` |
| Hidden comment | `%%not for publication%%` |
| Footnote | `Text[^1]` and a separate `[^1]: Source note.` |
| Math | `$x^2$` inline, or a block between lines of `$$` |
| Code or diagram | A fenced block with a language such as `ts`, or `mermaid` for a diagram |

Use a blockquote for a callout:

```md
> [!tip] Label your cables
> Write the pin number on each lead.
```

Code keeps its original text, even where it contains Markdown markers. Mermaid renders in the browser. Footnotes, task lists, tables, and strikethrough need no extra plugin. Inline tags join frontmatter tags in tag listings. Links in code do not enter the link graph.

Open the [minimal demo](https://minimal.demo.svartz.mia.cx) for working examples, or see its [callouts note](https://minimal.demo.svartz.mia.cx/reference/callouts/).

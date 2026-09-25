# Obsidian content in v1

Use `[[Note]]` to link to a published note. A missing target appears as a disabled link and does not enter the graph. `![[Note]]` remains an embed, even when the same note also has a normal wikilink.
Links shown in code samples, escaped prose, or raw HTML do not become graph edges. The table of contents recognizes ATX and Setext headings and gives repeated titles distinct IDs.

Inline `#topic` and nested `#topic/subtopic` tags become links to the vault's tag routes. They join normalized frontmatter tags in listings and search. Tags in published note embeds become links too. Numeric-only tags and tags inside code or authored links are left alone. Publication filtering runs before tag extraction, so drafts and private notes do not add public tags.

Callouts use Obsidian's blockquote syntax. Their title and first body line render as separate paragraphs:

```md
> [!note] Read this
> Body text
```

Fenced `mermaid` blocks render as diagrams in the browser. Svartz loads Mermaid only for vaults that contain a diagram and uses Mermaid's strict security level. The original diagram text remains in the prerendered page until the browser renders it. An encrypted note keeps its diagram source in the encrypted payload until unlock.

````md
```mermaid
graph TD
  A --> B
```
````

Highlighted code-block slots receive a `language` prop, such as `typescript`, alongside their rendered children and HTML attributes. A theme that replaces the code-block slot should preserve those children and attributes to keep highlighting and Mermaid diagrams functional.

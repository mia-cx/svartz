# Obsidian content in v1

Use `[[Note]]` to link to a published note. A missing target appears as a disabled link and does not enter the graph. `![[Note]]` remains an embed, even when the same note also has a normal wikilink.
Links shown in code samples, escaped prose, or raw HTML do not become graph edges. The table of contents recognizes ATX and Setext headings and gives repeated titles distinct IDs.

Inline `#topic` and nested `#topic/subtopic` tags become links to the vault's tag routes. They join normalized frontmatter tags in listings and search. Tags in published note embeds become links too. Numeric-only tags and tags inside code or authored links are left alone. Publication filtering runs before tag extraction, so drafts and private notes do not add public tags.

Highlights, `%%` comments, and inline tags also work in nested list items. Fenced, indented, and inline code stays literal, even when it contains those markers.

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

Math in a published note embed renders in both Markdown and executable `.svx` notes. Svartz keeps the authored `$...$` source for search and word counts, then renders KaTeX during compilation. To turn off a built-in transformer for one vault, replace its plugin by ID with its disabled factory, such as `transformLatex({ disabled: true })`.

## Optional formats

The built-in GFM, Obsidian, math, and code transforms remain the default. Add an optional format only to the vault that uses it:

```ts
import { defineConfig } from '@svartz/config';
import { citations, hardLineBreaks, oxHugoFlavoredMarkdown, roamFlavoredMarkdown } from '@svartz/plugins';

export default defineConfig({
  version: '1.0.0',
  vaults: [{
    id: 'notes', path: 'vault', target: { type: 'host' },
    plugins: [hardLineBreaks(), roamFlavoredMarkdown(), oxHugoFlavoredMarkdown(), citations({ bibliographyFile: 'bibliography.bib' })]
  }]
});
```

`hardLineBreaks()` turns prose newlines into line breaks. `roamFlavoredMarkdown()` handles Roam's underscore italics, highlights, TODO/DONE controls, `{{or:...}}`, `[[>]]` quotes, and audio/video/PDF embeds. Roam markers remain syntax, even when a note named `TODO` exists. Local media references keep their attachments in the published vault. Generated controls are native HTML and media URLs must use HTTP(S) or a relative path. `oxHugoFlavoredMarkdown()` normalizes relrefs, heading anchors, figures, shortcodes, and Org math before Svartz resolves links. Its options can disable each conversion. It processes Markdown files, leaving executable `.svx` source intact. Svartz parses both YAML (`---`) and TOML (`+++`) frontmatter before applying publication rules. The source normalizers leave fenced and inline code alone.

`citations()` reads `bibliography.bib` from the vault directory by default. Override `bibliographyFile`, `csl`, `linkCitations`, and `suppressBibliography` as needed. Bibliography paths resolve from the vault, including in a SvelteKit host. A missing file fails the build with its path. Only cited entries appear in a generated note bibliography. Disable or remove the plugin to leave citation text unchanged.

# @svartz/theme-wiki

Publish a vault as a wiki: a reference for a game, a product's user guide, or anything people look things up in. The structure follows Wikipedia and wiki.gg; the look is Svartz's.

```ts
// svartz.config.ts
vaults: [{ id: "wiki", path: "vault", target: { type: "static" }, theme: { base: "@svartz/theme-wiki" } }],
```

## What it renders

| Page | Contents |
| --- | --- |
| Article | Title and tagline, hatnote, infobox, numbered contents in the rail, references (footnotes), categories bar, "What links here", last-edited date |
| Main page | The home note, then the featured article, recent changes, and category portals |
| Categories | `/tags/` lists every category; `/tags/:tag/` lists its pages A–Z |
| All pages | `/folders/` lists every page A–Z; `/folders/:path/` lists one folder |
| Recent changes | `/feed/`, grouped by day |

The rail also has a Random page button. On narrow screens the rail becomes a menu drawer and the infobox leads the article.

## Section bar

The vault's folders become the bar under the search, so you group pages by moving them into folders:

```
characters/                  → "Characters" in the bar
  Harbourmaster Quill.md     → a page in its dropdown
  lamplighters/              → a flyout in the dropdown
    index.md                 → names the flyout ("Lamplighters' Guild") and is its link
    Mirelle Ashford.md
```

Each top-level folder is a bar item that links to its folder note, or to its folder page if it has none. A dropdown shows 12 pages, then links to the rest. Folders deeper than a flyout appear as plain links. Notes at the vault root stay out of the bar. On narrow screens the same tree opens in the menu drawer.

## Frontmatter

```yaml
hatnote: "For the guild she leads, see [[Lamplighters' Guild]]."   # wikilinks and `code` render
featured: true        # show on the main page
image: portrait.svg   # the infobox image; a vault attachment here is published with the page
infobox:
  caption: Mirelle in the 1.4 update
  rows:
    Role: Lamplighter
    Home: "[[Vessa]], Lower Wards"   # wikilinks resolve to pages
  sections:
    - heading: Abilities
      rows:
        Trim wick: Doubles a lantern's burn time
```

`infobox.image` also works, but only for URLs: the pipeline publishes attachments named by top-level `image`, `cover`, or `socialImage`. The types are exported as `Infobox` and `InfoboxSection`. Plugins that generate wiki pages should emit this shape.

## Settings

`theme.routes` renames the list URLs (`tags`, `folders`, `feed`); `theme.footer.links` and `theme.comments` work as in every Svartz theme.

## Develop

```sh
pnpm svartz dev --vault showcase-wiki
```

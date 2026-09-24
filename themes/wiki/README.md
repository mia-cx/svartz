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

## Frontmatter

```yaml
hatnote: For the guild she leads, see Lamplighters' Guild.
featured: true        # show on the main page
infobox:
  image: portrait.svg # a vault attachment or a URL
  caption: Mirelle in the 1.4 update
  rows:
    Role: Lamplighter
    Home: "[[Vessa]], Lower Wards"   # wikilinks resolve to pages
  sections:
    - heading: Abilities
      rows:
        Trim wick: Doubles a lantern's burn time
```

The types are exported as `Infobox` and `InfoboxSection`. Plugins that generate wiki pages should emit this shape.

## Settings

`theme.routes` renames the list URLs (`tags`, `folders`, `feed`); `theme.footer.links` and `theme.comments` work as in every Svartz theme.

## Develop

```sh
pnpm svartz dev --vault showcase-wiki
```

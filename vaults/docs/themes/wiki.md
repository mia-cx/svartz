---
title: "Wiki"
description: "Organize articles into sections with categories, infoboxes, and recent changes."
---

Try the [Lanternfall Wiki](https://wiki.demo.svartz.mia.cx). Install `@svartz/theme-wiki` and set:

```ts
theme: { base: "@svartz/theme-wiki", routes: { tags: "categories" } },
```

The home shows its note, a featured article, recent changes, and category portals. The section bar comes from the vault's top-level folders. Folder notes name the sections. The theme lists all pages by title on the folders index and groups the chronological feed by day.

```yaml
featured: true
hatnote: "For related entries, see the category list."
image: lantern.svg
infobox:
  caption: A harbour lantern
  rows:
    Fuel: Oil
  sections:
    - heading: Measurements
      rows:
        Height: 32 cm
```

`featured` picks a home-page feature; `hatnote` or `infobox` selects the article renderer in a composed vault. Use top-level `image` for a vault attachment; `infobox.image` does not publish a local attachment on its own. Use `order` to put pages or sections first.

The theme extends [[themes/minimal|minimal]], retaining its search, drawer, contents, and shared options. Wiki swaps the article chrome and listings. Its ordinary feed lists built notes; a community site can link the live [[plugins/history|Recent changes page]] separately.

---
title: "Frontmatter"
order: 2
description: "Set a note title, dates, tags, links, and publishing rules in its header."
---

Put YAML between `---` lines at the top of a note. Svartz also reads TOML between `+++` lines.

```yaml
title: Wiring the sensor
description: Connect the sensor to a power supply and read its first measurement.
tags: [hardware, sensors]
aliases: [Sensor setup]
created_at: 2026-04-01
```

| Field | Use |
| --- | --- |
| `title` | Page title. Defaults to the filename, or the folder name for a folder note. |
| `description` | Summary in metadata and listings. |
| `tags` | List of strings for tag listings and search. |
| `created_at`, `updated_at` | Note dates. See [[writing/discovery|Feeds, sitemaps, and llms.txt]]. |
| `published_at` | Publication override and feed date. It does not schedule publication. |
| `draft`, `private` | Boolean [[writing/publication|publication switches]]. |
| `slug` | Final segment of the canonical URL. |
| `aliases`, `alias`, `permalink` | Alternate names or URLs. See [[writing/links-and-routes|Links and routes]]. |
| `socialImage`, `image`, `cover` | Preview image fields, in priority order. |
| `password_group`, `hide_locked` | [[writing/encrypted-notes|Encrypted notes]] settings. |
| `theme` | [[themes/choosing-and-composing|Theme selection]] for this note or folder. |
| `toc: false`, `enableToc: false` | Hide the table of contents on this note. |
| `comments: false` | Hide Giscus for this note when the vault enables it. |
| `versions: true` | Opt a note into [[writing/post-versions|Git post versions]]. |

Rename the standard title, description, tags, aliases, and date keys with [[reference/configuration|vault frontmatter settings]]. Themes can read their own fields. Check the [[themes|theme reference]] before adding those fields.

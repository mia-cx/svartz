---
title: "Frontmatter"
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
| `title` | Page title. Svartz can derive it from the note when absent. |
| `description` | Summary in metadata and listings. |
| `tags` | List of strings for tag listings and search. |
| `created_at`, `updated_at` | Note dates. See [[writing/discovery]]. |
| `published_at` | Publication override and feed date. It does not schedule publication. |
| `draft`, `private` | Boolean [[writing/publication]]. |
| `slug` | Final segment of the canonical URL. |
| `aliases`, `alias`, `permalink` | Alternate names or URLs. See [[writing/links-and-routes]]. |
| `socialImage`, `image`, `cover` | Preview image fields, in priority order. |
| `password_group`, `hide_locked` | [[writing/encrypted-notes]]. |
| `theme` | [[themes/choosing-and-composing]]. |
| `toc: false`, `enableToc: false` | Hide the table of contents on this note. |
| `comments: false` | Hide Giscus for this note when the vault enables it. |
| `versions: true` | Opt a note into [[writing/post-versions]]. |

Rename the standard title, description, tags, aliases, and date keys with [[reference/configuration|vault frontmatter settings]]. Themes can read their own fields. Check the [[themes|theme reference]] before adding those fields.

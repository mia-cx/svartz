---
title: "Images and attachments"
description: "Publish referenced files and choose previews and favicons."
---

Put an attachment in your vault and refer to it from a published note. Use Markdown such as `![Sensor board](./sensor.webp)` or an Obsidian embed such as `![[sensor.webp]]`. Add descriptive alt text when the image carries information. Svartz does not copy unused or excluded files. An attachment shared by a public and encrypted note is public.

Set a preview image on a note with `socialImage`, `image`, or `cover`. The first nonempty value wins. Use an HTTP(S) URL, a path from the site root, or a vault attachment path (relative to the note, from the vault root, or a unique basename). A leading-slash path that does not match a vault attachment passes through as a site-root path. Any other unresolved or excluded local preview image fails the build.

With a public `site.url` and a theme that supplies a template, Svartz generates a 1200 × 630 PNG for each published, unprotected note. Set `site.image` for the fallback. Set `discovery.socialImages.enabled: false` to turn off generation.

Use `site.favicon` for an SVG, PNG, JPEG, WebP, or ICO file relative to the config. Svartz emits a 32 px PNG icon and a 180 px Apple touch icon, and copies SVG or ICO inputs. Standalone sites enable this by default. In a host, turn it on with `discovery.favicon.enabled: true` if you want vault icons.

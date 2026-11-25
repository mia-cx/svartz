---
title: "Plugins"
description: "Add optional content formats, browser features, and server-side tools."
---

Svartz runs its built-in pipeline without plugin configuration. Add an optional plugin by installing its package and putting the factory result in a vault's `plugins` array. Put shared plugins in `defaults.plugins`. A vault's plugin with the same ID replaces a default; `disabled: true` removes that ID.

## Content and browser features

- [[plugins/presentation|Presentation]] opens a note as slides.
- [[plugins/citations|Citations]] formats citations from a bibliography.
- [[plugins/hard-line-breaks|Hard line breaks]] keeps prose newlines.
- [[plugins/roam-flavored-markdown|Roam Markdown]] and [[plugins/ox-hugo-flavored-markdown|ox-hugo Markdown]] normalize imports.
- [[plugins/analytics|Analytics]] is built in and turns on through vault settings.

## Site features

- [[plugins/auth|Auth]] gives readers sign-in and accounts.
- [[plugins/annotations|Annotations]] attaches comments to passages.
- [[plugins/submissions|Submissions]] sends edits to GitHub.
- [[plugins/history|History]] shows Git revisions, live or at build time.
- [[plugins/moderation|Moderation]] adds reports and a dashboard queue.

See the [[plugins/pipeline|build pipeline]], [[guides/create-plugin|write a plugin]], or [[plugins/server-plugins|add server routes]].

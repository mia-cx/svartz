---
title: "Hard line breaks"
description: "Turn a single prose newline into a rendered line break."
---

Run `npm install -D @svartz/plugins` and import `hardLineBreaks` from `@svartz/plugins`. Set `plugins: [hardLineBreaks()]` on the vault. The factory takes no options and needs no frontmatter or server.

Use it when line breaks in source prose should be visible, such as in verse. It applies to the whole vault. It changes soft line breaks, not code or paragraph spacing. Leave it off if you use newlines to wrap paragraphs in the editor.

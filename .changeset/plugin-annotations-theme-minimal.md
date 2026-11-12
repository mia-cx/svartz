---
'@svartz/plugin-annotations': minor
'@svartz/theme-minimal': minor
---

A theme-minimal site shows annotations on every note once it enables `auth` and `annotations`, with no code, and so does every theme that extends minimal. theme-minimal marks each note's body with `data-svartz-note="<slug>"`; the plugin's browser script attaches there after each navigation, keyed by the slug, and detaches when the reader leaves. List pages and password-protected notes get none.

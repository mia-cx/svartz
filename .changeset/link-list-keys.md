---
'@svartz/theme-minimal': patch
'@svartz/theme-blog': patch
'@svartz/theme-docs': patch
'@svartz/theme-wiki': patch
'@svartz/ui': patch
---

Two link labels that share a URL in `nav` or `footer.links` no longer crash the page. The blog footer shows a label in both lists once.

Vite no longer fails its dependency scan on `ColorModeToggle`, so the first browser test run in a theme stops reloading mid-run.

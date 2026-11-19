---
"@svartz/plugins": patch
---

A note's raw HTML can no longer carry a script URL past the sanitizer by hiding its scheme behind a tab or newline (`java&#9;script:`), which browsers drop before reading it. `data:text/html` and `data:application/xhtml+xml` URLs are refused too, with or without a parameter after the type, and so is `vbscript:`.

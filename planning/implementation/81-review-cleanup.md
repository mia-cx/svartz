# Remaining baseline backend review fixes

Issue #81 closes three current findings from the original MVP review.

- [x] Tests: cover source-theme imports, omitted site titles, and public listing routes in per-vault and host sitemaps. Config 115, plugins 151, and Vite 35 tests pass.
- [x] Capture knowledge: record indexed sitemap routes in the discovery rule and source-theme import resolution in the theme rule.
- [x] Documentation: describe the title fallback, sitemap route coverage, and local source-theme import in the host docs.
- [ ] Review & close: inspect the diff, run focused tests and builds, and reply to the matching review threads. Close #81 only when merged.

Keep host route ownership and encrypted-note exclusion intact. Leave Opus-owned theme UI alone.

# Remaining baseline backend review fixes

Issue #81 closes three current findings from the original MVP review.

- [ ] Tests: cover source-theme imports, omitted site titles, and public listing routes in per-vault and host sitemaps.
- [ ] Capture knowledge: record which indexed routes belong in generated sitemaps and how the source-theme override reaches Vite.
- [ ] Documentation: describe the title fallback and sitemap route coverage in the relevant package docs.
- [ ] Review & close: inspect the diff, run focused tests and builds, and reply to the matching review threads. Close #81 only when merged.

Keep host route ownership and encrypted-note exclusion intact. Leave Opus-owned theme UI alone.

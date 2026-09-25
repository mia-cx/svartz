# #56 Mounted RSS and sitemap

## Outcome

Generate per-vault and optional selected-vault host discovery files from the published route index. Keep output adapter-independent and owned by Svartz.

## TODOs

- [x] Add typed feed/sitemap configuration and date-source precedence to the resolved vault contract.
- [x] Generate per-vault RSS and sitemap from canonical published entries, with public URL validation and safe XML escaping.
- [x] Compose selected host vault feeds/sitemaps without crossing vault publication boundaries or overriding manual routes.
- [x] Tests: cover ordering, limits, mount/base URLs, Git/filesystem dates, unpublished content, packed consumers, and output cleanup.
- [x] Capture Knowledge: record discovery-file ownership and public URL rules in a scoped rule.
- [x] Documentation: explain config, defaults, host composition, and generated paths.
- [x] Review & Close: inspect diff, run build/tests and packed consumer check, file PR closing #56 and referencing #46.

## Notes

Base branch: `feat/v1-release-prep` (PR #55). Folder/tag pages, social images, and favicons remain under #46. Existing `apps/web` sitemap endpoint is app-specific and cannot serve as the package contract.

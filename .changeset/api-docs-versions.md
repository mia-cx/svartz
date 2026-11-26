---
"@svartz/theme-api-docs": minor
"@svartz/theme-mcp-docs": minor
"@svartz/ui": minor
"svartz": minor
"@svartz/vite": minor
"@svartz/core": minor
"@svartz/plugin-history": patch
---

The API and MCP docs themes document several API versions in one site. List them in `theme.versions`, such as `[{ id: "2026-04", status: "latest" }, { id: "2026-01", ref: "api/2026-01" }, { id: "2025-07", ref: "api/2025-07", status: "deprecated" }]`, and the `version` badge becomes a picker. The latest version is the vault as it stands, at its usual URLs. Every other version is the vault's folder at its git `ref`, published below its id, `/2026-01/pets/get-pet/`, and read from git without touching the checkout. The latest version's own id redirects to its pages, `/2026-04/pets/get-pet/` to `/pets/get-pet/`, so a link to a version keeps meaning that version after the next one ships. Those redirects are temporary (307) wherever a target emits one, such as Cloudflare Pages' `_redirects`, while note aliases stay permanent (308); `virtual:svartz/host` lists them apart as `routes.temporaryRedirects`, and `svartz init` adds them to a host app's generated catchall. A versioned vault's managed Turbo build is never cached, since a ref can move while its inputs stay the same.

The picker keeps the reader on the page they're reading, or opens the version's home page when it lacks the page. A deprecated version's pages link the same page in the latest version. Search covers the version being read, and the sitemap and feed list the latest version only. Each older version's build is cached in `.svartz/vaults/<id>/versions/` and reused until its ref moves or Svartz, the config, a file a plugin reads or the lockfile changes. A vault with password groups builds every version each time, so a changed password applies to all of them.

Several vaults in one standalone app now share one `virtual:svartz/server`, and a path is served by the vault with the deepest mount holding it. `@svartz/core` exports `describeValue`, the stable text the build caches key on.

# @svartz/plugin-history

## 2.7.0

### Patch Changes

- a766950: The API and MCP docs themes document several API versions in one site. List them in `theme.versions`, such as `[{ id: "2026-04", status: "latest" }, { id: "2026-01", ref: "api/2026-01" }, { id: "2025-07", ref: "api/2025-07", status: "deprecated" }]`, and the `version` badge becomes a picker. The latest version is the vault as it stands, at its usual URLs. Every other version is the vault's folder at its git `ref`, published below its id, `/2026-01/pets/get-pet/`, and read from git without touching the checkout. The latest version's own id redirects to its pages, `/2026-04/pets/get-pet/` to `/pets/get-pet/`, so a link to a version keeps meaning that version after the next one ships. Those redirects are temporary (307) wherever a target emits one, such as Cloudflare Pages' `_redirects`, while note aliases stay permanent (308); `virtual:svartz/host` lists them apart as `routes.temporaryRedirects`, and `svartz init` adds them to a host app's generated catchall. A versioned vault's managed Turbo build is never cached, since a ref can move while its inputs stay the same.

  The picker keeps the reader on the page they're reading, or opens the version's home page when it lacks the page. A deprecated version's pages link the same page in the latest version. Search covers the version being read, and the sitemap and feed list the latest version only. Each older version's build is cached in `.svartz/vaults/<id>/versions/` and reused until its ref moves or Svartz, the config, a file a plugin reads or the lockfile changes. A vault with password groups builds every version each time, so a changed password applies to all of them.

  Several vaults in one standalone app now share one `virtual:svartz/server`, and a path is served by the vault with the deepest mount holding it. `@svartz/core` exports `describeValue`, the stable text the build caches key on.

- Updated dependencies [a766950]
- Updated dependencies [0b7e0ca]
- Updated dependencies [38c347c]
- Updated dependencies [5411016]
  - @svartz/core@2.7.0
  - @svartz/plugins@2.7.0
  - @svartz/plugin-submissions@2.7.0
  - @svartz/auth@2.7.0

## 2.6.0

### Patch Changes

- b7f2573: A page's history numbers its pages from 1, as GitHub does: `?page=1` is the first page, the same as no `?page`, and `?page=10` the last, which reaches the latest 1,000 changes. `?page=0` now answers 404. `CommitReader.history` takes GitHub's page number as it is, counting from 1.
- dbf8b88: Svartz's plugin packages carry the npm keyword `svartz-plugin`, and its themes `svartz-theme`, so an npm search for either keyword finds them. Tag your own Svartz plugin or theme the same way to be found beside them.
- Updated dependencies [5596543]
- Updated dependencies [1ddaf7e]
- Updated dependencies [b7f2573]
- Updated dependencies [dbf8b88]
- Updated dependencies [8f0291d]
- Updated dependencies [04e44dd]
- Updated dependencies [ba0f490]
  - @svartz/plugins@2.6.0
  - @svartz/auth@2.6.0
  - @svartz/plugin-submissions@2.6.0
  - @svartz/core@2.6.0

## 2.5.0

### Minor Changes

- 7e8db9e: The community wiki plugins are on npm. `@svartz/plugin-submissions` turns readers' edits and new pages into commits or pull requests, `@svartz/plugin-history` gives every page a history with diffs and the wiki a Recent changes list, and `@svartz/plugin-moderation` lets readers report problems and moderators handle them from the dashboard. They ship in the fixed version group with the rest of Svartz.

### Patch Changes

- Updated dependencies [03747e2]
- Updated dependencies [7f28eb7]
- Updated dependencies [8677494]
- Updated dependencies [22acec7]
- Updated dependencies [34fe812]
- Updated dependencies [c2b0f0d]
- Updated dependencies [11aedab]
- Updated dependencies [7119bad]
- Updated dependencies [142f796]
- Updated dependencies [142f796]
- Updated dependencies [e44be06]
- Updated dependencies [b82cf41]
- Updated dependencies [35ef566]
- Updated dependencies [f6cf60e]
- Updated dependencies [e42d690]
- Updated dependencies [5178445]
- Updated dependencies [03747e2]
- Updated dependencies [a863185]
- Updated dependencies [0661dc3]
- Updated dependencies [3a2a761]
- Updated dependencies [7e8db9e]
- Updated dependencies [3aac18d]
- Updated dependencies [8c57dcf]
- Updated dependencies [72e30fc]
- Updated dependencies [b0548e3]
- Updated dependencies [2c11831]
  - @svartz/auth@2.5.0
  - @svartz/core@2.5.0
  - @svartz/plugins@2.5.0
  - @svartz/plugin-submissions@2.5.0

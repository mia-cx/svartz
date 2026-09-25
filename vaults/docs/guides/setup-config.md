# Configure Svartz vaults

Svartz reads `svartz.config.ts` from the project root. The `vaults` array names the directories that Svartz treats as vaults.

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  defaults: {
    theme: "@svartz/theme-minimal",
    publicationMode: "exclusion",
    exclude: ["internal/**"],
  },
  vaults: [
    {
      id: "blog",
      path: "vaults/blog",
      target: { type: "static" },
      site: { title: "Blog", url: "https://example.com" },
    },
    {
      id: "projects",
      path: "vaults/projects",
      target: { type: "static", basePath: "/projects" },
      publicationMode: "inclusion",
      include: ["work/**"],
    },
  ],
});
```

Each `path` is relative to the config file. Vault options override `defaults`. `exclude` patterns from defaults and the vault combine; `include` patterns use the vault value when set. The default publication mode is `exclusion`, with all notes published except excluded paths. In `inclusion` mode, only `include` matches publish.

## Themes

The default is `@svartz/theme-minimal`. Set `theme` to an installed package name, a `./themes/custom` path relative to this config file, or an absolute path. Svartz resolves installed packages from the host SvelteKit app. An invalid configured theme fails the build. Local workspace theme source changes rebuild that package and restart dev; external absolute themes restart when their built files change.

## Frontmatter

```yaml
---
title: Example
draft: false
published_at: 2026-09-24
private: false
---
```

`draft: true` hides a note. A nonempty `published_at` publishes it immediately and can override `draft` or an excluded path. `private: true` wins over both and always hides the note. `draft` and `private` accept boolean `true` for these overrides. A future `published_at` date never schedules a later build.

`frontmatter` can rename title, description, tags, aliases, creation and modification dates, and the publication date field. Its defaults are `title`, `description`, `tags`, `aliases`, `created_at`, `updated_at`, and `published_at`.

```ts
frontmatter: {
  createdAtField: "created",
  updatedAtField: "modified",
}
```

Links to unpublished or missing notes do not create graph edges. See [[plugins/filter-unpublished]] for attachment behavior.

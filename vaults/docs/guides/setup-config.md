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

Set `mountPath: "/blog"` on a host vault to serve it beneath `/blog` in an existing SvelteKit app. It is separate from the vault's disk `path` and SvelteKit's deployment `basePath`. Manual host routes win. Published notes receive deterministic URLs after filtering; `alias`, `aliases`, and `permalink` add redirects without changing the canonical note URL.

## Themes

The default is `@svartz/theme-minimal`. Set `theme` to an installed package name, a `./themes/custom` path relative to this config file, or an absolute path. Svartz resolves installed packages from the host SvelteKit app. An invalid configured theme fails the build. Local workspace theme source changes rebuild that package and restart dev; external absolute themes restart when their built files change.

### Colours and other tokens

Override any design token with `tokens` beside `base`. A name is the token without its `--sv-` prefix. A value applies to both colour schemes; give `light` and `dark` to set them apart.

```ts
theme: {
  base: "@svartz/theme-wiki",
  tokens: {
    accent: "oklch(0.62 0.19 250)",
    paper: { light: "oklch(0.99 0 0)", dark: "oklch(0.14 0 0)" },
    "radius-m": "4px",
  },
},
```

Your tokens win over the theme's, the theme's win over `@svartz/theme-minimal`'s, and those win over the Svartz defaults. Setting `accent` also moves `accent-text`, `accent-soft`, and `selection`, which derive from it. The colour tokens are `paper`, `surface`, `sunken`, `rule`, `rule-strong`, `muted`, `text`, `ink`, `accent`, `accent-text`, `accent-soft`, `on-accent`, `mark`, `selection`, `scrim`, `shadow-color`, and the signal hues `hue-blue` to `hue-violet` (numbers, in degrees). `DESIGN.md` lists the rest.

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

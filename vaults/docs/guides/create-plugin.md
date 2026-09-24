---
tags: [guides]
---

# Create a plugin

Choose the specific hook that owns your change. The [[contracts/plugin-contract]] lists all hooks and their order. Content transforms run serially; earlier hooks can prepare files for later hooks.

```ts
import { definePlugin } from "@svartz/core";

/** Remove a custom Markdown marker before compilation. */
export const stripMarker = definePlugin(() => ({
  id: "mine:strip-marker",
  transformOfm: {
    run(ctx) {
      for (const file of ctx.files) {
        file.content = file.content.replaceAll("%%marker%%", "");
      }
    },
    options: { enforce: "post", fatal: true },
  },
}));
```

Add `stripMarker()` to `defaults.plugins` for every vault or to one vault's `plugins` array. Use a unique ID. A more specific config entry with the same ID replaces it without changing its position. To remove an optional built-in, add `{ id: "core:transform-syntax", disabled: true }`.

If your feature changes Markdown parsing, use `getCompilerContributions(ctx)` instead of rewriting source text. Add remark or rehype plugins to its arrays. Put browser imports into `browserResources` with stable IDs and a `kind` of `css`, `script`, or `asset`. The Vite artifact module imports active resources and exports URLs for assets. This state belongs to one build; never keep it in a module-level variable.

Test the hook with `runStages` from `@svartz/core` and a small `PluginContext`. For compiler features, also test the generated `.svelte` artifact. `.md` and `.mdx` must keep authored Svelte inert; `.svx` may execute it. Check the disabled and same-ID replacement cases so they do not leave compiler steps or browser resources behind.

See [[plugins/overview]] for the built-in plugins.

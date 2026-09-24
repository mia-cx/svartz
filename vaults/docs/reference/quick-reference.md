# Plugin quick reference

```ts
import { definePlugin, getCompilerContributions } from "@svartz/core";

export const remarkFeature = definePlugin(() => ({
  id: "mine:remark-feature",
  transformGfm: {
    run(ctx) {
      getCompilerContributions(ctx).remarkPlugins.push(myRemarkPlugin);
    },
    options: { fatal: true, enforce: "post" },
  },
}));
```

`myRemarkPlugin` stands for a remark plugin supplied by your package. Register compiler steps from the hook, so disabling or replacing it removes the feature. Declare CSS, scripts, or assets in `getCompilerContributions(ctx).browserResources` by stable ID. The Vite artifact module imports active resources and exports URLs for assets.

Use `definePlugin` for an author-facing factory, `normalizePlugin` for validation, `mergePlugins` for ID-based replacement, `sortPluginsForStage` for enforce ordering, and `runStages` for tests. All come from `@svartz/core`. The full hook order and context types are in [[contracts/plugin-contract]]. The built-in IDs are in [[plugins/overview]].

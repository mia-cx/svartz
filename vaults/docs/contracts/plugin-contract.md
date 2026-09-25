# Plugin contract

`@svartz/core` owns the author-facing `SvartzPlugin` and `PluginContext` types. Plugin hooks do not require Effect.

## Hooks and order

The build runs these hooks in order:

`buildStart` → `configResolved` → `discoverFiles` → `parseFrontmatter` → `filterUnpublished` → `resolveLinks` → `transformOfm` → `transformGfm` → `transformToc` → `transformDescription` → `transformSyntax` → `transformLatex` → `transformEmbeds` → `indexContent` → `emitArtifacts` → `buildEnd`.

`handleChange` receives development change events separately. A plugin may implement more than one hook. Each stage sorts its plugins by `enforce: "pre"`, default, then `enforce: "post"`. Within a tier, it preserves merged plugin order. Content transformers run serially because they share mutable files and compiler contributions. Core hooks set `fatal: true`; a fatal failure stops the build.

The six required stages are `discoverFiles`, `parseFrontmatter`, `filterUnpublished`, `resolveLinks`, `indexContent`, and `emitArtifacts`. Any active plugin can provide them. Optional transformers can be disabled or replaced.

```ts
import { definePlugin } from "@svartz/core";

export const stripMarker = definePlugin(() => ({
  id: "mine:strip-marker",
  transformOfm: {
    run(ctx) {
      for (const file of ctx.files) file.content = file.content.replaceAll("%%marker%%", "");
    },
    options: { enforce: "post", fatal: true },
  },
}));
```

The hook shorthand is a function receiving `ctx`. The full form is `{ run, options }`. `HookOptions` supports `fatal`, `enforce`, and `parallel`. Use `parallel` only for independent non-transform work. `ctx.files` is mutable; `ctx.config` is the resolved vault config. `ctx.artifacts`, `ctx.index`, and `ctx.meta` carry build results. `ctx.compiler` holds the current build's compiler contributions.

## Compiler and browser resources

Transformers can register remark or rehype plugins with `getCompilerContributions(ctx)`. They can also declare browser CSS, scripts, and assets in `browserResources` by stable ID. The artifact virtual module imports only resources contributed by active hooks in this build. Scripts load only in the browser. Asset entries also appear as URLs in its `browserResources` export. The next build starts with a fresh contribution set, so removing a note or disabling a feature removes its unused resources.

`transformGfm()` registers remark-gfm. `transformSyntax(options?)` registers rehype-pretty-code when published notes contain code. `transformLatex(options?)` renders math with KaTeX and contributes its stylesheet only when published notes use math. The emitter does not install these features itself. A replacement with the same plugin ID owns the entire hook and its resources.

`.md` and `.mdx` compile as Markdown into inert HTML. Only `.svx` runs authored Svelte markup, scripts, and expressions.

## Merge and validation

Svartz merges core, theme preset, config defaults, then vault plugins. A later plugin with the same ID replaces the earlier one in its original position. `{ id: "core:transform-latex", disabled: true }` removes that optional built-in. Disabling a required stage needs another active provider. Theme capabilities do not require plugins; `requiredFeatures` does.

`definePlugin`, `normalizePlugin`, `mergePlugins`, and `sortPluginsForStage` are exported from `@svartz/core`. Invalid hook shapes or IDs fail validation. Unknown keys warn. Hook errors carry the plugin ID and stage.

See [[guides/create-plugin]] and [[plugins/overview]].

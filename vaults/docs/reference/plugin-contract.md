---
title: "Plugin contract"
description: "Look up plugin fields, pipeline stages, and compiler contributions."
---

A `SvartzPlugin` has a unique `id` and an optional `contractVersion` string. Use `definePlugin(factory)` to type a plugin factory.

| Optional field | Use |
| --- | --- |
| `disabled` | Remove this ID from the merged pipeline. |
| `forVault({ vault, vaults })` | Resolve the plugin once per vault after all vaults resolve. Return the plugin for that vault; throw to fail config resolution. |
| `options` | Plain data that affects build output, used to invalidate compiled Git versions. |
| `reads` | Build input paths, relative to the vault or absolute, included in Git version cache checks. |
| `server` | `{ module, options?, eager?, pages? }` for [[plugins/server-plugins|server plugins]]. |
| `permissions` | Declarations collected by [[plugins/auth|auth]]: `slug`, `name`, `description`, optional `defaults` and `administrative`. |

Permission slugs are `<plugin>:<feature>:<action>`, with `read`, `write`, or `delete` as the action. Defaults map `guest` and `signed-in` to `allow` or `deny`. Administrative permissions cannot come from ownership. A declaration does not enforce access; the handler checks it via `can()`.

## Stage order

1. `buildStart`, `configResolved`
2. `discoverFiles`, `parseFrontmatter`, `filterUnpublished`, `allocateRoutes`, `resolveLinks`
3. `transformOfm`, `transformGfm`, `transformToc`, `transformDescription`, `transformSyntax`, `transformLatex`, `transformEmbeds`
4. `indexContent`, `emitArtifacts`, `buildEnd`

`handleChange(event, ctx)` is the separate file-change hook. Each stage accepts a function or `{ run, options }`. `enforce: "pre"` sorts before ordinary hooks; `"post"` sorts after them. In the same group, plugin order is stable. Merge order is built-ins, theme preset, then configured plugins. An ID replacement keeps its position.

`fatal: true` stops the pipeline on that hook's error; the default is to collect the error and continue. `parallel` explicitly opts a hook into or out of a parallel batch. Hooks default to serial. Content transforms always run serially, even with `parallel: true`. Only opt in when it is safe to overlap with other hooks.

## Context and contributions

A hook receives `config`, the resolved vault; `plugins`, the active normalized pipeline when available; `files`, processed files; `artifacts`, emitted output; `index`, the content index when built; `meta`, an arbitrary build-local map; and optional `compiler` state.

`getCompilerContributions(ctx)` initializes the contributions if needed. It exposes `remarkPlugins`, `rehypePlugins`, late `svxSourceTransforms`, `browserResources`, and `serverData`. Browser resources have `id`, `kind: "css" | "script" | "asset"`, `importId`, and optional JSON-serializable `options`. Scripts export `mount(pathname, options, context)` and can return a disposer. `context.base` is the deployment base; `pathname` already includes it. Pass the vault's mount as an option if the script needs to call a plugin route.

See [[guides/create-plugin|Create a plugin]] for an example and the [source types](https://github.com/mia-cx/svartz/tree/sveltekit-rewrite/packages/core/src/plugin) for runtime signatures.

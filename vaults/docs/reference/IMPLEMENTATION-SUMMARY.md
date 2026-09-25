# Implementation map

Svartz processes each vault through the ordered hooks in [[contracts/plugin-contract]]. [[plugins/overview]] lists the core providers. Theme and config plugins can replace them by ID. The required stages are discovery, frontmatter, publication filtering, link resolution, indexing, and emission. Individual content transforms are optional.

The publication filter removes hidden notes before links, embeds, search, graph, and artifacts. Referenced assets from published notes remain available. Each build collects compiler steps and browser resources from its active hooks. The emitter compiles `.md` and `.mdx` as inert Markdown; only `.svx` executes authored Svelte.

`@svartz/vite` bridges generated artifacts to SvelteKit through `virtual:svartz/theme` and `virtual:svartz/artifacts`. The CLI resolves vault config and starts a vault-scoped build. See [[guides/runtime-vite-integration]] for runtime details and [[guides/create-plugin]] for an authoring example.

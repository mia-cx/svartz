---
title: "Choose and combine themes"
order: 1
description: "Select a theme per vault, or use several renderers on one site."
---

Install the theme package with npm. Set the vault's `theme` to its package name or an object with `base` and its settings. When you omit `theme`, Svartz uses [[themes/minimal|minimal]]. The package can also be a project-relative theme path.

To put HTTP and MCP reference in one vault, try the [Harbour developer docs demo](https://reference.demo.svartz.mia.cx). Install both packages and configure `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "reference",
      path: "vault",
      target: { type: "static" },
      theme: {
        base: ["@svartz/theme-api-docs", "@svartz/theme-mcp-docs"],
        baseUrl: "https://api.example.com",
      },
    },
  ],
});
```

The first theme supplies the site style and default renderer. The other settings go to every theme in the array. A note picks its theme in this order:

1. Its own `theme` frontmatter, such as `theme: mcp-docs`.
2. The closest folder note with a `theme`.
3. A renderer that recognizes its metadata, such as `operation: { protocol: mcp, ... }`.
4. The first theme, when no renderer claims it.

An explicit or inherited theme limits detection to that theme. Without a match, the note uses ordinary prose. An unknown theme, ambiguous renderer match, or invalid renderer metadata fails the build. Set the folder note's `theme` to pick its folder listing style too.

Each first-party theme builds on [[themes/minimal|minimal's shell]]. The [[guides/create-theme|theme authoring guide]] shows how to package a combination.

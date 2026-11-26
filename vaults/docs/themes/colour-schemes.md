---
title: "Colour schemes"
order: 8
description: "Give a vault the colours of a popular palette, in light and dark mode."
---

Svartz ships ports of eight open-source palettes. Import one by name from `@svartz/config/schemes` and set it as the vault's `theme.tokens`:

```ts
import { defineConfig } from "@svartz/config";
import { catppuccin } from "@svartz/config/schemes";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "notes",
      path: "vault",
      target: { type: "static" },
      theme: { base: "@svartz/theme-minimal", tokens: catppuccin },
    },
  ],
});
```

A scheme sets every colour token for light and dark mode, so the colour-mode toggle switches the whole palette. It works with every first-party theme. [[reference/cli#init|svartz init]] offers the same schemes and writes the import for you.

| Scheme | Import | Light and dark |
| --- | --- | --- |
| [Catppuccin](https://github.com/catppuccin/palette) | `catppuccin` | Latte and Mocha |
| [Rosé Pine](https://github.com/rose-pine/palette) | `rosePine` | Dawn and Rosé Pine |
| [Nord](https://github.com/nordtheme/nord) | `nord` | Snow Storm and Polar Night |
| [Gruvbox](https://github.com/morhetz/gruvbox) | `gruvbox` | Light and dark, medium contrast |
| [Tokyo Night](https://github.com/enkia/tokyo-night-vscode-theme) | `tokyoNight` | Tokyo Night Light and Tokyo Night |
| [Dracula](https://github.com/dracula/dracula-theme) | `dracula` | Alucard and Dracula |
| [Solarized](https://github.com/altercation/solarized) | `solarized` | Light and dark |
| [Everforest](https://github.com/sainnhe/everforest) | `everforest` | Light and dark, medium contrast |

![Catppuccin in light and dark mode](../attachments/schemes/catppuccin.svg)

![Rosé Pine in light and dark mode](../attachments/schemes/rose-pine.svg)

![Nord in light and dark mode](../attachments/schemes/nord.svg)

![Gruvbox in light and dark mode](../attachments/schemes/gruvbox.svg)

![Tokyo Night in light and dark mode](../attachments/schemes/tokyo-night.svg)

![Dracula in light and dark mode](../attachments/schemes/dracula.svg)

![Solarized in light and dark mode](../attachments/schemes/solarized.svg)

![Everforest in light and dark mode](../attachments/schemes/everforest.svg)

## Contrast

Body text, muted text, links and highlights meet WCAG AA against their backgrounds in both modes, and the accent meets the 3:1 rule for focus rings and graphics, as the default palette does. To get there, a few source colours are darker or lighter than the original, and Solarized's body text is one step stronger than Solarized's own. Signal colours (callouts, HTTP methods) and code highlighting keep Svartz's defaults.

## Change a colour

Spread a scheme and override the tokens you want. A token takes one value for both modes, or `{ light, dark }`:

```ts
theme: {
  base: "@svartz/theme-minimal",
  tokens: {
    ...nord,
    accent: { light: "oklch(0.55 0.12 160)", dark: "oklch(0.78 0.1 160)" },
  },
},
```

A scheme sets `paper`, `surface`, `sunken`, `rule`, `rule-strong`, `muted`, `text`, `ink`, `accent`, `accent-text` and `mark`. When you change `accent`, change `accent-text` too, since links use it.

## Credits

Each palette belongs to its authors and is MIT licensed. `@svartz/config` keeps every license and credit in its [THIRD-PARTY-NOTICES.md](https://github.com/mia-cx/svartz/blob/main/packages/config/THIRD-PARTY-NOTICES.md).

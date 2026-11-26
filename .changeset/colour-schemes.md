---
"@svartz/config": minor
---

Eight colour schemes ship with Svartz: ports of Catppuccin, Rosé Pine, Nord, Gruvbox, Tokyo Night, Dracula, Solarized and Everforest. Import one by name and use it as a vault's `theme.tokens`:

```ts
import { catppuccin } from "@svartz/config/schemes";

theme: { base: "@svartz/theme-minimal", tokens: catppuccin },
```

Each sets every colour token for light and dark mode, so the colour-mode toggle switches the whole palette. Body text, muted text, links, highlights, the accent and labels on accent buttons meet WCAG AA in both modes, as the default palette does. Spread a scheme to change one token: `tokens: { ...nord, accent: "oklch(0.6 0.12 160)" }`. Each port keeps its source's license and credit in the package's `THIRD-PARTY-NOTICES.md`.

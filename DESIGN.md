# Svartz design language

Status: **proposed**. Awaiting Mia's sign-off before any theme builds on it.

Svartz turns a vault into a published site, and five first-party themes cover different kinds of site: minimal, wiki, blog, docs and api-docs. Each theme borrows its page structure from the best tool for its job (Quartz, Wikipedia, Ghost, TypeDoc, Stripe). The visual language is Svartz's own. Any two themes side by side should read as siblings from one vendor.

The tokens live in `packages/ui/src/lib/styles/tokens.css`. The shared primitives live in `base.css`. A theme imports `@svartz/ui/base.css` and nothing else from the design layer.

## The idea: ink on paper, marked by an editor

*Svart* is Swedish for black. Every theme is black ink on warm paper, with one vermilion accent: the colour of an editor's proof mark. The accent marks what you can act on and where you are: links, focus, the active item. Everything else stays in ink.

## Colour

All colours are OKLCH. Each is a `light-dark()` pair, so `color-scheme` switches every token at once. By default the OS decides. The colour-mode toggle pins `.light` or `.dark` on `<html>`.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--sv-paper` | Page background | `oklch(0.985 0.004 80)` | `oklch(0.155 0.005 80)` |
| `--sv-surface` | Raised panels, hovers | `0.962` | `0.195` |
| `--sv-sunken` | Code, wells | `0.94` | `0.13` |
| `--sv-rule` / `--sv-rule-strong` | Hairlines, borders | `0.895` / `0.8` | `0.275` / `0.36` |
| `--sv-muted` | Secondary text | `0.52` (5.3:1) | `0.67` (6.6:1) |
| `--sv-text` | Body text | `0.3` (13:1) | `0.86` (12.7:1) |
| `--sv-ink` | Headings, strong UI | `0.17` (18:1) | `0.965` |
| `--sv-accent` | Focus ring, marks, graphics | `oklch(0.6 0.2 33)` | `oklch(0.7 0.17 36)` |
| `--sv-accent-text` | Accent as text | `oklch(0.5 0.18 33)` (6.3:1) | `oklch(0.76 0.15 40)` (8.6:1) |
| `--sv-mark` | `==highlight==` | yellow marker at 75% | at 45% |

Contrast ratios are measured against `--sv-paper`. The neutrals share hue 80 with very low chroma, which reads as warm paper, never as beige.

**Signal hues.** Callouts, HTTP methods and symbol kinds all draw from eight hues: blue 252, cyan 215, teal 180, green 150, amber 78, orange 52, red 25 and violet 300. Put `data-sv-signal` on an element and set `--sv-hue` on it. You then get `--sv-signal`, which is text-safe (about 5:1 in both modes), and `--sv-signal-soft`, a tint for backgrounds. Lightness and chroma are fixed per mode, so no signal colour ever outshouts another.

## Typography

The type system is Mia's mCX Obsidian theme ([obsidian-theme-mcx](https://github.com/mia-cx/obsidian-theme-mcx)), so a vault reads the same in Obsidian and on the web. Reading is monospace; the interface is Archivo.

| Token | Face | Used for |
|---|---|---|
| `--sv-font-interface` | Archivo (variable, width axis) | Navigation, buttons, search, lists, and the label voice |
| `--sv-font-text` | Monaspace Xenon | Note body (mCX's reading font) |
| `--sv-font-title` | Google Sans Code (variable) | H1, page titles, site name |
| `--sv-font-h2` | Monaspace Argon | H2, list titles |
| `--sv-font-h3` | Monaspace Xenon, bold | H3 |
| `--sv-font-minor` | Fira Code (variable) | H4 to H6 |
| `--sv-font-mono` | Monaspace Argon | Code, tags, keyboard hints |

All faces are self-hosted through Fontsource, so no page requests a font CDN. Monaspace ships only static weights there: Xenon 400, 400 italic, and 700; Argon 400 and 600.

**The label voice.** mCX's overline: Archivo in capitals at 125% width (`.sv-label`, 0.7rem, 0.08em tracking, `--sv-label-stretch`). Metadata, callout titles, kind badges, method pills, dates, and counts all use it. This is the thread that ties the themes together: a Svartz page always labels things the same way.

**Scale.** The body is `1rem` (monospace sets wide) at leading 1.65. Steps are `--sv-step--2` to `--sv-step-5`, computed from `--sv-ratio`.

## Space, shape, depth, motion

- **Space:** a 4px grid (`--sv-space-1` to `-8`), multiplied by `--sv-density`.
- **Radius:** 3px on small parts (badges, kbd), 6px on controls, 10px on panels and modals. Pills are fully round.
- **Depth:** mostly flat, separated by 1px hairlines. Only overlays (modals, popovers, drawers) get `--sv-shadow`.
- **Focus:** a 2px vermilion outline, offset 2px, on every focusable element.
- **Motion:** `--sv-duration-fast` 120ms for hovers, `--sv-duration` 200ms for reveals, `--sv-duration-slow` 320ms for drawers, all on one ease-out curve. Reduced motion sets all three to 0.

## Shared primitives

`base.css` provides these, and they look the same in every theme:

- `.sv-label`: the label voice.
- `.sv-tag`: a hairline pill, `#name` in mono, turning vermilion on hover.
- `.sv-badge`: a signal-coloured mono label for kinds, methods and states.
- `.sv-icon-button`: a 2rem square, quiet until hovered.
- `.sv-kbd`: keyboard hints.
- `.sv-wordmark`: the site name, set in the title face.
- `.sv-mark`: the Svartz mark.
- `.sv-skip-link`, `.sv-visually-hidden`.

The OFM content components (callout, code block, link, embed), the search dialog and the colour-mode toggle are shared Svelte components in `@svartz/ui`. They are built on these tokens.

**Icons:** Lucide, at stroke 1.75, sized to the text. Callout icons follow Obsidian's callout vocabulary so authors recognise them.

## The Svartz mark

An ink block with a vermilion proof mark offset to its lower right, like a stamp that missed its register. It appears as `.sv-mark` and as the default favicon (`SVARTZ_MARK_SVG` in `@svartz/ui`). The favicon uses the hex equivalents `#120f0b` and `#de3f20`, because image converters don't all read OKLCH. A site's own name is set as `.sv-wordmark`; the Svartz mark never replaces it.

## Dials

A theme may change only these:

| Dial | Token | Default |
|---|---|---|
| Density | `--sv-density` | `1` |
| Type ratio | `--sv-ratio` | `1.2` |
| Measure (content width) | `--sv-measure` | `42rem` |
| Layout and chrome | the theme's own CSS | |

Set dials on `:root`. The derived tokens (`--sv-step-*`, `--sv-space-*`) resolve where they are declared, so a dial set on an inner element does not rescale them.

How much accent a theme uses is a layout choice, not a new colour. A theme that needs a colour, radius or font the tokens don't have adds it here first.

| Theme | Density | Ratio | Measure | Character |
|---|---|---|---|---|
| minimal | 1 | 1.2 | 42rem | Three columns, quiet sidebars |
| wiki | 0.85 | 1.18 | 50rem | Dense, text-first, rules between sections |
| blog | 1.15 | 1.28 | 38rem | Open, large display type, images lead |
| docs | 0.9 | 1.17 | 48rem | Structured, badges carry kind |
| api-docs | 0.85 | 1.15 | 44rem + example pane | Dense, mono-heavy right pane |

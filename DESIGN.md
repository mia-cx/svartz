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

The faces come from Mia's mCX Obsidian theme ([obsidian-theme-mcx](https://github.com/mia-cx/obsidian-theme-mcx)). mCX's monospace headings and body belong to its edit view; a published page reads in Archivo.

| Token | Face | Used for |
|---|---|---|
| `--sv-font-sans` | Archivo (variable, weight and width axes) | Everything: body, headings, titles, interface, and the label voice |
| `--sv-font-mono` | Monaspace Argon | Code, tags, keyboard hints |

Both are self-hosted through Fontsource, so no page requests a font CDN.

**Hierarchy through size.** Headings and titles are Archivo 700 at normal width (H5 and H6 at 600), stepping down the type scale. Only the label voice uses the width axis.

**The label voice.** mCX's overline: Archivo in small capitals, set as the font ships: no added width or letter-spacing (`.sv-label`, 0.7rem). Metadata, callout titles, kind badges, method pills, dates, and counts all use it. This is the thread that ties the themes together: a Svartz page always labels things the same way.

**Scale.** The body is `1.0625rem` at leading 1.65. Steps are `--sv-step--2` to `--sv-step-5`, computed from `--sv-ratio`.

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

A vault overrides any token from config (`theme.tokens`), and that wins over everything here: config, then the theme's own tokens, then minimal's, then these defaults. `-accent-text`, `-accent-soft`, and `-selection` derive from `--sv-accent`, so one accent carries its shades.

How much accent a theme uses is a layout choice, not a new colour. A theme that needs a colour, radius or font the tokens don't have adds it here first.

| Theme | Density | Ratio | Measure | Character |
|---|---|---|---|---|
| minimal | 1 | 1.2 | 44rem | Three columns, quiet sidebars |
| wiki | 0.85 | 1.18 | 52rem | Dense, text-first, rules between sections |
| blog | 1.15 | 1.26 | 40rem | Open, large display type, images lead |
| docs | 0.9 | 1.17 | 48rem | Structured, badges carry kind |
| api-docs | 0.85 | 1.15 | 44rem + example pane | Dense, mono-heavy right pane |

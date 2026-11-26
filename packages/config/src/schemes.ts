/**
 * Colour schemes ported from open-source palettes, imported by name into a vault's `theme.tokens`:
 *
 * ```ts
 * import { catppuccin } from "@svartz/config/schemes";
 * // in a vault:
 * theme: { base: "@svartz/theme-minimal", tokens: catppuccin },
 * ```
 *
 * Each sets Svartz's colour tokens for light and dark mode, so the colour-mode toggle switches the whole palette.
 * Spread one to change a token: `tokens: { ...nord, accent: "oklch(0.6 0.12 160)" }`. Every value is the source
 * colour in OKLCH. A comment names each source colour; "darkened" or "lightened" marks one moved in lightness only,
 * to meet WCAG AA against its backgrounds. Licenses and credits: THIRD-PARTY-NOTICES.md in this package.
 */

/** The colour tokens a scheme sets. The rest (accent tints, selection, signals) derive from these. */
export type ColorToken =
  | "paper"
  | "surface"
  | "sunken"
  | "rule"
  | "rule-strong"
  | "muted"
  | "text"
  | "ink"
  | "accent"
  | "accent-text"
  | "mark";

/** A light and a dark value for every colour token. Use it as a vault's `theme.tokens`. */
export type ColorScheme = Readonly<Record<ColorToken, { readonly light: string; readonly dark: string }>>;

/** Catppuccin: Latte in light mode, Mocha in dark, with Mauve as the accent. */
export const catppuccin = {
  paper: { light: "oklch(0.958 0.006 264.5)", dark: "oklch(0.243 0.03 283.9)" }, // base #eff1f5 / #1e1e2e
  surface: { light: "oklch(0.933 0.009 264.5)", dark: "oklch(0.324 0.032 282)" }, // mantle #e6e9ef / surface0 #313244
  sunken: { light: "oklch(0.906 0.012 264.5)", dark: "oklch(0.216 0.025 284.1)" }, // crust #dce0e8 / mantle #181825
  rule: { light: "oklch(0.857 0.014 268.5)", dark: "oklch(0.404 0.032 280.2)" }, // surface0 #ccd0da / surface1 #45475a
  "rule-strong": { light: "oklch(0.758 0.02 273.2)", dark: "oklch(0.477 0.034 278.6)" }, // surface2 #acb0be / #585b70
  muted: { light: "oklch(0.492 0.038 279.3)", dark: "oklch(0.751 0.04 273.9)" }, // subtext1 #5c5f77 / subtext0 #a6adc8
  text: { light: "oklch(0.435 0.043 279.3)", dark: "oklch(0.879 0.043 272.3)" }, // text #4c4f69 / #cdd6f4
  ink: { light: "oklch(0.435 0.043 279.3)", dark: "oklch(0.879 0.043 272.3)" }, // text #4c4f69 / #cdd6f4
  accent: { light: "oklch(0.555 0.25 297)", dark: "oklch(0.787 0.119 304.8)" }, // mauve #8839ef / #cba6f7
  "accent-text": { light: "oklch(0.525 0.25 297)", dark: "oklch(0.787 0.119 304.8)" }, // mauve #8839ef darkened / #cba6f7
  mark: { light: "oklch(0.714 0.149 67.8 / 0.3)", dark: "oklch(0.919 0.07 86.5 / 0.2)" }, // yellow #df8e1d / #f9e2af
} satisfies ColorScheme;

/** Rosé Pine: Dawn in light mode, the main variant in dark, with Iris as the accent. */
export const rosePine = {
  paper: { light: "oklch(0.97 0.011 71.9)", dark: "oklch(0.213 0.025 291.1)" }, // base #faf4ed / #191724
  surface: { light: "oklch(0.987 0.011 76.6)", dark: "oklch(0.241 0.032 289.1)" }, // surface #fffaf3 / #1f1d2e
  sunken: { light: "oklch(0.939 0.015 64.3)", dark: "oklch(0.271 0.042 289.2)" }, // overlay #f2e9e1 / #26233a
  rule: { light: "oklch(0.892 0.006 31.1)", dark: "oklch(0.372 0.036 291.1)" }, // highlight med #dfdad9 / #403d52
  "rule-strong": { light: "oklch(0.843 0.006 334)", dark: "oklch(0.44 0.039 290.4)" }, // highlight high #cecacd / #524f67
  muted: { light: "oklch(0.507 0.046 291)", dark: "oklch(0.654 0.044 291.2)" }, // subtle #797593 darkened / #908caa
  text: { light: "oklch(0.396 0.052 289.7)", dark: "oklch(0.909 0.03 290)" }, // text #464261 / #e0def4
  ink: { light: "oklch(0.396 0.052 289.7)", dark: "oklch(0.909 0.03 290)" }, // text #464261 / #e0def4
  accent: { light: "oklch(0.56 0.074 305.7)", dark: "oklch(0.776 0.095 305)" }, // iris #907aa9 darkened / #c4a7e7
  "accent-text": { light: "oklch(0.517 0.074 305.7)", dark: "oklch(0.776 0.095 305)" }, // iris #907aa9 darkened / #c4a7e7
  mark: { light: "oklch(0.755 0.146 69.7 / 0.3)", dark: "oklch(0.843 0.11 74.6 / 0.2)" }, // gold #ea9d34 / #f6c177
} satisfies ColorScheme;

/** Nord: Snow Storm in light mode, Polar Night in dark, with Frost as the accent. */
export const nord = {
  paper: { light: "oklch(0.951 0.007 260.7)", dark: "oklch(0.324 0.023 264.2)" }, // nord6 #eceff4 / nord0 #2e3440
  surface: { light: "oklch(0.933 0.01 261.8)", dark: "oklch(0.379 0.029 266.5)" }, // nord5 #e5e9f0 / nord1 #3b4252
  sunken: { light: "oklch(0.899 0.016 262.7)", dark: "oklch(0.294 0.023 264.2)" }, // nord4 #d8dee9 / nord0 darkened
  rule: { light: "oklch(0.899 0.016 262.7)", dark: "oklch(0.416 0.032 264.1)" }, // nord4 #d8dee9 / nord2 #434c5e
  "rule-strong": { light: "oklch(0.819 0.016 262.7)", dark: "oklch(0.452 0.035 264.1)" }, // nord4 darkened / nord3 #4c566a
  muted: { light: "oklch(0.452 0.035 264.1)", dark: "oklch(0.749 0.016 262.7)" }, // nord3 #4c566a / nord4 darkened
  text: { light: "oklch(0.379 0.029 266.5)", dark: "oklch(0.899 0.016 262.7)" }, // nord1 #3b4252 / nord4 #d8dee9
  ink: { light: "oklch(0.324 0.023 264.2)", dark: "oklch(0.951 0.007 260.7)" }, // nord0 #2e3440 / nord6 #eceff4
  accent: { light: "oklch(0.55 0.077 254)", dark: "oklch(0.775 0.062 217.5)" }, // nord10 darkened / nord8 #88c0d0
  "accent-text": { light: "oklch(0.514 0.077 254)", dark: "oklch(0.775 0.062 217.5)" }, // nord10 darkened / nord8 #88c0d0
  mark: { light: "oklch(0.855 0.089 84.1 / 0.5)", dark: "oklch(0.855 0.089 84.1 / 0.2)" }, // nord13 #ebcb8b
} satisfies ColorScheme;

/** Gruvbox: the light and dark palettes at medium contrast, with orange as the accent. */
export const gruvbox = {
  paper: { light: "oklch(0.956 0.055 96.2)", dark: "oklch(0.277 0 0)" }, // bg0 #fbf1c7 / #282828
  surface: { light: "oklch(0.922 0.055 92.5)", dark: "oklch(0.311 0.003 48.6)" }, // bg0_s #f2e5bc / #32302f
  sunken: { light: "oklch(0.894 0.057 89.2)", dark: "oklch(0.241 0.005 219.7)" }, // bg1 #ebdbb2 / bg0_h #1d2021
  rule: { light: "oklch(0.825 0.051 85.1)", dark: "oklch(0.344 0.007 48.5)" }, // bg2 #d5c4a1 / bg1 #3c3836
  "rule-strong": { light: "oklch(0.756 0.041 82.3)", dark: "oklch(0.411 0.012 51.9)" }, // bg3 #bdae93 / bg2 #504945
  muted: { light: "oklch(0.482 0.018 61)", dark: "oklch(0.69 0.035 76.3)" }, // fg3 #665c54 / fg4 #a89984
  text: { light: "oklch(0.344 0.007 48.5)", dark: "oklch(0.894 0.057 89.2)" }, // fg1 #3c3836 / #ebdbb2
  ink: { light: "oklch(0.277 0 0)", dark: "oklch(0.956 0.055 96.2)" }, // fg0 #282828 / #fbf1c7
  accent: { light: "oklch(0.513 0.162 39.3)", dark: "oklch(0.731 0.182 51.7)" }, // faded orange #af3a03 / bright #fe8019
  "accent-text": { light: "oklch(0.513 0.162 39.3)", dark: "oklch(0.731 0.182 51.7)" }, // #af3a03 / #fe8019
  mark: { light: "oklch(0.725 0.143 77.7 / 0.3)", dark: "oklch(0.725 0.143 77.7 / 0.3)" }, // neutral yellow #d79921
} satisfies ColorScheme;

/** Tokyo Night: Tokyo Night Light in light mode, Tokyo Night in dark, with blue as the accent. */
export const tokyoNight = {
  paper: { light: "oklch(0.929 0.008 278.6)", dark: "oklch(0.226 0.021 280.5)" }, // background #e6e7ed / #1a1b26
  surface: { light: "oklch(0.904 0.008 278.6)", dark: "oklch(0.282 0.036 274.7)" }, // #e6e7ed darkened / storm #24283b
  sunken: { light: "oklch(0.879 0.008 278.6)", dark: "oklch(0.201 0.021 280.5)" }, // #e6e7ed darkened / #1a1b26 darkened
  rule: { light: "oklch(0.849 0.008 278.6)", dark: "oklch(0.322 0.036 274.7)" }, // #e6e7ed darkened / #24283b lightened
  "rule-strong": { light: "oklch(0.769 0.008 278.6)", dark: "oklch(0.409 0.055 274.3)" }, // #e6e7ed darkened / #414868
  muted: { light: "oklch(0.479 0.011 273.2)", dark: "oklch(0.666 0.068 274.4)" }, // comments #6c6e75 darkened / #565f89 lightened
  text: { light: "oklch(0.359 0.051 273.2)", dark: "oklch(0.767 0.054 275.5)" }, // foreground #343b58 / #a9b1d6
  ink: { light: "oklch(0.279 0.051 273.2)", dark: "oklch(0.846 0.061 274.8)" }, // #343b58 darkened / variables #c0caf5
  accent: { light: "oklch(0.476 0.14 260.2)", dark: "oklch(0.719 0.132 264.2)" }, // blue #2959aa / #7aa2f7
  "accent-text": { light: "oklch(0.476 0.14 260.2)", dark: "oklch(0.719 0.132 264.2)" }, // blue #2959aa / #7aa2f7
  mark: { light: "oklch(0.523 0.104 71 / 0.2)", dark: "oklch(0.784 0.106 75.4 / 0.25)" }, // yellow #8f5e15 / #e0af68
} satisfies ColorScheme;

/** Dracula: Alucard in light mode, Dracula in dark, with purple as the accent. */
export const dracula = {
  paper: { light: "oklch(0.987 0.021 95.3)", dark: "oklch(0.288 0.022 277.5)" }, // background #fffbeb / #282a36
  surface: { light: "oklch(0.962 0.021 95.3)", dark: "oklch(0.323 0.022 277.5)" }, // #fffbeb darkened / #282a36 lightened
  sunken: { light: "oklch(0.937 0.021 95.3)", dark: "oklch(0.258 0.022 277.5)" }, // #fffbeb darkened / #282a36 darkened
  rule: { light: "oklch(0.859 0.021 286)", dark: "oklch(0.403 0.032 277.8)" }, // selection #cfcfde / #44475a
  "rule-strong": { light: "oklch(0.759 0.021 286)", dark: "oklch(0.56 0.08 270.1)" }, // #cfcfde darkened / comment #6272a4
  muted: { light: "oklch(0.508 0.041 97.1)", dark: "oklch(0.73 0.08 270.1)" }, // comment #6c664b / #6272a4 lightened
  text: { light: "oklch(0.239 0 0)", dark: "oklch(0.977 0.008 106.5)" }, // foreground #1f1f1f / #f8f8f2
  ink: { light: "oklch(0.239 0 0)", dark: "oklch(0.977 0.008 106.5)" }, // foreground #1f1f1f / #f8f8f2
  accent: { light: "oklch(0.509 0.188 287.1)", dark: "oklch(0.742 0.149 301.9)" }, // purple #644ac9 / #bd93f9
  "accent-text": { light: "oklch(0.509 0.188 287.1)", dark: "oklch(0.742 0.149 301.9)" }, // purple #644ac9 / #bd93f9
  mark: { light: "oklch(0.544 0.104 93.9 / 0.2)", dark: "oklch(0.955 0.134 112.8 / 0.2)" }, // yellow #846e15 / #f1fa8c
} satisfies ColorScheme;

/**
 * Solarized: the light and dark palettes, with blue as the accent. Body text is one step stronger than Solarized's own
 * (base02 in light mode, base1 in dark), because its default body colours fall short of AA.
 */
export const solarized = {
  paper: { light: "oklch(0.974 0.026 90.1)", dark: "oklch(0.267 0.049 219.8)" }, // base3 #fdf6e3 / base03 #002b36
  surface: { light: "oklch(0.931 0.026 92.4)", dark: "oklch(0.309 0.052 219.7)" }, // base2 #eee8d5 / base02 #073642
  sunken: { light: "oklch(0.911 0.026 92.4)", dark: "oklch(0.237 0.049 219.8)" }, // base2 darkened / base03 darkened
  rule: { light: "oklch(0.881 0.026 92.4)", dark: "oklch(0.349 0.052 219.7)" }, // base2 darkened / base02 lightened
  "rule-strong": { light: "oklch(0.698 0.016 196.8)", dark: "oklch(0.523 0.028 219.1)" }, // base1 #93a1a1 / base01 #586e75
  muted: { light: "oklch(0.473 0.028 219.1)", dark: "oklch(0.694 0.02 205.3)" }, // base01 darkened / base0 #839496 lightened
  text: { light: "oklch(0.309 0.052 219.7)", dark: "oklch(0.698 0.016 196.8)" }, // base02 #073642 / base1 #93a1a1
  ink: { light: "oklch(0.267 0.049 219.8)", dark: "oklch(0.931 0.026 92.4)" }, // base03 #002b36 / base2 #eee8d5
  accent: { light: "oklch(0.555 0.139 244.9)", dark: "oklch(0.615 0.139 244.9)" }, // blue #268bd2 darkened / #268bd2
  "accent-text": { light: "oklch(0.515 0.139 244.9)", dark: "oklch(0.695 0.139 244.9)" }, // blue darkened / lightened
  mark: { light: "oklch(0.654 0.134 85.7 / 0.25)", dark: "oklch(0.654 0.134 85.7 / 0.15)" }, // yellow #b58900
} satisfies ColorScheme;

/** Everforest: the light and dark palettes at medium contrast, with green as the accent. */
export const everforest = {
  paper: { light: "oklch(0.974 0.026 90.1)", dark: "oklch(0.324 0.015 240.4)" }, // bg0 #fdf6e3 / #2d353b
  surface: { light: "oklch(0.952 0.031 98.9)", dark: "oklch(0.36 0.017 227.1)" }, // bg1 #f4f0d9 / #343f44
  sunken: { light: "oklch(0.937 0.031 98.9)", dark: "oklch(0.28 0.012 232.9)" }, // bg_dim #efebd4 / #232a2e
  rule: { light: "oklch(0.91 0.03 98.5)", dark: "oklch(0.394 0.017 227)" }, // bg3 #e6e2cc / bg2 #3d484d
  "rule-strong": { light: "oklch(0.807 0.028 120.6)", dark: "oklch(0.455 0.015 236.9)" }, // bg5 #bdc3af / bg4 #4f585e
  muted: { light: "oklch(0.52 0.029 143.5)", dark: "oklch(0.743 0.019 153.4)" }, // grey2 #829181 darkened / #9da9a0 lightened
  text: { light: "oklch(0.515 0.021 232.9)", dark: "oklch(0.83 0.041 86.1)" }, // fg #5c6a72 / #d3c6aa
  ink: { light: "oklch(0.415 0.021 232.9)", dark: "oklch(0.89 0.041 86.1)" }, // fg darkened / lightened
  accent: { light: "oklch(0.545 0.156 118.2)", dark: "oklch(0.773 0.091 125.8)" }, // green #8da101 darkened / #a7c080
  "accent-text": { light: "oklch(0.49 0.156 118.2)", dark: "oklch(0.773 0.091 125.8)" }, // green darkened / #a7c080
  mark: { light: "oklch(0.747 0.155 80.3 / 0.15)", dark: "oklch(0.808 0.086 83.7 / 0.15)" }, // yellow #dfa000 / #dbbc7f
} satisfies ColorScheme;

/** Every shipped scheme by the name `svartz init --scheme` takes. Its export name is the camelCase form. */
export const colorSchemes = {
  catppuccin,
  "rose-pine": rosePine,
  nord,
  gruvbox,
  "tokyo-night": tokyoNight,
  dracula,
  solarized,
  everforest,
} as const satisfies Record<string, ColorScheme>;

export type ColorSchemeName = keyof typeof colorSchemes;

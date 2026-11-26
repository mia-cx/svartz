import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colorSchemes, type ColorToken } from "../src/schemes";

type Palette = Partial<Record<ColorToken, { light: string; dark: string }>>;

/**
 * Svartz's default palette, read from the tokens every theme imports, so the schemes answer to the same bar. Its
 * `accent-text` derives from the accent in CSS; the same formula applies here.
 */
function defaultPalette(): Palette {
  const css = readFileSync(new URL("../../ui/src/lib/styles/tokens.css", import.meta.url), "utf8");
  const pairs = css.matchAll(/--sv-([a-z-]+):\s*light-dark\((oklch\([^)]*\)),\s*(oklch\([^)]*\))\);/g);
  const palette: Record<string, { light: string; dark: string }> = {};
  for (const [, name, light, dark] of pairs) palette[name!] = { light: light!, dark: dark! };
  const [l, c, h] = parse(palette.accent!.light), [dl, dc, dh] = parse(palette.accent!.dark);
  palette["accent-text"] = { light: `oklch(${l - 0.1} ${c * 0.9} ${h})`, dark: `oklch(${dl + 0.06} ${dc * 0.88} ${dh})` };
  return palette;
}

function parse(color: string): [number, number, number, number] {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(color);
  if (!match) throw new Error(`Not an OKLCH colour: ${color}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 1)];
}

/** OKLCH to gamma-encoded sRGB, clipped to the gamut as a browser paints it. */
function srgb(color: string): { rgb: [number, number, number]; alpha: number } {
  const [L, C, H, alpha] = parse(color);
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const encode = (v: number) => {
    const x = Math.min(1, Math.max(0, v));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  };
  return { rgb: linear.map(encode) as [number, number, number], alpha };
}

/** A translucent colour painted over an opaque one, blended in sRGB as browsers do. */
function over(top: string, bottom: string): [number, number, number] {
  const { rgb, alpha } = srgb(top);
  const base = srgb(bottom).rgb;
  return rgb.map((v, i) => v * alpha + base[i]! * (1 - alpha)) as [number, number, number];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** WCAG AA: 4.5:1 for text, 3:1 for the accent as a focus ring and graphic. */
const TEXT = 4.5;
const GRAPHIC = 3;
const PAIRS: readonly [ColorToken, ColorToken, number][] = [
  ["text", "paper", TEXT],
  ["text", "surface", TEXT],
  ["text", "sunken", TEXT],
  ["ink", "paper", TEXT],
  ["muted", "paper", TEXT],
  ["muted", "surface", TEXT],
  ["muted", "sunken", TEXT],
  ["accent-text", "paper", TEXT],
  ["accent-text", "surface", TEXT],
  ["accent", "paper", GRAPHIC],
];

/** Every pair below its threshold, as `mode: fg on bg ratio`. */
function failures(palette: Palette): string[] {
  return (["light", "dark"] as const).flatMap((mode) => {
    const token = (name: ColorToken) => palette[name]![mode];
    const checks = PAIRS.map(([fg, bg, min]) =>
      [`${fg} on ${bg}`, contrast(srgb(token(fg)).rgb, srgb(token(bg)).rgb), min] as const);
    // ==Highlighted== text sits on the translucent mark over the paper.
    const marked = contrast(srgb(token("text")).rgb, over(token("mark"), token("paper")));
    return [...checks, ["text on mark", marked, TEXT] as const]
      .filter(([, ratio, min]) => ratio < min)
      .map(([pair, ratio]) => `${mode}: ${pair} ${ratio.toFixed(2)}`);
  });
}

describe("colour contrast (WCAG AA)", () => {
  // Proves the default palette the schemes answer to meets AA, so the check below holds them to a real bar.
  it("holds for the default palette", () => {
    expect(failures(defaultPalette())).toEqual([]);
  });

  // Proves every shipped scheme keeps body text, muted text, links, and the accent readable in both modes.
  it.each(Object.entries(colorSchemes))("holds for %s", (_, scheme) => {
    expect(failures(scheme)).toEqual([]);
  });
});

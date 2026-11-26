import { statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import { cancel, confirm, intro, isCancel, select, text } from "@clack/prompts";
import { colorSchemes, type ColorScheme, type ColorSchemeName } from "@svartz/config/schemes";
import {
  demoUrl,
  domainProblem,
  idProblem,
  InitCancelledError,
  SCHEMES,
  slug,
  TARGETS,
  THEMES,
  vaultPath,
  workerProblem,
  workers,
  type InitContext,
  type ThemeName,
  type VaultChoice,
  type VaultTarget,
} from "./init-plan";

/** Where the questions read keys and draw; a terminal by default. Tests pass their own. */
export type PromptStreams = { readonly input?: Readable; readonly output?: Writable };

/** The value the scheme question gives Svartz's own palette. */
const DEFAULT_SCHEME = "svartz";

/** Svartz's own paper, text and accent (`tokens.css`), for its swatch beside the schemes'. */
const SVARTZ_SWATCH = {
  paper: { light: "oklch(0.985 0.004 80)", dark: "oklch(0.155 0.005 80)" },
  text: { light: "oklch(0.3 0.01 80)", dark: "oklch(0.86 0.008 80)" },
  accent: { light: "oklch(0.58 0.2 33)", dark: "oklch(0.7 0.17 36)" },
} satisfies Partial<ColorScheme>;

/** An OKLCH colour as 8-bit sRGB `r;g;b`, the form terminal truecolor escapes take. */
function terminalRgb(color: string): string {
  const [L = 0, C = 0, H = 0] = color.replace(/^oklch\(|\s*\/.*$|\)$/g, "").split(/\s+/).map(Number);
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((value) => {
    const v = Math.min(1, Math.max(0, value));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  }).join(";");
}

/** "Aa" in the text colour and a dot in the accent, on the paper, for light then dark mode. */
function swatch(scheme: Pick<ColorScheme, "paper" | "text" | "accent">): string {
  return (["light", "dark"] as const).map((mode) =>
    `\x1b[48;2;${terminalRgb(scheme.paper[mode])}m\x1b[38;2;${terminalRgb(scheme.text[mode])}m Aa` +
    `\x1b[38;2;${terminalRgb(scheme.accent[mode])}m ● \x1b[0m`).join("");
}

const isDirectory = (file: string) => statSync(file, { throwIfNoEntry: false })?.isDirectory() ?? false;
const expandHome = (input: string) => input.replace(/^~(?=$|[\\/])/, os.homedir());

/** A prompt's answer, or {@link InitCancelledError} once the person cancels. */
const answers = (streams: PromptStreams) => <T>(value: T): Exclude<T, symbol> => {
  if (isCancel(value)) {
    cancel("No files changed.", streams);
    throw new InitCancelledError({ message: "Cancelled. No files changed." });
  }
  // isCancel guards `symbol`, which TypeScript can't subtract from a generic type.
  return value as Exclude<T, symbol>;
};

/**
 * Ask which vaults to create or publish, and for each its theme, colour scheme and target. Throws
 * {@link InitCancelledError} when the person cancels.
 */
export async function askVaults(context: InitContext, streams: PromptStreams = {}): Promise<VaultChoice[]> {
  const output = streams.output ?? process.stdout;
  const colours = "hasColors" in output && typeof output.hasColors === "function" && output.hasColors(2 ** 24);
  const answer = answers(streams);
  const resolve = (input: string) => path.resolve(context.root, expandHome(input.trim()));

  intro("Set up Svartz", streams);
  const vaults: VaultChoice[] = [];
  do {
    const ids = vaults.map((vault) => vault.id);
    const source = answer(await select({
      ...streams,
      message: vaults.length === 0 ? "Start a new vault, or publish a folder you have?" : "Next vault: new, or a folder you have?",
      options: [
        { value: "new", label: "New vault" },
        { value: "existing", label: "Existing folder", hint: "an Obsidian vault or any folder of notes" },
      ],
    }));

    let id: string, title: string, folder: string;
    if (source === "new") {
      title = answer(await text({
        ...streams,
        message: "Vault name",
        placeholder: "Notes",
        validate: (value = "") => {
          const name = slug(value);
          if (!name) return "Give the vault a name with at least one letter or digit.";
          if (statSync(resolve(name), { throwIfNoEntry: false }))
            return `${name} already exists here. Pick another name, or publish it as an existing folder.`;
          return idProblem(name, ids);
        },
      })).trim();
      id = folder = slug(title);
    } else {
      const input = answer(await text({
        ...streams,
        message: "Vault folder",
        placeholder: "~/Obsidian/Notes",
        validate: (value = "") => {
          if (!value.trim()) return "Enter the path to the folder.";
          if (!isDirectory(resolve(value))) return `There's no folder at ${value.trim()}.`;
          if (vaults.some((vault) => vault.path === vaultPath(context.root, resolve(value))))
            return "Another vault already publishes this folder.";
        },
      }));
      folder = vaultPath(context.root, resolve(input));
      title = answer(await text({
        ...streams,
        message: "Site title",
        initialValue: path.basename(resolve(input)),
        validate: (value = "") => slug(value) ? idProblem(slug(value), ids) : "Give the site a title with at least one letter or digit.",
      })).trim();
      id = slug(title);
    }

    const theme = answer(await select({
      ...streams,
      message: "Theme",
      options: (Object.keys(THEMES) as ThemeName[]).map((value) => ({
        value,
        label: THEMES[value].label,
        hint: `${THEMES[value].purpose} · ${demoUrl(value)}`,
      })),
    }));

    const scheme = answer(await select<ColorSchemeName | typeof DEFAULT_SCHEME>({
      ...streams,
      message: "Colour scheme",
      options: [
        { value: DEFAULT_SCHEME, label: colours ? `Svartz ${swatch(SVARTZ_SWATCH)}` : "Svartz", hint: "ink on warm paper" },
        ...(Object.keys(SCHEMES) as ColorSchemeName[]).map((value) => ({
          value,
          label: colours ? `${SCHEMES[value]} ${swatch(colorSchemes[value])}` : SCHEMES[value],
        })),
      ],
    }));

    const target = context.host ? { type: "host" } as const : await askTarget(id, vaults, streams);
    vaults.push({
      id,
      path: folder,
      title,
      theme,
      ...(scheme === DEFAULT_SCHEME ? {} : { scheme }),
      target,
    });
  } while (answer(await confirm({ ...streams, message: "Add another vault?", initialValue: false })));
  return vaults;
}

async function askTarget(id: string, vaults: readonly VaultChoice[], streams: PromptStreams): Promise<VaultTarget> {
  const answer = answers(streams);
  const type = answer(await select({
    ...streams,
    message: "Where will it deploy?",
    options: (Object.keys(TARGETS) as (keyof typeof TARGETS)[]).map((value) => ({ value, label: TARGETS[value] })),
  }));
  if (type !== "cloudflare-workers") return { type };
  const taken = workers(vaults);
  const name = answer(await text({
    ...streams,
    message: "Worker name",
    initialValue: id,
    validate: (value = "") => workerProblem(value.trim(), taken.map((worker) => worker.name)),
  })).trim();
  const domain = answer(await text({
    ...streams,
    message: "Domain",
    placeholder: "Leave empty to use workers.dev",
    validate: (value = "") => value.trim()
      ? domainProblem(value.trim().toLowerCase(), taken.flatMap((worker) => worker.domain ?? []))
      : undefined,
  })).trim().toLowerCase();
  return { type, name, ...(domain ? { domain } : {}) };
}

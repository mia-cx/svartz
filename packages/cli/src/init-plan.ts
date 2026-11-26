import path from "node:path";
import { colorSchemes, type ColorSchemeName } from "@svartz/config/schemes";
import { Data } from "effect";

/** The first-party themes `svartz init` offers: what each is for, and the subdomain of its demo on svartz.dev. */
export const THEMES = {
  minimal: { label: "Minimal", purpose: "Notes and digital gardens", demo: "minimal" },
  wiki: { label: "Wiki", purpose: "Wikis with infoboxes and categories", demo: "wiki" },
  blog: { label: "Blog", purpose: "Posts, tags and an archive", demo: "blog" },
  docs: { label: "Docs", purpose: "Package reference: modules, classes and functions", demo: "docs" },
  "api-docs": { label: "API docs", purpose: "REST and GraphQL endpoints", demo: "api" },
  "mcp-docs": { label: "MCP docs", purpose: "MCP server tools and their schemas", demo: "reference" },
} as const;
export type ThemeName = keyof typeof THEMES;

export const demoUrl = (theme: ThemeName) => `https://${THEMES[theme].demo}.demo.svartz.dev`;

/** Display names for the shipped colour schemes, in the order init lists them. */
export const SCHEMES: Readonly<Record<ColorSchemeName, string>> = {
  catppuccin: "Catppuccin",
  "rose-pine": "Rosé Pine",
  nord: "Nord",
  gruvbox: "Gruvbox",
  "tokyo-night": "Tokyo Night",
  dracula: "Dracula",
  solarized: "Solarized",
  everforest: "Everforest",
};

/** Where a standalone vault deploys. Host apps render their vaults themselves (`host`). */
export const TARGETS = {
  static: "Static files",
  node: "Node server",
  "cloudflare-workers": "Cloudflare Workers",
  "cloudflare-pages": "Cloudflare Pages",
} as const;

export type VaultTarget =
  | { readonly type: "host" | keyof Omit<typeof TARGETS, "cloudflare-workers"> }
  | { readonly type: "cloudflare-workers"; readonly name: string; readonly domain?: string };

/** One vault `svartz init` writes: a folder that exists is published as it is, and a new one gets a starter note. */
export type VaultChoice = {
  readonly id: string;
  /** Relative to the project root. */
  readonly path: string;
  readonly title: string;
  readonly theme: ThemeName;
  /** A shipped colour scheme, or the Svartz palette when absent. */
  readonly scheme?: ColorSchemeName;
  readonly target: VaultTarget;
};

/** What init knows before it asks: whether it is integrating a host app, and the name it gives the site by default. */
export type InitContext = {
  readonly root: string;
  readonly host: boolean;
  readonly siteName: string;
};

/**
 * The answers `svartz init` takes as flags. Each is repeatable: given once it applies to every vault, given once per
 * `--vault` it matches them in order. `--worker` and `--domain` count only the `cloudflare-workers` vaults.
 */
export type InitFlags = {
  readonly vault?: readonly string[];
  readonly id?: readonly string[];
  readonly title?: readonly string[];
  readonly theme?: readonly string[];
  readonly scheme?: readonly string[];
  readonly target?: readonly string[];
  readonly worker?: readonly string[];
  readonly domain?: readonly string[];
};

/** An answer `svartz init` can't use. */
export class InitUsageError extends Data.TaggedError("InitUsageError")<{ readonly message: string }> {}

/** The person stopped the questions; nothing was written. */
export class InitCancelledError extends Data.TaggedError("InitCancelledError")<{ readonly message: string }> {}

const ID = /^[a-z0-9][a-z0-9-]*$/;
/** Cloudflare's rule for Worker names. */
const WORKER = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/** A name as a vault id and folder: `Field Notes` becomes `field-notes`. */
export function slug(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** `input` relative to the project root, with forward slashes, as the config writes it. */
export function vaultPath(root: string, input: string): string {
  return path.relative(root, path.resolve(root, input)).split(path.sep).join("/") || ".";
}

const isTheme = (value: string): value is ThemeName => Object.hasOwn(THEMES, value);
const isScheme = (value: string): value is ColorSchemeName => Object.hasOwn(colorSchemes, value);
const isTarget = (value: string): value is VaultTarget["type"] => value === "host" || Object.hasOwn(TARGETS, value);

const list = (values: readonly string[]) => values.join(", ");

/** Why `id` can't name a vault, or nothing when it can. */
export function idProblem(id: string, taken: readonly string[]): string | undefined {
  if (!ID.test(id)) return `Use lowercase letters, digits and dashes for a vault id, not "${id}".`;
  if (taken.includes(id)) return `Two vaults can't share the id "${id}".`;
}

/** Why `name` can't name a Worker, or nothing when it can. */
export function workerProblem(name: string, taken: readonly string[]): string | undefined {
  if (!WORKER.test(name)) return `Use up to 63 lowercase letters, digits and dashes for a Worker name, not "${name}".`;
  if (taken.includes(name)) return `Two vaults can't deploy to the Worker "${name}".`;
}

/** Why `domain` can't serve a Worker, or nothing when it can. */
export function domainProblem(domain: string, taken: readonly string[]): string | undefined {
  if (!DOMAIN.test(domain)) return `"${domain}" isn't a domain. Write it without https://, like notes.example.com.`;
  if (taken.includes(domain)) return `Two vaults can't answer on ${domain}.`;
}

/** The Workers that `vaults` already deploy to. */
export function workers(vaults: readonly VaultChoice[]) {
  return vaults.flatMap((vault) => vault.target.type === "cloudflare-workers" ? [vault.target] : []);
}

function workerTarget(name: string, domain: string | undefined, vaults: readonly VaultChoice[]): VaultTarget {
  const taken = workers(vaults);
  const problem = workerProblem(name, taken.map((other) => other.name))
    ?? (domain === undefined ? undefined : domainProblem(domain, taken.flatMap((other) => other.domain ?? [])));
  if (problem) throw new InitUsageError({ message: problem });
  return { type: "cloudflare-workers", name, ...(domain === undefined ? {} : { domain }) };
}

/**
 * The vaults the flags describe; with no flags, the one vault init has always written. Throws
 * {@link InitUsageError} for an unknown theme, scheme or target, a flag repeated a different number of times
 * than the vaults it describes, or two vaults that would collide.
 */
export function vaultsFromFlags(flags: InitFlags, context: InitContext): VaultChoice[] {
  const paths = flags.vault ?? [];
  const count = Math.max(1, paths.length);
  /** A flag's value for the `index`th of `among` vaults: its one value, or its value in that position. */
  const answer = (flag: keyof InitFlags, index: number, among = count): string | undefined => {
    const values = flags[flag] ?? [];
    if (values.length > 1 && values.length !== among)
      throw new InitUsageError({
        message: flag === "worker" || flag === "domain"
          ? `--${flag} is given ${values.length} times for ${among} cloudflare-workers vaults. Give it once per Worker.`
          : `--${flag} is given ${values.length} times for ${count} vaults. Give it once for all of them, or once per --vault.`,
      });
    return values.length === 1 ? values[0] : values[index];
  };
  const types = Array.from({ length: count }, (_, index) => {
    const type = answer("target", index) ?? (context.host ? "host" : "static");
    if (isTarget(type)) return type;
    throw new InitUsageError({ message: `There's no target "${type}". Pick one of ${list(["host", ...Object.keys(TARGETS)])}.` });
  });
  // --worker and --domain describe the Workers alone, in the order those vaults come.
  const workerCount = types.filter((type) => type === "cloudflare-workers").length;
  if (workerCount === 0 && (flags.worker?.length || flags.domain?.length))
    throw new InitUsageError({ message: "--worker and --domain need a vault with --target cloudflare-workers." });
  const vaults: VaultChoice[] = [];
  for (let index = 0; index < count; index++) {
    const folder = paths[index];
    const theme = answer("theme", index) ?? "minimal";
    if (!isTheme(theme)) throw new InitUsageError({ message: `There's no theme "${theme}". Pick one of ${list(Object.keys(THEMES))}.` });
    const scheme = answer("scheme", index);
    if (scheme !== undefined && !isScheme(scheme))
      throw new InitUsageError({ message: `There's no colour scheme "${scheme}". Pick one of ${list(Object.keys(colorSchemes))}.` });
    const id = answer("id", index) ?? (folder === undefined ? "notes" : slug(path.basename(path.resolve(context.root, folder))));
    const problem = idProblem(id, vaults.map((vault) => vault.id));
    if (problem) throw new InitUsageError({ message: problem });
    const type = types[index]!;
    const worker = workers(vaults).length;
    const target: VaultTarget = type === "cloudflare-workers"
      ? workerTarget(answer("worker", worker, workerCount) ?? id, answer("domain", worker, workerCount), vaults)
      : { type };
    const where = vaultPath(context.root, folder ?? "vault");
    if (vaults.some((vault) => vault.path === where))
      throw new InitUsageError({ message: `Two vaults can't share the folder ${where}.` });
    vaults.push({
      id,
      path: where,
      title: answer("title", index) ?? (count === 1 ? context.siteName : path.basename(path.resolve(context.root, where))),
      theme,
      ...(scheme === undefined ? {} : { scheme }),
      target,
    });
  }
  return vaults;
}

/** The theme packages a project installs for `vaults`. Minimal ships with Svartz. */
export function themePackages(vaults: readonly VaultChoice[]): string[] {
  return [...new Set(vaults.filter((vault) => vault.theme !== "minimal").map((vault) => `@svartz/theme-${vault.theme}`))];
}

const quote = (value: string) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
/** A scheme's export name in `@svartz/config/schemes`: `rose-pine` is `rosePine`. */
const exportName = (scheme: ColorSchemeName) => scheme.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());

function renderTarget(target: VaultTarget): string {
  if (target.type !== "cloudflare-workers") return `{ type: ${quote(target.type)} }`;
  const routes = target.domain ? `, routes: [{ pattern: ${quote(target.domain)}, custom_domain: true }]` : "";
  return `{ type: 'cloudflare-workers', name: ${quote(target.name)}${routes} }`;
}

/** `svartz.config.ts` for `vaults`, importing the colour schemes they use by name. */
export function renderConfig(vaults: readonly VaultChoice[]): string {
  const schemes = [...new Set(vaults.flatMap((vault) => vault.scheme ? [exportName(vault.scheme)] : []))];
  const imports = [
    "import { defineConfig } from '@svartz/config';",
    ...(schemes.length > 0 ? [`import { ${schemes.join(", ")} } from '@svartz/config/schemes';`] : []),
  ];
  const entries = vaults.map((vault) => {
    const theme = quote(`@svartz/theme-${vault.theme}`);
    const domain = vault.target.type === "cloudflare-workers" ? vault.target.domain : undefined;
    const fields = [
      `id: ${quote(vault.id)}`,
      `path: ${quote(vault.path)}`,
      `target: ${renderTarget(vault.target)}`,
      `theme: ${vault.scheme ? `{ base: ${theme}, tokens: ${exportName(vault.scheme)} }` : theme}`,
      `site: { title: ${quote(vault.title)}${domain ? `, url: ${quote(`https://${domain}`)}` : ""} }`,
    ];
    return `    {\n${fields.map((field) => `      ${field},`).join("\n")}\n    },`;
  });
  return `${imports.join("\n")}

export default defineConfig({
  version: '1.0.0',
  vaults: [
${entries.join("\n")}
  ],
});
`;
}

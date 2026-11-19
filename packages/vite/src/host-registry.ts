import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ResolvedConfig } from "@svartz/core";
import {
  getGeneratedIndexModulePath,
  getGeneratedPluginPagesModulePath,
  getGeneratedRuntimeArtifactsModulePath,
  getGeneratedRuntimeServerModulePath,
  getGeneratedRuntimeThemeModulePath,
} from "./artifacts";

export const HOST_STYLES_PLACEHOLDER = "__SVARTZ_HOST_STYLES__";

/** SvelteKit's `paths.base`, and `paths.assets` or the base when it has none: the prefixes `$app/paths` exported before SvelteKit 3. */
export interface SvelteKitPaths {
  readonly base: string;
  readonly assets: string;
}

/** Read SvelteKit's paths from the definitions it puts in Vite's resolved config, the same in SvelteKit 2 and 3. */
export function svelteKitPaths(define: Readonly<Record<string, unknown>> | undefined): SvelteKitPaths | undefined {
  const read = (key: string): string | undefined => {
    const value = define?.[key];
    return typeof value === "string" ? JSON.parse(value) as string : undefined;
  };
  const base = read("__SVELTEKIT_PATHS_BASE__");
  return base === undefined ? undefined : { base, assets: read("__SVELTEKIT_PATHS_ASSETS__") || base };
}

/** SvelteKit's `paths.base` alone, from the same definitions as {@link svelteKitPaths}. */
export function svelteKitBasePath(define: Readonly<Record<string, unknown>> | undefined): string | undefined {
  return svelteKitPaths(define)?.base;
}

/** Standalone targets declare their base; hosts use SvelteKit's configured base. */
export function deploymentBasePath(config: ResolvedConfig, kitBasePath?: string): string {
  if (config.target.type === "static" || config.target.type === "node") {
    return typeof config.target.basePath === "string" ? config.target.basePath.replace(/\/+$/, "") : "";
  }
  return kitBasePath ?? (config.site.url ? new URL(config.site.url).pathname.replace(/\/+$/, "") : "");
}

/**
 * `virtual:svartz/index`: each vault's published index and site metadata, in config order. It imports no page
 * runtime or theme, not even dynamically, so a host that only reads the index never compiles Svartz's page runtime.
 */
export function createHostIndexSource(vaults: readonly ResolvedConfig[], kitBasePath?: string): string {
  const imports = vaults.map((vault, index) =>
    `import { index as index${index} } from ${JSON.stringify(getGeneratedIndexModulePath(vault))};`
  );
  const records = vaults.map((vault, index) => {
    const { favicon: _favicon, ...siteConfig } = vault.site;
    return `  { id: ${JSON.stringify(vault.id)}, mountPath: ${JSON.stringify(vault.mountPath)}, basePath: ${JSON.stringify(deploymentBasePath(vault, kitBasePath))}, index: index${index}, siteConfig: ${JSON.stringify(siteConfig)} },`;
  });
  return [...imports, `export const vaults = [\n${records.join("\n")}\n];`, ""].join("\n");
}

/**
 * `virtual:svartz/host`: the host eagerly reads route metadata and loads runtime code only for the selected mount.
 * It also exports SvelteKit's `base` and `assets`, which SvelteKit 3's `$app/paths` no longer does.
 */
export function createHostRegistrySource(vaults: readonly ResolvedConfig[], kitPaths?: SvelteKitPaths): string {
  const imports = vaults.flatMap((vault, index) => [
    `import * as index${index} from ${JSON.stringify(getGeneratedIndexModulePath(vault))};`,
    `import { pluginPages as pages${index} } from ${JSON.stringify(getGeneratedPluginPagesModulePath(vault))};`,
  ]);
  const records = vaults.map((vault, index) => {
    const { favicon: _favicon, ...siteConfig } = vault.site;
    return `  { id: ${JSON.stringify(vault.id)}, mountPath: ${JSON.stringify(vault.mountPath)}, basePath: ${JSON.stringify(deploymentBasePath(vault, kitPaths?.base))}, pluginPages: pages${index}, artifacts: { index: index${index}.index, siteConfig: ${JSON.stringify(siteConfig)} }, theme: undefined },`;
  });
  const loaders = vaults.map((vault) => `  () => Promise.all([import(${JSON.stringify(getGeneratedRuntimeArtifactsModulePath(vault))}), import(${JSON.stringify(getGeneratedRuntimeThemeModulePath(vault))})]),`);
  return [
    ...imports,
    `export const base = ${JSON.stringify(kitPaths?.base ?? "")};`,
    `export const assets = ${JSON.stringify(kitPaths?.assets ?? "")};`,
    `export const vaults = [\n${records.join("\n")}\n];`,
    "// Kit evaluates the server bundle before client CSS exists; the client build fills this marker before prerendering.",
    `const runtimeStyles = import.meta.env.SSR ? (() => { try { return JSON.parse(${JSON.stringify(HOST_STYLES_PLACEHOLDER)}); } catch { return []; } })() : [];`,
    `const loadRuntime = [\n${loaders.join("\n")}\n];`,
    "const preparing = new Map();",
    "export const routes = {",
    "  all: [...new Set(vaults.flatMap((vault) => vault.artifacts.index.routes.all))],",
    "  redirects: Object.assign({}, ...vaults.map((vault) => vault.artifacts.index.routes.redirects)),",
    "};",
    "// The plugin page route, `[...mount=svartzMount]/-/[...page=svartzPage]`, matches only the mount of a vault with",
    "// plugin pages and a page name one claims, so any other path, a note in a folder named `-` included, stays a note.",
    "const pageVaults = vaults.filter((vault) => vault.pluginPages.length > 0);",
    "export const isPluginPageMount = (param) => pageVaults.some((vault) => vault.mountPath === (param && `/${param}`));",
    "export const isPluginPageName = (param) => pageVaults.some((vault) => vault.pluginPages.includes(param.split('/', 1)[0]));",
    "function findHostVault(pathname) {",
    "  return vaults.find(({ mountPath }) => {",
    "    return pathname === mountPath || pathname.startsWith(`${mountPath}/`);",
    "  });",
    "}",
    "function noteArtifactKey(selected, pathname) {",
    "  const vaultPathname = selected.mountPath ? pathname.slice(selected.mountPath.length) || '/' : pathname;",
    "  const slug = vaultPathname === '/' ? undefined : vaultPathname.replace(/^\\/+|\\/+$/g, '');",
    "  const match = selected.theme.resolveRuntimeRoute({ pathname: vaultPathname, slug });",
    "  const canonicalPath = pathname.endsWith('/') ? pathname : pathname + '/';",
    "  const entry = selected.artifacts.index.entries.find((candidate) => candidate.href === canonicalPath);",
    "  return entry && match?.route.id !== 'note' ? 'pages/' + entry.slug + '.svelte' : match?.artifactKey;",
    "}",
    "export function hostStylesheets(pathname) {",
    "  const selected = findHostVault(pathname);",
    "  if (!selected?.theme) return [];",
    "  const styles = runtimeStyles[vaults.indexOf(selected)];",
    "  if (!styles) return [];",
    "  const key = noteArtifactKey(selected, pathname);",
    "  return [...styles.shared, ...(key ? styles.notes[key] ?? [] : [])];",
    "}",
    "export function resolveHostVault(pathname) {",
    "  const selected = findHostVault(pathname);",
    "  return selected?.theme ? selected : undefined;",
    "}",
    "export async function prepareHostVault(pathname) {",
    "  const selected = findHostVault(pathname);",
    "  if (!selected) return;",
    "  if (!preparing.has(selected.id)) {",
    "    preparing.set(selected.id, loadRuntime[vaults.indexOf(selected)]().then(async ([artifacts, theme]) => {",
    "      await theme.ready;",
    "      selected.artifacts = artifacts;",
    "      selected.theme = theme;",
    "    }).catch((error) => { preparing.delete(selected.id); throw error; }));",
    "  }",
    "  await preparing.get(selected.id);",
    "  const key = noteArtifactKey(selected, pathname);",
    "  if (key && selected.artifacts.hasNoteArtifact(key)) await selected.artifacts.prepareNoteArtifact(key);",
    "  return selected;",
    "}",
  ].join("\n");
}

/** Use a fixed-length lowercase digest so every valid ID fits a filesystem filename. */
export function getGeneratedHostStylesPath(hostRegistryPath: string, vaultId: string): string {
  return join(dirname(hostRegistryPath), "styles", `${createHash("sha256").update(vaultId).digest("hex")}.json`);
}

export function getGeneratedHostRegistryPath(configDir: string): string {
  return join(configDir, ".svartz", "host", "runtime.ts");
}

export function getGeneratedHostIndexPath(configDir: string): string {
  return join(configDir, ".svartz", "host", "index.ts");
}

export function getGeneratedHostServerPath(configDir: string): string {
  return join(configDir, ".svartz", "host", "server.ts");
}

/**
 * `virtual:svartz/server` in a host app: `svartzHandle` runs every host vault's generated handle in turn, and
 * `svartzPage` asks each vault for the plugin page at a URL.
 */
export function createHostServerSource(vaults: readonly ResolvedConfig[]): string {
  return [
    ...vaults.map((vault, index) =>
      `import { svartzHandle as vault${index}, svartzPage as page${index} } from ${JSON.stringify(getGeneratedRuntimeServerModulePath(vault))};`),
    `const handles = [${vaults.map((_vault, index) => `vault${index}`).join(", ")}];`,
    `const pages = [${vaults.map((_vault, index) => `page${index}`).join(", ")}];`,
    "// Mounts never overlap, so at most one vault answers; the others pass the request on.",
    "export const svartzHandle = ({ event, resolve }) =>",
    "  handles.reduceRight((next, handle) => (request) => handle({ event: request, resolve: next }), resolve)(event);",
    "export const svartzPage = async (event) => {",
    "  for (const page of pages) {",
    "    const result = await page(event);",
    "    if (result) return result;",
    "  }",
    "};",
    "",
  ].join("\n");
}

type ResolvedPlugins = readonly { readonly name: string; readonly api?: unknown }[];

interface KitOptions {
  readonly adapter?: { readonly name?: unknown };
  readonly env?: { readonly dir?: string };
  readonly kit?: { readonly adapter?: { readonly name?: unknown } };
}

/**
 * The app's SvelteKit options, which the resolved `vite-plugin-sveltekit-setup` plugin exposes in SvelteKit 3 and
 * late SvelteKit 2: the adapter sits at the top level when passed to `sveltekit({ … })`, and under `kit` when read
 * from `svelte.config.js`. Earlier SvelteKit 2 releases expose none.
 */
function kitOptions(plugins: ResolvedPlugins): KitOptions | undefined {
  const api = plugins.find((plugin) => plugin.name === "vite-plugin-sveltekit-setup")?.api as
    | { options?: KitOptions }
    | undefined;
  return api?.options;
}

/**
 * Whether the app in `root` installs SvelteKit 3 or later. Its options can't tell: SvelteKit 2.62 and later also
 * take them in `sveltekit({ … })`. An app without a resolvable SvelteKit counts as SvelteKit 2, whose behaviour
 * Svartz assumed before SvelteKit 3.
 */
export function isSvelteKit3(root: string): boolean {
  try {
    const { version } = createRequire(join(root, "package.json"))("@sveltejs/kit/package.json") as { version: string };
    return Number.parseInt(version, 10) >= 3;
  } catch {
    return false;
  }
}

/** The directory SvelteKit 3 loads `.env` from, resolved as SvelteKit resolves it: against the working directory. */
export function readKitEnvDir(plugins: ResolvedPlugins): string {
  return resolve(kitOptions(plugins)?.env?.dir ?? ".");
}

/**
 * The host app's adapter name, from `sveltekit({ adapter })` or `kit.adapter` in `svelte.config.js` or `.ts` in
 * `root`.
 */
export async function readHostAdapterName(root: string, plugins: ResolvedPlugins): Promise<string | undefined> {
  const options = kitOptions(plugins);
  if (options) {
    const name = (options.adapter ?? options.kit?.adapter)?.name;
    return typeof name === "string" ? name : undefined;
  }
  const file = ["js", "ts"].map((extension) => join(root, `svelte.config.${extension}`)).find((path) => existsSync(path));
  if (!file) return undefined;
  // Bust the import cache so a dev restart sees an edited adapter, as SvelteKit does.
  const config = await import(`${pathToFileURL(file).href}?svartz=${Date.now()}`) as {
    default?: { kit?: { adapter?: { name?: unknown } } };
  };
  const name = config.default?.kit?.adapter?.name;
  return typeof name === "string" ? name : undefined;
}

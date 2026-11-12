import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ResolvedConfig } from "@svartz/core";
import {
  getGeneratedIndexModulePath,
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
  const imports = vaults.map((vault, index) =>
    `import * as index${index} from ${JSON.stringify(getGeneratedIndexModulePath(vault))};`
  );
  const records = vaults.map((vault, index) => {
    const { favicon: _favicon, ...siteConfig } = vault.site;
    return `  { id: ${JSON.stringify(vault.id)}, mountPath: ${JSON.stringify(vault.mountPath)}, basePath: ${JSON.stringify(deploymentBasePath(vault, kitPaths?.base))}, artifacts: { index: index${index}.index, siteConfig: ${JSON.stringify(siteConfig)} }, theme: undefined },`;
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

/** `virtual:svartz/server` in a host app: `svartzHandle` runs every host vault's generated handle in turn. */
export function createHostServerSource(vaults: readonly ResolvedConfig[]): string {
  return [
    ...vaults.map((vault, index) =>
      `import { svartzHandle as vault${index} } from ${JSON.stringify(getGeneratedRuntimeServerModulePath(vault))};`),
    `const handles = [${vaults.map((_vault, index) => `vault${index}`).join(", ")}];`,
    "// Mounts never overlap, so at most one vault answers; the others pass the request on.",
    "export const svartzHandle = ({ event, resolve }) =>",
    "  handles.reduceRight((next, handle) => (request) => handle({ event: request, resolve: next }), resolve)(event);",
    "",
  ].join("\n");
}

/**
 * The host app's adapter name. SvelteKit 3 takes the adapter in `sveltekit({ adapter })` and exposes its config on
 * the resolved `vite-plugin-sveltekit-setup` plugin; SvelteKit 2 reads `kit.adapter` from `svelte.config.js` or `.ts`
 * in `root`.
 */
export async function readHostAdapterName(
  root: string,
  plugins: readonly { readonly name: string; readonly api?: unknown }[],
): Promise<string | undefined> {
  const kit3 = plugins.find((plugin) => plugin.name === "vite-plugin-sveltekit-setup")?.api as
    | { options?: { adapter?: { name?: unknown } } }
    | undefined;
  if (kit3?.options) return typeof kit3.options.adapter?.name === "string" ? kit3.options.adapter.name : undefined;
  const file = ["js", "ts"].map((extension) => join(root, `svelte.config.${extension}`)).find((path) => existsSync(path));
  if (!file) return undefined;
  // Bust the import cache so a dev restart sees an edited adapter, as SvelteKit does.
  const config = await import(`${pathToFileURL(file).href}?svartz=${Date.now()}`) as {
    default?: { kit?: { adapter?: { name?: unknown } } };
  };
  const name = config.default?.kit?.adapter?.name;
  return typeof name === "string" ? name : undefined;
}

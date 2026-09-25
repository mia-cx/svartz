import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { ResolvedConfig } from "@svartz/core";
import {
  getGeneratedIndexModulePath,
  getGeneratedRuntimeArtifactsModulePath,
  getGeneratedRuntimeThemeModulePath,
} from "./artifacts";

export const HOST_STYLES_PLACEHOLDER = "__SVARTZ_HOST_STYLES__";

/** Read the deployment base SvelteKit puts in Vite's resolved definitions. */
export function svelteKitBasePath(define: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const value = define?.["__SVELTEKIT_PATHS_BASE__"];
  return typeof value === "string" ? JSON.parse(value) as string : undefined;
}

/** Standalone targets declare their base; hosts use SvelteKit's configured base. */
export function deploymentBasePath(config: ResolvedConfig, kitBasePath?: string): string {
  if (config.target.type === "static" || config.target.type === "node") {
    return typeof config.target.basePath === "string" ? config.target.basePath.replace(/\/+$/, "") : "";
  }
  return kitBasePath ?? (config.site.url ? new URL(config.site.url).pathname.replace(/\/+$/, "") : "");
}

/** The host eagerly reads route metadata and loads runtime code only for the selected mount. */
export function createHostRegistrySource(vaults: readonly ResolvedConfig[], kitBasePath?: string): string {
  const imports = vaults.map((vault, index) =>
    `import * as index${index} from ${JSON.stringify(getGeneratedIndexModulePath(vault))};`
  );
  const records = vaults.map((vault, index) => {
    const { favicon: _favicon, ...siteConfig } = vault.site;
    return `  { id: ${JSON.stringify(vault.id)}, mountPath: ${JSON.stringify(vault.mountPath)}, basePath: ${JSON.stringify(deploymentBasePath(vault, kitBasePath))}, artifacts: { index: index${index}.index, siteConfig: ${JSON.stringify(siteConfig)} }, theme: undefined },`;
  });
  const loaders = vaults.map((vault) => `  () => Promise.all([import(${JSON.stringify(getGeneratedRuntimeArtifactsModulePath(vault))}), import(${JSON.stringify(getGeneratedRuntimeThemeModulePath(vault))})]),`);
  return [
    ...imports,
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

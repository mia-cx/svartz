import { join } from "node:path";
import type { ResolvedConfig } from "@svartz/core";
import {
  getGeneratedIndexModulePath,
  getGeneratedRuntimeArtifactsModulePath,
  getGeneratedRuntimeThemeModulePath,
} from "./artifacts";

/** Standalone targets declare their base; a host uses its canonical site URL. */
export function deploymentBasePath(config: ResolvedConfig): string {
  if (config.target.type === "static" || config.target.type === "node") {
    return typeof config.target.basePath === "string" ? config.target.basePath.replace(/\/+$/, "") : "";
  }
  return config.site.url ? new URL(config.site.url).pathname.replace(/\/+$/, "") : "";
}

/** The host eagerly reads route metadata and loads runtime code only for the selected mount. */
export function createHostRegistrySource(vaults: readonly ResolvedConfig[]): string {
  const imports = vaults.map((vault, index) =>
    `import * as index${index} from ${JSON.stringify(getGeneratedIndexModulePath(vault))};`
  );
  const records = vaults.map((vault, index) => {
    const { favicon: _favicon, ...siteConfig } = vault.site;
    return `  { id: ${JSON.stringify(vault.id)}, mountPath: ${JSON.stringify(vault.mountPath)}, basePath: ${JSON.stringify(deploymentBasePath(vault))}, artifacts: { index: index${index}.index, siteConfig: ${JSON.stringify(siteConfig)} }, theme: undefined },`;
  });
  const loaders = vaults.map((vault) => `  () => Promise.all([import(${JSON.stringify(getGeneratedRuntimeArtifactsModulePath(vault))}), import(${JSON.stringify(getGeneratedRuntimeThemeModulePath(vault))})]),`);
  return [
    ...imports,
    `export const vaults = [\n${records.join("\n")}\n];`,
    `const loadRuntime = [\n${loaders.join("\n")}\n];`,
    "const preparing = new Map();",
    "export const routes = {",
    "  all: [...new Set(vaults.flatMap((vault) => vault.artifacts.index.routes.all))],",
    "  redirects: Object.assign({}, ...vaults.map((vault) => vault.artifacts.index.routes.redirects)),",
    "};",
    "function findHostVault(pathname) {",
    "  return vaults.find(({ mountPath, basePath }) => {",
    "    const appPathname = basePath && pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname === basePath ? '/' : pathname;",
    "    return appPathname === mountPath || appPathname.startsWith(`${mountPath}/`);",
    "  });",
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
    "  return selected;",
    "}",
  ].join("\n");
}

export function getGeneratedHostRegistryPath(configDir: string): string {
  return join(configDir, ".svartz", "host", "runtime.ts");
}

import { join } from "node:path";
import type { ResolvedConfig } from "@svartz/core";
import {
  getGeneratedRuntimeArtifactsModulePath,
  getGeneratedRuntimeThemeModulePath,
} from "./artifacts";

/** The host imports one registry, while every vault keeps its own generated modules. */
export function createHostRegistrySource(vaults: readonly ResolvedConfig[]): string {
  const imports = vaults.flatMap((vault, index) => [
    `import * as artifacts${index} from ${JSON.stringify(getGeneratedRuntimeArtifactsModulePath(vault))};`,
    `import * as theme${index} from ${JSON.stringify(getGeneratedRuntimeThemeModulePath(vault))};`,
  ]);
  const records = vaults.map((vault, index) =>
    `  { id: ${JSON.stringify(vault.id)}, mountPath: ${JSON.stringify(vault.mountPath)}, artifacts: artifacts${index}, theme: theme${index} },`
  );
  return [
    ...imports,
    `export const vaults = [\n${records.join("\n")}\n];`,
    "export const routes = {",
    "  all: [...new Set(vaults.flatMap((vault) => vault.artifacts.routes.all))],",
    "  redirects: Object.assign({}, ...vaults.map((vault) => vault.artifacts.routes.redirects)),",
    "};",
    "export function resolveHostVault(pathname) {",
    "  return vaults.find(({ mountPath }) => pathname === mountPath || pathname.startsWith(`${mountPath}/`));",
    "}",
  ].join("\n");
}

export function getGeneratedHostRegistryPath(configDir: string): string {
  return join(configDir, ".svartz", "host", "runtime.ts");
}

/**
 * Svartz's generated public files (attachments, feeds, Markdown copies) must be in
 * SvelteKit's client output before it prerenders, or crawled links to them 404.
 * Kit's client build reloads only the Vite config file, so it never sees the
 * Svartz plugin the CLI passes inline. The plugin records its files in the
 * environment, and `withSvartzHost` emits them in that client build.
 */
import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";

const ENV = "SVARTZ_PUBLIC_ASSETS";
const MARKDOWN_ENV = "SVARTZ_MARKDOWN_ROUTES";

interface PublicAsset {
  /** Output path under the client root, including the vault mount. */
  readonly fileName: string;
  /** The artifact on disk. */
  readonly path: string;
}

const recorded = (): Record<string, readonly PublicAsset[]> => JSON.parse(process.env[ENV] ?? "{}");

/** Record one vault's public files for the client build. */
export function recordPublicAssets(vaultId: string, assets: readonly PublicAsset[]): void {
  process.env[ENV] = JSON.stringify({ ...recorded(), [vaultId]: assets });
}

/** Replace one vault's negotiation map, retaining other mounts in a composed host build. */
export function recordMarkdownRoutes(vaultId: string, routes: Readonly<Record<string, string>>): void {
  const vaults: Record<string, Record<string, string>> = JSON.parse(process.env[MARKDOWN_ENV] ?? "{}");
  process.env[MARKDOWN_ENV] = JSON.stringify({ ...vaults, [vaultId]: routes });
}

/** The platform adapter uses every vault's published page-to-copy mapping. */
export function getMarkdownRoutes(): Record<string, string> {
  const vaults: Record<string, Record<string, string>> = JSON.parse(process.env[MARKDOWN_ENV] ?? "{}");
  return Object.fromEntries(Object.values(vaults).flatMap((routes) => Object.entries(routes)));
}

/** Forget every recorded file. The CLI calls this before each build, so one vault's files never ship in the next's. */
export function clearPublicAssets(): void {
  delete process.env[ENV];
  delete process.env[MARKDOWN_ENV];
}

/** Emit the recorded files in the client build, unless the Svartz plugin there already did. */
export function publicAssetsPlugin(): Plugin {
  return {
    name: "svartz:public-assets",
    apply: "build",
    async generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      for (const asset of Object.values(recorded()).flat()) {
        if (asset.fileName in bundle) continue;
        this.emitFile({ type: "asset", fileName: asset.fileName, source: await readFile(asset.path) });
      }
    },
  };
}

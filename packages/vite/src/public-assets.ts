/**
 * Svartz's generated public files (attachments, feeds, Markdown copies) must be in
 * SvelteKit's client output before it prerenders, or crawled links to them 404.
 * Kit's client build reloads only the Vite config file, so it never sees the
 * Svartz plugin the CLI passes inline. The plugin records its files on
 * `globalThis`, which every copy of this module in the process shares, and
 * `withSvartzHost` emits them in that client build. Not in `process.env`: a
 * vault of a thousand notes outgrows the size one variable may have, and every
 * child process the build spawns after that fails with E2BIG.
 */
import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";

interface PublicAsset {
  /** Output path under the client root, including the vault mount. */
  readonly fileName: string;
  /** The artifact on disk. */
  readonly path: string;
}

interface Recorded {
  /** Each vault's public files, by vault id. */
  assets: Record<string, readonly PublicAsset[]>;
  /** Each vault's page-to-Markdown-copy map, by vault id. */
  markdown: Record<string, Readonly<Record<string, string>>>;
}

const KEY = Symbol.for("svartz.public-assets");
const store = globalThis as typeof globalThis & { [KEY]?: Recorded };
const recorded = (): Recorded => (store[KEY] ??= { assets: {}, markdown: {} });

/** Record one vault's public files for the client build. */
export function recordPublicAssets(vaultId: string, assets: readonly PublicAsset[]): void {
  recorded().assets[vaultId] = assets;
}

/** Replace one vault's negotiation map, retaining other mounts in a composed host build. */
export function recordMarkdownRoutes(vaultId: string, routes: Readonly<Record<string, string>>): void {
  recorded().markdown[vaultId] = routes;
}

/** The platform adapter uses every vault's published page-to-copy mapping. */
export function getMarkdownRoutes(): Record<string, string> {
  return Object.fromEntries(Object.values(recorded().markdown).flatMap((routes) => Object.entries(routes)));
}

/** Every recorded file's output path under the client root, for the platform adapter. */
export function getPublicFileNames(): string[] {
  return Object.values(recorded().assets).flat().map((asset) => asset.fileName);
}

/** Forget every recorded file. The CLI calls this before each build, so one vault's files never ship in the next's. */
export function clearPublicAssets(): void {
  delete store[KEY];
}

/** Emit the recorded files in the client build, unless the Svartz plugin there already did. */
export function publicAssetsPlugin(): Plugin {
  return {
    name: "svartz:public-assets",
    apply: "build",
    async generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      for (const asset of Object.values(recorded().assets).flat()) {
        if (asset.fileName in bundle) continue;
        this.emitFile({ type: "asset", fileName: asset.fileName, source: await readFile(asset.path) });
      }
    },
  };
}

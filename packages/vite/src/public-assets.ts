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

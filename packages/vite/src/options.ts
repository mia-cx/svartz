import type { ResolvedConfig } from "@svartz/core";

interface SvartzVitePluginOptions {
  readonly config: ResolvedConfig;
  readonly mode?: string;
  readonly env?: Readonly<Record<string, string>>;
  /**
   * Directory holding `svartz.config.ts`. Themes and Wrangler resolve from it, and the dev server looks for a Wrangler
   * config in it. Default: the Vite root.
   */
  readonly projectRoot?: string;
  /** Directory holding the Wrangler config the dev server reads bindings from, when it isn't `projectRoot`. */
  readonly wranglerDir?: string;
  /** Disable singleton virtual aliases when several vault plugins share one host. */
  readonly exposeVirtualModules?: boolean;
  /**
   * The commit the vault's files were read from, for a version snapshot. Its files never change, so its build is cached
   * and later builds reuse it while nothing else its build reads has changed.
   */
  readonly snapshot?: string;
  /** Mounts of vaults built inside this one's, such as its versions: a page of its own below one fails the build. */
  readonly nestedMounts?: readonly string[];
}

export type { SvartzVitePluginOptions };

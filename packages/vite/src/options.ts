import type { ResolvedConfig } from "@svartz/core";

interface SvartzVitePluginOptions {
  readonly config: ResolvedConfig;
  readonly mode?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Directory holding `svartz.config.ts`, where the dev server looks for a Wrangler config. Default: the Vite root. */
  readonly projectRoot?: string;
  /** Disable singleton virtual aliases when several vault plugins share one host. */
  readonly exposeVirtualModules?: boolean;
}

export type { SvartzVitePluginOptions };

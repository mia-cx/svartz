import type { ResolvedConfig } from "@svartz/core";

interface SvartzVitePluginOptions {
  readonly config: ResolvedConfig;
  readonly mode?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Disable singleton virtual aliases when several vault plugins share one host. */
  readonly exposeVirtualModules?: boolean;
}

export type { SvartzVitePluginOptions };

import type { ResolvedConfig } from "@svartz/core";

interface SvartzVitePluginOptions {
  readonly config: ResolvedConfig;
  readonly mode?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export type { SvartzVitePluginOptions };

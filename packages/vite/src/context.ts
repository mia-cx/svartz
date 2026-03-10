import { loadEnv, type ResolvedConfig as ViteResolvedConfig } from "vite";
import type { ResolvedConfig } from "@svartz/core";
import { getGeneratedArtifactsRoot } from "./artifacts";
import type { SvartzVitePluginOptions } from "./options";

interface SvartzViteContext {
  readonly config: ResolvedConfig;
  readonly root: string;
  readonly mode: string;
  readonly env: Readonly<Record<string, string>>;
  readonly generatedRoot: string;
}

function createSvartzViteContext(
  options: SvartzVitePluginOptions,
  resolved?: Pick<ViteResolvedConfig, "root" | "mode">,
): SvartzViteContext {
  const mode = options.mode ?? resolved?.mode ?? "production";
  const root = resolved?.root ?? process.cwd();
  const env = options.env ?? loadEnv(mode, root, "");

  return {
    config: options.config,
    root,
    mode,
    env,
    generatedRoot: getGeneratedArtifactsRoot(options.config),
  };
}

export { createSvartzViteContext };
export type { SvartzViteContext };

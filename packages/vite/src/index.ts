import {
  runStages,
  type Artifact,
  type PluginContext,
  type StageName,
  type SvartzTheme,
} from "@svartz/core";
import type { Plugin } from "vite";
import {
  RESOLVED_ARTIFACTS_VIRTUAL_ID,
  RESOLVED_THEME_VIRTUAL_ID,
  loadVirtualModule,
  resolveVirtualModuleId,
  type ResolvedSvartzVirtualModuleId,
  type SvartzVirtualModuleId,
} from "./virtual-modules";
import {
  createArtifactsVirtualModuleSource,
  getGeneratedArtifactsRoot,
  getGeneratedIndexModulePath,
  getGeneratedPageModulePath,
  getGeneratedPagesRoot,
  getVaultBuildRoot,
} from "./artifacts";
import { createSvartzViteContext, type SvartzViteContext } from "./context";
import type { SvartzVitePluginOptions } from "./options";
import {
  createThemeVirtualModuleSource,
  loadThemeModule,
  resolveThemeExport,
  resolveThemeModuleId,
  type ThemeModule,
} from "./theme-resolver";
import {
  assertRequiredCorePlugins,
  getThemePresetPlugins,
  resolveRuntimePlugins,
} from "./plugins";

const PIPELINE_STAGES: readonly StageName[] = [
  "discoverFiles",
  "parseFrontmatter",
  "filterUnpublished",
  "resolveLinks",
  "transformOfm",
  "transformGfm",
  "transformToc",
  "transformDescription",
  "transformSyntax",
  "transformLatex",
  "indexContent",
  "emitArtifacts",
] as const;

function svartz(options: SvartzVitePluginOptions): Plugin {
  let context = createSvartzViteContext(options);
  let themeModuleId = resolveThemeModuleId(context.config);
  let theme: SvartzTheme | undefined;
  let emittedArtifacts: Artifact[] = [];

  async function executePipeline(): Promise<void> {
    theme = await loadThemeModule((id) => import(id), context.config);
    const plugins = resolveRuntimePlugins(context.config, theme);
    const runnerContext: PluginContext = {
      config: context.config,
      files: [],
      artifacts: new Map(),
      meta: new Map(),
    };

    await runStages(plugins, runnerContext, PIPELINE_STAGES);
    emittedArtifacts = [...runnerContext.artifacts.values()];
  }

  return {
    name: "svartz:vite",
    configResolved(resolved) {
      context = createSvartzViteContext(options, resolved);
      themeModuleId = resolveThemeModuleId(context.config);
    },
    async buildStart() {
      await executePipeline();
    },
    resolveId(id) {
      return resolveVirtualModuleId(id) ?? null;
    },
    load(id) {
      if (id === RESOLVED_THEME_VIRTUAL_ID) {
        return createThemeVirtualModuleSource(themeModuleId);
      }

      if (id === RESOLVED_ARTIFACTS_VIRTUAL_ID) {
        return createArtifactsVirtualModuleSource(
          emittedArtifacts,
          getGeneratedIndexModulePath(context.config),
        );
      }

      return loadVirtualModule(id) ?? null;
    },
  };
}

export default svartz;
export { svartz };
export {
  createArtifactsVirtualModuleSource,
  getGeneratedArtifactsRoot,
  getGeneratedIndexModulePath,
  getGeneratedPageModulePath,
  getGeneratedPagesRoot,
  getVaultBuildRoot,
  createSvartzViteContext,
  createThemeVirtualModuleSource,
  loadThemeModule,
  resolveThemeExport,
  resolveThemeModuleId,
  loadVirtualModule,
  resolveVirtualModuleId,
  assertRequiredCorePlugins,
  getThemePresetPlugins,
  resolveRuntimePlugins,
};
export type {
  ResolvedSvartzVirtualModuleId,
  SvartzVirtualModuleId,
  SvartzViteContext,
  SvartzVitePluginOptions,
  ThemeModule,
};

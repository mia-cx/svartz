import { mergeConfig, type UserConfigExport } from "vite";

/** Preserve virtual modules and let Svelte compile packaged components in host apps. */
export function withSvartzHost(config: UserConfigExport): UserConfigExport {
  return async (env) => {
    const original = await (typeof config === "function"
      ? config(env)
      : config);
    return mergeConfig(original, {
      optimizeDeps: {
        exclude: ["@svartz/ui", "@svartz/ui/runtime", "@svartz/theme-minimal"],
      },
      resolve: {
        alias: {
          ...(process.env.SVARTZ_THEME_SOURCE_ID && process.env.SVARTZ_THEME_SOURCE_PATH
            ? { [process.env.SVARTZ_THEME_SOURCE_ID]: process.env.SVARTZ_THEME_SOURCE_PATH }
            : {}),
          ...(process.env.SVARTZ_THEME_MODULE_PATH
            ? { "virtual:svartz/theme": process.env.SVARTZ_THEME_MODULE_PATH }
            : {}),
          ...(process.env.SVARTZ_ARTIFACTS_MODULE_PATH
            ? {
                "virtual:svartz/artifacts":
                  process.env.SVARTZ_ARTIFACTS_MODULE_PATH,
              }
            : {}),
          ...(process.env.SVARTZ_HOST_MODULE_PATH
            ? { "virtual:svartz/host": process.env.SVARTZ_HOST_MODULE_PATH }
            : {}),
          ...(process.env.SVARTZ_TAILWIND_SOURCES_PATH
            ? {
                "virtual:svartz/tailwind-sources.css":
                  process.env.SVARTZ_TAILWIND_SOURCES_PATH,
              }
            : {}),
        },
      },
    });
  };
}

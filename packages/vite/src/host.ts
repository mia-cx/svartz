import { mergeConfig, type UserConfigExport } from "vite";

/** Preserve Svartz virtual modules when SvelteKit runs its secondary Vite build. */
export function withSvartzHost(config: UserConfigExport): UserConfigExport {
  return async (env) => {
    const original = await (typeof config === "function"
      ? config(env)
      : config);
    return mergeConfig(original, {
      resolve: {
        alias: {
          ...(process.env.SVARTZ_THEME_MODULE_PATH
            ? { "virtual:svartz/theme": process.env.SVARTZ_THEME_MODULE_PATH }
            : {}),
          ...(process.env.SVARTZ_ARTIFACTS_MODULE_PATH
            ? {
                "virtual:svartz/artifacts":
                  process.env.SVARTZ_ARTIFACTS_MODULE_PATH,
              }
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

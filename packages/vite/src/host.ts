import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { mergeConfig, type Plugin, type PluginOption, type UserConfigExport } from "vite";
import { HOST_STYLES_PLACEHOLDER } from "./host-registry";

interface HostStyleManifest {
  readonly modules: readonly string[];
  readonly path: string;
}

/** The server bundle is built before the client CSS filenames exist. Fill its one placeholder before prerendering. */
async function fillServerStyles(serverRoot: string, stylesheets: readonly (readonly string[])[]): Promise<void> {
  const marker = `JSON.parse(${JSON.stringify(HOST_STYLES_PLACEHOLDER)})`;
  const replacement = JSON.stringify(stylesheets);
  let patched = 0;
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && path.endsWith(".js")) {
        const source = await readFile(path, "utf8");
        if (!source.includes(marker)) continue;
        await writeFile(path, source.replaceAll(marker, replacement));
        patched++;
      }
    }
  }
  await visit(serverRoot);
  if (patched === 0) throw new Error("Svartz host styles placeholder was not found in the server bundle");
}

/** Capture CSS from SvelteKit's client build without importing every vault runtime eagerly. */
export function hostStylesPlugin(): Plugin | undefined {
  const raw = process.env["SVARTZ_HOST_STYLE_MAP"];
  if (!raw) return;
  const manifests = JSON.parse(raw) as HostStyleManifest[];
  return {
    name: "svartz:host-styles",
    async generateBundle(_output, bundle) {
      if (this.environment.name !== "client") return;
      await Promise.all(manifests.map(async ({ modules, path }) => {
        const runtimeModules = new Set(modules);
        const stylesheets = new Set<string>();
        for (const item of Object.values(bundle)) {
          if (item.type !== "chunk") continue;
          if (!Object.keys(item.modules).some((id) => runtimeModules.has(id.split("?")[0]!))) continue;
          const css = (item as typeof item & { viteMetadata?: { importedCss?: ReadonlySet<string> } })
            .viteMetadata?.importedCss;
          for (const file of css ?? []) stylesheets.add(file);
        }
        await writeFile(path, `${JSON.stringify([...stylesheets].sort())}\n`);
      }));
    },
    async writeBundle(output) {
      if (this.environment.name !== "client" || !output.dir || basename(output.dir) !== "client") return;
      const stylesheets = await Promise.all(manifests.map(async ({ path }) =>
        JSON.parse(await readFile(path, "utf8")) as string[]));
      await fillServerStyles(join(dirname(output.dir), "server"), stylesheets);
    },
  };
}

async function hasTailwindPlugin(options: readonly PluginOption[] = []): Promise<boolean> {
  for (const option of options) {
    const plugin = await option;
    if (Array.isArray(plugin)) {
      if (await hasTailwindPlugin(plugin)) return true;
    } else if (plugin && plugin.name.startsWith("@tailwindcss/vite:")) {
      return true;
    }
  }
  return false;
}

/** Preserve virtual modules and let Svelte compile packaged components in host apps. */
export function withSvartzHost(config: UserConfigExport): UserConfigExport {
  return async (env) => {
    const original = await (typeof config === "function"
      ? config(env)
      : config);
    return mergeConfig(original, {
      plugins: [
        ...(await hasTailwindPlugin(original.plugins) ? [] : tailwindcss()),
        hostStylesPlugin(),
      ],
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

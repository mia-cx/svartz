import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { mergeConfig, normalizePath, type Plugin, type PluginOption, type UserConfigExport } from "vite";
import { HOST_STYLES_PLACEHOLDER } from "./host-registry";

/** Generated runtime entry points and the CSS manifest for one host vault. */
export interface HostStyleManifest {
  readonly modules: readonly string[];
  readonly pagesRoot: string;
  readonly path: string;
}

interface HostStyles {
  readonly shared: readonly string[];
  readonly notes: Readonly<Record<string, readonly string[]>>;
}

const normalizeModulePath = (path: string): string => normalizePath(path.replaceAll("\\", "/"));

/** Fill the generated registry before prerendering; custom hosts may have no registry consumer. */
async function fillServerStyles(serverRoot: string, stylesheets: readonly HostStyles[]): Promise<void> {
  const marker = `JSON.parse(${JSON.stringify(HOST_STYLES_PLACEHOLDER)})`;
  const replacement = JSON.stringify(stylesheets);
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && path.endsWith(".js")) {
        const source = await readFile(path, "utf8");
        if (!source.includes(marker)) continue;
        await writeFile(path, source.replaceAll(marker, replacement));
      }
    }
  }
  await visit(serverRoot);
}

/** Capture CSS from SvelteKit's client build without importing every vault runtime eagerly. */
export function hostStylesPlugin(manifests: readonly HostStyleManifest[]): Plugin {
  return {
    name: "svartz:host-styles",
    async generateBundle(_output, bundle) {
      if (this.environment.name !== "client") return;
      await Promise.all(manifests.map(async ({ modules, pagesRoot, path }) => {
        const runtimeModules = new Set(modules.map(normalizeModulePath));
        const noteRoot = `${normalizeModulePath(pagesRoot).replace(/\/+$/, "")}/`;
        const noteChunks = new Map<string, string>();
        for (const item of Object.values(bundle)) {
          if (item.type !== "chunk") continue;
          const noteModule = Object.keys(item.modules)
            .map((id) => normalizeModulePath(id.split("?")[0]!))
            .find((id) => id.startsWith(noteRoot) && id.endsWith(".svelte"));
          if (noteModule) noteChunks.set(item.fileName, `pages/${noteModule.slice(noteRoot.length)}`);
        }
        const shared = new Set<string>();
        const notes = new Map<string, Set<string>>();
        const collect = (fileName: string, stylesheets: Set<string>, visited: Set<string>): void => {
          if (visited.has(fileName)) return;
          visited.add(fileName);
          const item = bundle[fileName];
          if (!item || item.type !== "chunk") return;
          const css = (item as typeof item & { viteMetadata?: { importedCss?: ReadonlySet<string> } })
            .viteMetadata?.importedCss;
          for (const file of css ?? []) stylesheets.add(file);
          for (const imported of item.imports) collect(imported, stylesheets, visited);
          for (const imported of item.dynamicImports) {
            const noteKey = noteChunks.get(imported);
            if (!noteKey) {
              collect(imported, stylesheets, visited);
              continue;
            }
            let noteStyles = notes.get(noteKey);
            if (!noteStyles) {
              noteStyles = new Set();
              notes.set(noteKey, noteStyles);
              collect(imported, noteStyles, new Set());
            }
          }
        };
        const visited = new Set<string>();
        for (const item of Object.values(bundle)) {
          if (item.type !== "chunk") continue;
          if (!Object.keys(item.modules).some((id) => runtimeModules.has(normalizeModulePath(id.split("?")[0]!)))) continue;
          collect(item.fileName, shared, visited);
        }
        const styles: HostStyles = {
          shared: [...shared].sort(),
          notes: Object.fromEntries([...notes].map(([key, css]) => [
            key, [...css].filter((file) => !shared.has(file)).sort(),
          ])),
        };
        await writeFile(path, `${JSON.stringify(styles)}\n`);
      }));
    },
    async writeBundle(output) {
      if (this.environment.name !== "client" || !output.dir || basename(output.dir) !== "client") return;
      const stylesheets = await Promise.all(manifests.map(async ({ path }) =>
        JSON.parse(await readFile(path, "utf8")) as HostStyles));
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
    const styleMap = process.env["SVARTZ_HOST_STYLE_MAP"];
    return mergeConfig(original, {
      plugins: [
        ...(await hasTailwindPlugin(original.plugins) ? [] : tailwindcss()),
        ...(styleMap ? [hostStylesPlugin(JSON.parse(styleMap) as HostStyleManifest[])] : []),
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

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const template = path.resolve(import.meta.dirname, "../../template");
/** The route `svartz init` adds for plugin pages, under `src/routes`. */
export const PLUGIN_PAGE_ROUTE = "[...mount=svartzMount]/-/[...page=svartzPage]";

/** Copy `from` under `template` to `to` under `root`, every file below it included. */
async function copyTemplate(root: string, from: string, to: string): Promise<void> {
  for (const entry of await readdir(path.join(template, from), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.relative(path.join(template, from), path.join(entry.parentPath, entry.name));
    await mkdir(path.dirname(path.join(root, to, file)), { recursive: true });
    await writeFile(path.join(root, to, file), await readFile(path.join(entry.parentPath, entry.name)));
  }
}

/** Write the plugin page route and the param matchers `svartz init` gives a SvelteKit 2 host at `root`. */
export async function writeKit2PluginPageRoute(root: string): Promise<void> {
  await copyTemplate(root, path.join("src/routes", PLUGIN_PAGE_ROUTE), path.join("src/routes", PLUGIN_PAGE_ROUTE));
  await copyTemplate(root, "sveltekit-2/src/params", "src/params");
}

import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const PAGE_FILE = /^\+(?:page|server)(?:\.[^.]+)?\.(?:js|ts|svelte)$/;

export function isHostRouteFile(root: string, file: string): boolean {
  const path = relative(join(root, "src/routes"), file);
  return path !== "" && !path.startsWith("..") && PAGE_FILE.test(path.split(/[\\/]/).at(-1) ?? "");
}

/** Static host routes outrank generated vault pages in SvelteKit. */
export async function staticHostRoutes(root: string, mountPath: string): Promise<Set<string>> {
  const routesRoot = join(root, "src/routes");
  const paths = new Set<string>();

  const walk = async (directory: string, segments: string[]): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    if (entries.some((entry) => entry.isFile() && PAGE_FILE.test(entry.name))) {
      const pathname = `/${segments.join("/")}`.replace(/\/$/, "") || "/";
      if (pathname === mountPath || (mountPath === "" && pathname === "/")) {
        paths.add("");
      } else if (pathname.startsWith(`${mountPath}/`)) {
        paths.add(pathname.slice(mountPath.length + 1));
      }
    }

    await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => {
      if (entry.name.startsWith("[")) return Promise.resolve();
      const nextSegments = entry.name.startsWith("(") && entry.name.endsWith(")")
        ? segments
        : [...segments, entry.name];
      return walk(join(directory, entry.name), nextSegments);
    }));
  };

  await walk(routesRoot, []);
  return paths;
}

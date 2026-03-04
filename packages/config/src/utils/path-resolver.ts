import { resolve, dirname } from "node:path";
import { access, stat } from "node:fs/promises";

const CONFIG_FILENAMES = [
  "svartz.config.ts",
  "svartz.config.js",
  "svartz.config.mjs",
] as const;

export const normalizePath = (path: string): string =>
  path.replaceAll("\\", "/");

/**
 * Search upward from startDir for a config file.
 * Returns absolute path or null.
 */
export const searchUpward = async (
  startDir: string,
): Promise<string | null> => {
  let dir = resolve(startDir);
  const root = dirname(dir) === dir ? dir : undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = resolve(dir, filename);
      try {
        await access(candidate);
        return candidate;
      } catch {
        // not found, continue
      }
    }
    const parent = dirname(dir);
    if (parent === dir || parent === root) return null;
    dir = parent;
  }
};

/**
 * Check if a path exists and is a directory.
 */
export const isDirectory = async (path: string): Promise<boolean> => {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
};

/**
 * Check if a file exists.
 */
export const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

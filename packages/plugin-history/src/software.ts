/** The code that compiles a version, by content, for the keys of the version cache (`cache.ts`). */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The packages besides this one whose code compiles a version. */
const PACKAGES = ["@svartz/core", "@svartz/plugins"] as const;

const hash = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");

/** Every file in `folder`, by path and content hash; a marker when it can't be read. */
async function folderHash(folder: string): Promise<string> {
  try {
    const files = (await readdir(folder, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());
    const parts = await Promise.all(files.map(async (entry) => {
      const path = join(entry.parentPath, entry.name);
      return `${path.slice(folder.length)}:${hash(await readFile(path))}`;
    }));
    return hash(parts.sort().join("\n"));
  } catch {
    return `unreadable:${folder}`;
  }
}

let software: Promise<string> | undefined;

/**
 * This package's build and that of each of {@link PACKAGES}, by content, not by version number: a new Svartz release,
 * or a rebuilt workspace, compiles every version again.
 */
export function softwareFingerprint(): Promise<string> {
  return software ??= (async () => {
    const folders = [dirname(fileURLToPath(import.meta.url)), ...PACKAGES.map((name) => {
      try {
        return dirname(fileURLToPath(import.meta.resolve(name)));
      } catch {
        return `unresolved:${name}`;
      }
    })];
    return hash((await Promise.all(folders.map(folderHash))).join("\n"));
  })();
}

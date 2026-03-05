import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, statSync } from "node:fs";
import { valid as semverValid } from "semver";

/**
 * Get the `version` from a package.json. Accepts either:
 * - A module URL (e.g. `import.meta.url`): finds the package.json for that module's package by walking up from the file.
 * - A path to package.json (e.g. `resolve(__dirname, "../package.json")`): reads that file directly.
 *
 * @param urlOrPath - `import.meta.url` or an absolute path to a package.json file.
 * @returns The `version` string from that package.json.
 * @throws If the path points to package.json but has no "version", or if no package.json is found when walking up.
 */
export function getPackageVersion(urlOrPath: string): string {

  // if the urlOrPath is a module URL, convert it to a file path.
  const filePath = urlOrPath.startsWith("file:")
    ? fileURLToPath(urlOrPath)
    : resolve(urlOrPath);

  let pkgPath = filePath;

  if (!filePath.endsWith("package.json")) {
    // the file is not a package.json, so we need to find the package.json that belongs to this module (walk up from filePath)
    // and set pkgPath to the path of the package.json we discovered.
    let dir = dirname(filePath);
    const root = dirname(dir) === dir ? dir : undefined;
    let found = false;
    for (;;) {
      const candidate = resolve(dir, "package.json");
      try {
        statSync(candidate);
        pkgPath = candidate;
        found = true;
        break;
      } catch {
        // no package.json here, try parent
      }
      const parent = dirname(dir);
      if (parent === dir || parent === root) break;
      dir = parent;
    }
    if (!found) {
      throw new Error(
        `getPackageVersion: no package.json found walking up from ${filePath}`,
      );
    }
  }

  // check if pkgPath exists, and is a file (not a directory).
  const stat = statSync(pkgPath);
  if (!stat.isFile()) {
    throw new Error(
      `getPackageVersion: path is not a file (directory or other): ${pkgPath}`,
    );
  }

  // once we know the file exists, and is a file, we can read it, and parse the version using semver.
  const raw = readFileSync(pkgPath, "utf-8");
  const { version: v } = JSON.parse(raw) as { version?: unknown };
  const version = typeof v === "string" ? v : String(v ?? "");
  const parsed = semverValid(version);
  if (!parsed) {
    throw new Error(
      `getPackageVersion: invalid or missing "version" in ${pkgPath}`,
    );
  }
  return parsed;
}

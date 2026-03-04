import { minimatch } from "minimatch";

export const DEFAULT_IGNORES = [
  ".obsidian",
  ".git",
  ".svn",
  ".hg",
  "node_modules",
  ".DS_Store",
  ".trash",
  "Thumbs.db",
];

export const shouldIgnore = (name: string): boolean => {
  if (DEFAULT_IGNORES.includes(name)) return true;
  if (name.startsWith(".")) return true;
  if (name.startsWith("._")) return true;
  return false;
};

const normalizePath = (path: string): string => path.replaceAll("\\", "/");

export const shouldIncludePath = (
  path: string,
  include: string[] = [],
  exclude: string[] = [],
): boolean => {
  const normalizedPath = normalizePath(path);

  if (exclude.some((pattern) => minimatch(normalizedPath, pattern, { dot: true }))) {
    return false;
  }

  if (include.length === 0) {
    return true;
  }

  return include.some((pattern) =>
    minimatch(normalizedPath, pattern, { dot: true }),
  );
};

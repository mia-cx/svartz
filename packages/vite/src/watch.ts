import { isAbsolute, relative, resolve } from "node:path";
import type { ChangeEvent, ResolvedConfig } from "@svartz/core";

function normalizePathSegment(path: string): string {
  return path.replaceAll("\\", "/");
}

function isWithinDirectory(targetPath: string, directory: string): boolean {
  const normalizedTarget = resolve(targetPath);
  const normalizedDirectory = resolve(directory);
  const rel = relative(normalizedDirectory, normalizedTarget);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function createVaultChangeEvent(
  config: ResolvedConfig,
  type: ChangeEvent["type"],
  file: string,
): ChangeEvent | undefined {
  if (!isWithinDirectory(file, config.path)) {
    return undefined;
  }

  const absoluteFile = resolve(file);
  const relativeFile = normalizePathSegment(relative(config.path, absoluteFile));

  return {
    type,
    file: absoluteFile,
    absoluteFile,
    relativeFile,
    timestamp: Date.now(),
  };
}

export { createVaultChangeEvent, isWithinDirectory };

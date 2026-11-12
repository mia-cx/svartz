import { runBuildProcess } from "../../../../scripts/build-process.mjs";

/** Run a CLI build with the same descendant cleanup as the release check. */
export function runBuild(args: string[], options: { cwd?: string; timeout: number }) {
  return runBuildProcess(process.execPath, args, options);
}

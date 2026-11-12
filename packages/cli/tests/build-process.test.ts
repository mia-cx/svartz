import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { runBuild } from "./helpers/build-process";

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

it.skipIf(process.platform === "win32").each(["success", "failure", "timeout"])(
  "cleans up a build's orphaned descendant on %s, preserving unrelated processes",
  async (outcome) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "svartz-build-process-"));
    const pidFile = path.join(root, "descendant.pid");
    const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    await once(unrelated, "spawn");
    let descendant: number | undefined;
    try {
      // The parent exits without waiting for this child, like the prerender worker's workerd.
      const build = runBuild(["--input-type=module", "-e", `
        import { spawn } from 'node:child_process';
        import { writeFileSync } from 'node:fs';
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });
        child.once('spawn', () => {
          writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
          ${outcome === "timeout" ? "setInterval(() => {}, 1000);" : `process.exit(${outcome === "failure" ? 1 : 0});`}
        });
      `], { timeout: 2_000 });
      if (outcome === "success") await build;
      else if (outcome === "failure") await expect(build).rejects.toMatchObject({ code: 1 });
      else await expect(build).rejects.toMatchObject({ killed: true });

      descendant = Number(await readFile(pidFile, "utf8"));
      expect(isRunning(unrelated.pid!)).toBe(true);
      await expect.poll(() => isRunning(descendant!), { timeout: 5_000 }).toBe(false);
    } finally {
      // Also clean up when this regression fails against the old build helper.
      descendant ??= await readFile(pidFile, "utf8").then(Number, () => undefined);
      if (descendant && isRunning(descendant)) process.kill(descendant, "SIGKILL");
      unrelated.kill("SIGKILL");
      await once(unrelated, "exit");
      await rm(root, { recursive: true, force: true });
    }
  },
  15_000,
);

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Run a CLI build, cleaning up its process group on POSIX hosts. */
export async function runBuild(args: string[], options: { cwd?: string; timeout: number }) {
  // Windows has no process-group signals; retain execFile's normal child cleanup there.
  if (process.platform === "win32") {
    return execFileAsync(process.execPath, args, { ...options, maxBuffer: 20_000_000 });
  }
  const child = spawn(process.execPath, args, {
    ...options,
    // execFile does not forward detached to spawn.
    detached: true,
    killSignal: "SIGKILL",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  let result: Awaited<typeof exited>;
  try {
    result = await exited;
  } finally {
    // adapter-cloudflare hides getPlatformProxy().dispose() inside SvelteKit's prerender worker.
    // A POSIX process group still owns its workerd after that worker and the CLI have exited.
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
  }
  // Descendants can inherit stdout/stderr, so close can happen only after group cleanup.
  await closed;
  if (result.code !== 0) {
    throw Object.assign(new Error(`Build failed (${result.code ?? result.signal}): ${stderr}`), {
      ...result, stdout, stderr, killed: child.killed,
    });
  }
  return { stdout, stderr };
}

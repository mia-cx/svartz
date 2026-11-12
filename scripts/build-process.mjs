import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Run a build, cleaning up only its own POSIX process group on every exit.
 * Shared by CLI tests and check-release.mjs because adapter-cloudflare hides
 * getPlatformProxy().dispose() inside SvelteKit's prerender worker.
 * @param {string} file
 * @param {string[]} args
 * @param {{ cwd?: string, timeout: number }} options
 */
export async function runBuildProcess(file, args, options) {
  // Windows has no process-group signals; keep its existing execFile behavior.
  if (process.platform === 'win32') {
    return execFileAsync(file, args, { ...options, maxBuffer: 20_000_000 });
  }
  // execFile does not forward detached to spawn.
  const child = spawn(file, args, {
    ...options, detached: true, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve) => child.once('close', resolve));
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  let result;
  try {
    result = await exited;
  } finally {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
      }
    }
  }
  // Descendants may inherit output pipes: kill the group before awaiting close.
  await closed;
  if (result.code !== 0) {
    throw Object.assign(new Error(`Build failed (${result.code ?? result.signal}): ${stderr}`), {
      ...result, stdout, stderr, killed: child.killed,
    });
  }
  return { stdout, stderr };
}

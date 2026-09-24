import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, rm, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const RETRY_MS = 1_000;
const MAX_WAIT_MS = 600_000;
const ORPHAN_GRACE_MS = 5_000;
const RECOVERY_GUARD_MAX_AGE_MS = 30_000;

const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === "ENOENT";

const isProcessRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

async function lockIsStale(lockPath: string): Promise<boolean> {
  const lockStat = await stat(lockPath).catch((error: unknown) => {
    if (missing(error)) return undefined;
    throw error;
  });
  if (!lockStat) return false;

  try {
    // Read old directory locks too, so a crash before this upgrade can recover.
    const ownerPath = lockStat.isDirectory() ? path.join(lockPath, "owner.json") : lockPath;
    const owner: unknown = JSON.parse(await readFile(ownerPath, "utf8"));
    if (owner && typeof owner === "object" && "pid" in owner &&
      typeof owner.pid === "number" && Number.isInteger(owner.pid) && owner.pid > 0) {
      return !isProcessRunning(owner.pid);
    }
  } catch (error) {
    if (!missing(error) && !(error instanceof SyntaxError)) throw error;
  }
  return Date.now() - lockStat.mtimeMs >= ORPHAN_GRACE_MS;
}

async function recoveryGuardHeld(guardPath: string): Promise<boolean> {
  try {
    const guard = await stat(guardPath);
    if (Date.now() - guard.mtimeMs >= RECOVERY_GUARD_MAX_AGE_MS) {
      throw new Error(`Vault build recovery stopped at ${guardPath}. Check for a running build before removing this guard.`);
    }
    return true;
  } catch (error) {
    if (missing(error)) return false;
    throw error;
  }
}

async function recoverStaleLock(lockPath: string, guardPath: string): Promise<void> {
  if (!await lockIsStale(lockPath)) return;
  try {
    await mkdir(guardPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return;
    throw error;
  }

  try {
    if (!await lockIsStale(lockPath)) return;
    const entry = await lstat(lockPath).catch((error: unknown) => {
      if (missing(error)) return undefined;
      throw error;
    });
    if (entry?.isDirectory()) await rm(lockPath, { recursive: true });
    else if (entry) await unlink(lockPath);
  } finally {
    await rmdir(guardPath);
  }
}

async function releaseIfOwned(lockPath: string, token: string): Promise<void> {
  let owner: unknown;
  try {
    owner = JSON.parse(await readFile(lockPath, "utf8"));
  } catch (error) {
    if (missing(error)) return;
    throw error;
  }
  if (owner && typeof owner === "object" && "token" in owner && owner.token === token) {
    await unlink(lockPath);
  }
}

/** Run one vault build at a time, including across CLI processes after a crash. */
export async function withVaultBuildLock(projectRoot: string, fn: () => Promise<void>): Promise<void> {
  const lockRoot = path.join(projectRoot, ".svartz");
  const lockPath = path.join(lockRoot, ".vault-build.lock");
  const guardPath = `${lockPath}.recover`;
  const token = randomUUID();
  const pendingPath = path.join(lockRoot, `.vault-build-${token}.pending`);
  const deadline = Date.now() + MAX_WAIT_MS;

  await mkdir(lockRoot, { recursive: true });
  await writeFile(pendingPath, JSON.stringify({ pid: process.pid, token }), { flag: "wx" });
  try {
    while (Date.now() < deadline) {
      if (!await recoveryGuardHeld(guardPath)) {
        let acquired = false;
        try {
          // The owner data exists before the hard link makes the lock visible.
          await link(pendingPath, lockPath);
          acquired = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          await recoverStaleLock(lockPath, guardPath);
        }

        if (acquired) {
          try {
            if (await recoveryGuardHeld(guardPath)) continue;
            await fn();
            return;
          } finally {
            await releaseIfOwned(lockPath, token);
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
    throw new Error(`Timed out waiting for vault build lock at ${lockPath}.`);
  } finally {
    await unlink(pendingPath);
  }
}

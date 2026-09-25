import { access, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { withVaultBuildLock } from "../src/build-lock";

const roots: string[] = [];

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "svartz-build-lock-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("propagates a build EEXIST without retrying the build", async () => {
  const root = await projectRoot();
  const failure = Object.assign(new Error("output already exists"), { code: "EEXIST" });
  let calls = 0;

  await expect(withVaultBuildLock(root, async () => {
    calls++;
    throw failure;
  })).rejects.toBe(failure);

  expect(calls).toBe(1);
  await expect(access(path.join(root, ".svartz", ".vault-build.lock"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("recovers a crashed owner while serializing parallel builders", async () => {
  const root = await projectRoot();
  const lockRoot = path.join(root, ".svartz");
  await mkdir(lockRoot);
  await writeFile(path.join(lockRoot, ".vault-build.lock"), JSON.stringify({ pid: 999_999_999, token: "dead" }));
  let active = 0;
  let maximumActive = 0;

  await Promise.all(Array.from({ length: 3 }, () => withVaultBuildLock(root, async () => {
    maximumActive = Math.max(maximumActive, ++active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active--;
  })));

  expect(maximumActive).toBe(1);
  await expect(access(path.join(lockRoot, ".vault-build.lock"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("recovers a directory lock left by an older crashed CLI", async () => {
  const root = await projectRoot();
  const lockPath = path.join(root, ".svartz", ".vault-build.lock");
  await mkdir(lockPath, { recursive: true });
  await writeFile(path.join(lockPath, "owner.json"), JSON.stringify({ pid: 999_999_999 }));
  let built = false;

  await withVaultBuildLock(root, async () => { built = true; });

  expect(built).toBe(true);
  await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
});

it("recovers an old malformed owner file after the orphan grace", async () => {
  const root = await projectRoot();
  const lockPath = path.join(root, ".svartz", ".vault-build.lock");
  await mkdir(path.dirname(lockPath), { recursive: true });
  await writeFile(lockPath, "null");
  const old = new Date(Date.now() - 10_000);
  await utimes(lockPath, old, old);
  let built = false;

  await withVaultBuildLock(root, async () => { built = true; });

  expect(built).toBe(true);
});

it("fails closed when an abandoned recovery guard needs manual cleanup", async () => {
  const root = await projectRoot();
  const guardPath = path.join(root, ".svartz", ".vault-build.lock.recover");
  await mkdir(guardPath, { recursive: true });
  const old = new Date(Date.now() - 60_000);
  await utimes(guardPath, old, old);

  await expect(withVaultBuildLock(root, async () => {})).rejects.toThrow("Check for a running build");
});

/**
 * A real `svartz build` of the standalone shell for a Node target with the plugin, served over HTTP.
 * Follows packages/cli/tests/server-build.test.ts.
 */
import { execFile, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(workspaceRoot, "packages/cli/dist/index.js");
const plugin = path.join(import.meta.dirname, "../dist/index.js");
const BUILD_TIMEOUT = 240_000;

let root: string;
let commit: string;

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a test port");
  server.close();
  await once(server, "close");
  return address.port;
}

/** Text of every file below `directory`. */
async function readTree(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return Promise.all(entries.filter((entry) => entry.isFile()).map((entry) => readFile(path.join(entry.parentPath, entry.name), "utf8")));
}

beforeAll(async () => {
  // SvelteKit writes relative imports from the kit dir; macOS's /var symlink would break them.
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), "svartz-submissions-build-")));
  await cp(path.join(workspaceRoot, "apps/web"), path.join(root, "apps/web"), {
    recursive: true,
    filter: (source) => !/[\\/](?:node_modules|\.svelte-kit|build)$/.test(source),
  });
  await symlink(path.join(workspaceRoot, "apps/web/node_modules"), path.join(root, "apps/web/node_modules"), "dir");
  await mkdir(path.join(root, "vault"));
  await writeFile(path.join(root, "vault/index.md"), "# Home\n");
  await writeFile(path.join(root, "vault/guide.md"), "---\ntitle: Guide\n---\n\nSet up the wiki.\n");
  await writeFile(path.join(root, "svartz.config.ts"), `import { submissions } from ${JSON.stringify(plugin)};
export default {
  version: "1.0.0",
  vaults: [{
    id: "site",
    path: "vault",
    theme: ${JSON.stringify(path.join(workspaceRoot, "themes/minimal"))},
    target: { type: "node" },
    site: { title: "Wiki" },
    plugins: [submissions({ repo: "acme/wiki", labels: ["submission"] })],
  }],
};\n`);
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("add", "vault");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "Vault");
  commit = git("rev-parse", "HEAD");

  await execFileAsync(process.execPath, [cli, "build", "--config", path.join(root, "svartz.config.ts")], {
    cwd: root,
    maxBuffer: 20_000_000,
  });
}, BUILD_TIMEOUT);

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("a Node build with submissions", () => {
  it("ships the editor to the browser but keeps the token name and build manifest on the server", async () => {
    const client = await readTree(path.join(root, ".svartz/vaults/site/dist/client"));

    expect(client.some((file) => file.includes("Open pull request"))).toBe(true);
    expect(client.filter((file) => file.includes("SVARTZ_GITHUB_TOKEN"))).toEqual([]);
    expect(client.filter((file) => file.includes(commit))).toEqual([]);
  });

  it("serves the edit endpoints for published notes only", async () => {
    const dist = path.join(root, ".svartz/vaults/site/dist");
    const port = await freePort();
    const { SVARTZ_GITHUB_TOKEN: _token, ...env } = process.env;
    const server = spawn(process.execPath, [path.join(dist, "index.js")], {
      cwd: root,
      env: { ...env, HOST: "127.0.0.1", PORT: String(port) },
      stdio: "pipe",
    });
    let stderr = "";
    server.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const origin = `http://127.0.0.1:${port}`;
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100 && !ready; attempt++) {
        ready = await fetch(`${origin}/`).then(() => true, () => false);
        if (!ready) await sleep(100);
      }
      expect(ready, stderr).toBe(true);

      // A published note reaches the GitHub step, which needs the token.
      const guide = await fetch(`${origin}/_svartz/submissions/source/?page=/guide/`);
      expect([guide.status, await guide.json()]).toEqual([503, {
        error: "misconfigured",
        message: "This site can't open pull requests yet: its server has no SVARTZ_GITHUB_TOKEN set.",
      }]);
      const outside = await fetch(`${origin}/_svartz/submissions/edit/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page: "/../svartz.config.ts", markdown: "x" }),
      });
      expect([outside.status, (await outside.json() as { error: string }).error]).toEqual([404, "not_editable"]);
    } finally {
      server.kill("SIGTERM");
    }
  }, BUILD_TIMEOUT);
});

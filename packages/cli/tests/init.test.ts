import { execFile } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { initProject } from "../src/init";

const execFileAsync = promisify(execFile);
const cli = path.resolve(import.meta.dirname, "../dist/index.js");
const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "svartz-init-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it("initializes the invocation directory with an editable shell and vault", async () => {
  const root = await fixture();
  const { stdout } = await execFileAsync(
    process.execPath,
    [cli, "init", "--no-install", "--no-git"],
    { cwd: root },
  );

  expect(stdout).toContain("Created a Svartz site.");
  const manifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  expect(manifest.scripts).toMatchObject({
    dev: "svartz dev --vault notes",
    build: "svartz build --vault notes",
  });
  expect(manifest.devDependencies).toHaveProperty("svartz", "latest");
  expect(await readFile(path.join(root, "svartz.config.ts"), "utf8")).toContain(
    "path: 'vault'",
  );
  expect(await readFile(path.join(root, "vault/index.md"), "utf8")).toContain(
    "# Welcome",
  );
  expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(
    "node_modules",
  );
  expect(
    await readFile(path.join(root, "src/routes/+page.svelte"), "utf8"),
  ).toContain("@svartz/ui/runtime");
  await access(path.join(root, "src/routes/[...slug]/+page.ts"));
  await expect(access(path.join(root, ".git"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("adds configuration to an existing Kit app without changing its routes or build script", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "src/routes"), { recursive: true });
  await mkdir(path.join(root, "vault"));
  const route = "<h1>Existing route</h1>\n";
  const viteConfig = "export default { plugins: [] };\n";
  await writeFile(path.join(root, "src/routes/+page.svelte"), route);
  await writeFile(path.join(root, "vite.config.ts"), viteConfig);
  await writeFile(path.join(root, "vault/index.md"), "# Existing note\n");
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "host-app",
      scripts: { build: "vite build" },
      dependencies: { "@sveltejs/kit": "^2.0.0" },
    }),
  );

  const result = await initProject({ cwd: root, install: false, git: false });
  expect(result.kind).toBe("integrated");
  expect(
    await readFile(path.join(root, "src/routes/+page.svelte"), "utf8"),
  ).toBe(route);
  expect(await readFile(path.join(root, "vite.config.ts"), "utf8")).toContain(
    "{ plugins: [] };",
  );
  expect(await readFile(path.join(root, "vite.config.ts"), "utf8")).toContain(
    "withSvartzHost(__svartz_host_config)",
  );
  expect(await readFile(path.join(root, "vault/index.md"), "utf8")).toBe(
    "# Existing note\n",
  );
  const manifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  expect(manifest.scripts).toMatchObject({
    build: "vite build",
    "svartz:build": "svartz build",
  });
  expect(manifest.devDependencies).toHaveProperty("svartz", "latest");
  expect(await readFile(path.join(root, "svartz.config.ts"), "utf8")).toContain(
    '"host-app"',
  );
  expect(await readFile(path.join(root, "src/routes/[...slug]/+page.ts"), "utf8"))
    .toContain('virtual:svartz/host');
});

it("reuses existing host vault definitions and is idempotent", async () => {
  const root = await fixture();
  const config =
    "export default { vaults: [{ id: 'blog', path: 'content' }] };\n";
  await writeFile(path.join(root, "svartz.config.mjs"), config);
  await writeFile(
    path.join(root, "vite.config.ts"),
    "export default { plugins: [] };\n",
  );
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "host-app",
      devDependencies: { "@sveltejs/kit": "^2.0.0" },
    }),
  );

  expect(
    (await initProject({ cwd: root, install: false, git: false })).kind,
  ).toBe("integrated");
  const firstViteConfig = await readFile(
    path.join(root, "vite.config.ts"),
    "utf8",
  );
  expect(
    (await initProject({ cwd: root, install: false, git: false })).kind,
  ).toBe("already-configured");
  expect(await readFile(path.join(root, "vite.config.ts"), "utf8")).toBe(
    firstViteConfig,
  );
  expect(await readFile(path.join(root, "svartz.config.mjs"), "utf8")).toBe(
    config,
  );
  await expect(access(path.join(root, "vault"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  const manifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  expect(manifest.scripts["svartz:dev"]).toBe("svartz dev");
});

it("keeps a host-owned catchall route", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "src/routes/[...slug]"), { recursive: true });
  await writeFile(path.join(root, "src/routes/[...slug]/+page.svelte"), "<h1>Host catchall</h1>\n");
  await writeFile(path.join(root, "vite.config.ts"), "export default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "host-app",
    dependencies: { "@sveltejs/kit": "^2.0.0" },
  }));

  await initProject({ cwd: root, install: false, git: false });
  expect(await readFile(path.join(root, "src/routes/[...slug]/+page.svelte"), "utf8"))
    .toBe("<h1>Host catchall</h1>\n");
  await expect(access(path.join(root, "src/routes/[...slug]/+page.ts")))
    .rejects.toMatchObject({ code: "ENOENT" });
});

it("reports an existing config without a Kit app instead of replacing it", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "svartz.config.mjs"), "export default {};\n");
  await expect(
    initProject({ cwd: root, install: false, git: false }),
  ).rejects.toThrow("no SvelteKit app was found");
  await expect(access(path.join(root, "package.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("reports every new-project conflict before writing anything", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "package.json"), "{}\n");
  await writeFile(path.join(root, ".gitignore"), "keep\n");
  await expect(
    initProject({ cwd: root, install: false, git: false }),
  ).rejects.toThrow("package.json");
  expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe("keep\n");
  await expect(
    access(path.join(root, "svartz.config.ts")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

it("leaves an unsupported host Vite config untouched", async () => {
  const root = await fixture();
  const viteConfig = "module.exports = { plugins: [] };\n";
  const manifest = JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  });
  await writeFile(path.join(root, "vite.config.js"), viteConfig);
  await writeFile(path.join(root, "package.json"), manifest);

  await expect(
    initProject({ cwd: root, install: false, git: false }),
  ).rejects.toThrow("Vite config has no default export");
  expect(await readFile(path.join(root, "vite.config.js"), "utf8")).toBe(
    viteConfig,
  );
  expect(await readFile(path.join(root, "package.json"), "utf8")).toBe(
    manifest,
  );
  await expect(
    access(path.join(root, "svartz.config.ts")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

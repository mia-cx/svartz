import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { resolveAppLocation } from "../src/workspace";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("detects an existing SvelteKit app without moving its files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "svartz-host-"));
  roots.push(root);
  await mkdir(path.join(root, ".svelte-kit"));
  await writeFile(path.join(root, ".svelte-kit", "keep"), "host build state");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    scripts: { build: "vite build" },
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));
  await writeFile(path.join(root, "vite.config.js"), "export default {};\n");

  expect(resolveAppLocation(root)).toEqual({
    appRoot: root,
    projectRoot: root,
    hostApp: true,
    viteConfigPath: path.join(root, "vite.config.js"),
  });
  expect(await readFile(path.join(root, ".svelte-kit", "keep"), "utf8")).toBe("host build state");
});

it("keeps the repository shell at apps/web", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "svartz-repo-shell-"));
  roots.push(root);
  await mkdir(path.join(root, "apps", "web"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "workspace" }));
  await writeFile(path.join(root, "apps", "web", "vite.config.ts"), "export default {};\n");

  expect(resolveAppLocation(root)).toEqual({
    appRoot: path.join(root, "apps", "web"),
    projectRoot: root,
    hostApp: false,
    viteConfigPath: path.join(root, "apps", "web", "vite.config.ts"),
  });
});

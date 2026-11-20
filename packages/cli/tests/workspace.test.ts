import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { resolveAppLocation, SHIPPED_APP_ROOT } from "../src/workspace";

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

it.each(["vite.config.cjs", "vite.config.cts"])("recognizes a host using %s", async (fileName) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "svartz-host-cjs-"));
  roots.push(root);
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));
  await writeFile(path.join(root, fileName), "module.exports = {};\n");

  expect(resolveAppLocation(root)).toMatchObject({
    appRoot: root, hostApp: true, viteConfigPath: path.join(root, fileName),
  });
});

it("builds with the app Svartz ships when the project has no SvelteKit app", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "svartz-no-app-"));
  roots.push(root);
  // A Vite project that isn't SvelteKit is no host either.
  await writeFile(path.join(root, "package.json"), JSON.stringify({ devDependencies: { vite: "^8.0.0" } }));
  await writeFile(path.join(root, "vite.config.js"), "export default {};\n");

  expect(resolveAppLocation(root)).toEqual({
    appRoot: SHIPPED_APP_ROOT,
    projectRoot: root,
    hostApp: false,
    viteConfigPath: path.join(SHIPPED_APP_ROOT, "vite.config.js"),
  });
  expect(existsSync(path.join(SHIPPED_APP_ROOT, "src", "routes", "[...slug]", "+page.svelte"))).toBe(true);
});

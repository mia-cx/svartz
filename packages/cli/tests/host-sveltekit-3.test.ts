import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import module from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
// SvelteKit 3, Vite 8 and adapter-cloudflare 8, pinned in the fixture package.
const toolchain = path.join(import.meta.dirname, "fixtures/sveltekit-3-host/node_modules");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
}

// `host-peers.mjs` needs `module.registerHooks`, new in Node 22.15; CI runs a newer Node.
it.skipIf(!("registerHooks" in module))("prerenders a SvelteKit 3 host that reads the published index without compiling the page runtime", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "svartz-kit3-host-"));
  roots.push(root);
  await symlink(toolchain, path.join(root, "node_modules"), "dir");
  await mkdir(path.join(root, "src/routes"), { recursive: true });
  await mkdir(path.join(root, "vault"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "svartz-kit3-host-fixture",
    private: true,
    type: "module",
    devDependencies: { "@sveltejs/kit": "^3.0.0" },
  }));
  // SvelteKit 3 reads its config from the Vite plugin; there is no svelte.config.js.
  await writeFile(path.join(root, "vite.config.js"), [
    "import adapter from '@sveltejs/adapter-cloudflare';",
    "import { sveltekit } from '@sveltejs/kit/vite';",
    "import { defineConfig } from 'vite';",
    `import { withSvartzHost } from ${JSON.stringify(path.join(workspaceRoot, "packages/vite/dist/host.js"))};`,
    "export default withSvartzHost(defineConfig({ plugins: [sveltekit({ adapter: adapter(), paths: { base: '/learn' } })] }));",
  ].join("\n"));
  await writeFile(path.join(root, "src/app.html"), "<!doctype html><html lang=\"en\"><head>%sveltekit.head%</head><body><div style=\"display: contents\">%sveltekit.body%</div></body></html>\n");
  await writeFile(path.join(root, "src/routes/+layout.js"), "export const prerender = true;\n");
  await writeFile(path.join(root, "src/routes/+page.svelte"), [
    "<script>",
    "  import { vaults } from 'virtual:svartz/index';",
    "  const course = vaults.find((vault) => vault.id === 'course');",
    "</script>",
    "<h1>{course.siteConfig.title}</h1>",
    "<ul>{#each course.index.entries as entry}<li><a href={course.basePath + entry.markdownHref}>{entry.title}</a></li>{/each}</ul>",
  ].join("\n"));
  await writeFile(path.join(root, "vault/intro.md"), "---\ntitle: Kit three lesson\n---\n# Kit three lesson\n\nLESSON_BODY_MARKER\n");
  await writeFile(path.join(root, "svartz.config.ts"), `export default {
    version: "1.0.0",
    vaults: [{
      id: "course",
      path: "vault",
      mountPath: "/course",
      theme: ${JSON.stringify(path.join(workspaceRoot, "themes/minimal"))},
      target: { type: "host" },
      index: { markdown: true },
      site: { title: "Course index" },
    }],
  };\n`);

  await execFileAsync(process.execPath, [
    "--import", path.join(import.meta.dirname, "host-peers.mjs"),
    path.join(workspaceRoot, "packages/cli/dist/index.js"), "build", "--config", path.join(root, "svartz.config.ts"),
  ], { cwd: root, maxBuffer: 4_000_000 });

  const output = path.join(root, ".svelte-kit/cloudflare");
  // The adapter ran on a server build, after prerendering.
  await readFile(path.join(output, "_worker.js"), "utf8");
  const home = await readFile(path.join(output, "learn/index.html"), "utf8");
  expect(home).toContain("Course index");
  expect(home).toContain('href="/learn/course/intro.md"');
  expect(await readFile(path.join(output, "learn/course/intro.md"), "utf8")).toContain("LESSON_BODY_MARKER");
  // Index-only hosts never compile the generated runtime (`createVaultView`) or a note page.
  for (const file of await filesUnder(path.join(root, ".svelte-kit/output"))) {
    expect(await readFile(file, "utf8"), file).not.toMatch(/createVaultView|prepareNoteArtifact/);
  }
}, 240_000);

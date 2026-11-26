import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { promisify } from "node:util";
import { loadConfig } from "@svartz/config";
import { catppuccin } from "@svartz/config/schemes";
import { afterEach, expect, it } from "vitest";
import { InitCancelledError, initProject } from "../src/init";
import { vaultsFromFlags } from "../src/init-plan";
import { askVaults } from "../src/init-prompts";

const execFileAsync = promisify(execFile);
const cli = path.resolve(import.meta.dirname, "../dist/index.js");
const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "svartz-init-vaults-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** Let the generated config import `@svartz/config` from the fixture, as an installed project does. */
async function linkConfigPackage(root: string) {
  await mkdir(path.join(root, "node_modules/@svartz"), { recursive: true });
  await symlink(path.resolve(import.meta.dirname, "../../config"), path.join(root, "node_modules/@svartz/config"), "dir");
}

const ENTER = "\r";
const DOWN = "\x1b[B";
const LEFT = "\x1b[D";

/** A terminal that types each step's keys once its question is on screen. */
function terminal(steps: readonly (readonly [question: string, keys: string])[]) {
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => input });
  const output = new PassThrough();
  let screen = "";
  let next = 0;
  output.on("data", (chunk: Buffer) => {
    screen += chunk.toString();
    const step = steps[next];
    if (!step || !screen.includes(step[0])) return;
    next++;
    screen = "";
    setImmediate(() => input.write(step[1]));
  });
  return { input, output };
}

// Proves the questions create a new vault and publish an existing folder, each with its own theme, scheme and target,
// into a config that loads, without touching the existing folder.
it("writes the vaults the questions describe", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "Obsidian"));
  await writeFile(path.join(root, "Obsidian", "Garden.md"), "# Garden\n");
  const streams = terminal([
    ["Start a new vault", ENTER],
    ["Vault name", `Field Notes${ENTER}`],
    ["Theme", ENTER],
    ["Colour scheme", `${DOWN}${ENTER}`],
    ["Where will it deploy?", ENTER],
    ["Add another vault?", `${LEFT}${ENTER}`],
    ["Next vault", `${DOWN}${ENTER}`],
    ["Vault folder", `Obsidian${ENTER}`],
    ["Site title", ENTER],
    ["Theme", `${DOWN}${DOWN}${ENTER}`],
    ["Colour scheme", ENTER],
    ["Where will it deploy?", `${DOWN}${DOWN}${ENTER}`],
    ["Worker name", ENTER],
    ["Domain", `garden.example.com${ENTER}`],
    ["Add another vault?", ENTER],
  ]);

  const result = await initProject({ cwd: root, install: false, git: false, vaults: (context) => askVaults(context, streams) });

  expect(result.kind).toBe("created");
  await linkConfigPackage(root);
  const { vaults } = await loadConfig(path.join(root, "svartz.config.ts"));
  expect(vaults.map(({ id, target, theme, site }) => ({ id, target, theme, title: site.title }))).toEqual([
    {
      id: "field-notes",
      target: { type: "static" },
      theme: expect.objectContaining({ base: "@svartz/theme-minimal", tokens: catppuccin }),
      title: "Field Notes",
    },
    {
      id: "obsidian",
      target: { type: "cloudflare-workers", name: "obsidian", routes: [{ pattern: "garden.example.com", custom_domain: true }] },
      theme: expect.objectContaining({ base: "@svartz/theme-blog" }),
      title: "Obsidian",
    },
  ]);
  expect(await readFile(path.join(root, "field-notes", "index.md"), "utf8")).toContain("# Welcome");
  expect(await readdir(path.join(root, "Obsidian"))).toEqual(["Garden.md"]);
  expect(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).devDependencies)
    .toHaveProperty("@svartz/theme-blog", "latest");
});

// Proves cancelling the questions leaves the directory as it was.
it("writes nothing when the questions are cancelled", async () => {
  const root = await fixture();
  const streams = terminal([["Start a new vault", ENTER], ["Vault name", "\x03"]]);

  const failure = await initProject({ cwd: root, install: false, git: false, vaults: (context) => askVaults(context, streams) })
    .catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(InitCancelledError);
  expect(await readdir(root)).toEqual([]);
});

// Proves every answer has a flag: init runs unattended from them, matching repeated flags to --vault in order.
it("takes every answer as a flag", async () => {
  const root = await fixture();
  await execFileAsync(process.execPath, [
    cli, "init", "--no-install", "--no-git",
    "--vault", "notes", "--vault", "docs",
    "--theme", "wiki", "--theme", "docs",
    "--scheme", "nord",
    "--target", "static", "--target", "cloudflare-workers",
    "--worker", "acme-docs", "--domain", "docs.acme.dev",
  ], { cwd: root });

  await linkConfigPackage(root);
  const { vaults } = await loadConfig(path.join(root, "svartz.config.ts"));
  expect(vaults.map(({ id, target, theme }) => ({ id, target, base: theme.base, accent: theme.tokens }))).toEqual([
    { id: "notes", target: { type: "static" }, base: "@svartz/theme-wiki", accent: expect.objectContaining({ paper: expect.any(Object) }) },
    {
      id: "docs",
      target: { type: "cloudflare-workers", name: "acme-docs", routes: [{ pattern: "docs.acme.dev", custom_domain: true }] },
      base: "@svartz/theme-docs",
      accent: expect.objectContaining({ paper: expect.any(Object) }),
    },
  ]);
});

// Proves the flags can say "the default" for one vault while naming a value for another: Svartz colours beside Nord,
// and a Worker without a custom domain beside one with.
it("takes the default as a per-vault flag value", async () => {
  const root = await fixture();
  await execFileAsync(process.execPath, [
    cli, "init", "--no-install", "--no-git",
    "--vault", "notes", "--vault", "docs",
    "--scheme", "svartz", "--scheme", "nord",
    "--target", "cloudflare-workers",
    "--domain", "", "--domain", "docs.acme.dev",
  ], { cwd: root });

  await linkConfigPackage(root);
  const { vaults } = await loadConfig(path.join(root, "svartz.config.ts"));
  expect(vaults.map(({ id, target, theme }) => ({ id, target, tokens: theme.tokens }))).toEqual([
    { id: "notes", target: { type: "cloudflare-workers", name: "notes" }, tokens: undefined },
    {
      id: "docs",
      target: { type: "cloudflare-workers", name: "docs", routes: [{ pattern: "docs.acme.dev", custom_domain: true }] },
      tokens: expect.objectContaining({ paper: expect.any(Object) }),
    },
  ]);
});

// Proves several vaults added to a SvelteKit app get mounts of their own, so the config they share loads.
it("mounts each host vault at its own path", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "src/routes"), { recursive: true });
  await writeFile(path.join(root, "vite.config.ts"), "export default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "host-app", devDependencies: { "@sveltejs/kit": "^2.0.0" } }));

  await initProject({
    cwd: root,
    install: false,
    git: false,
    vaults: (context) => vaultsFromFlags({ vault: ["notes", "lore"] }, context),
  });

  await linkConfigPackage(root);
  const { vaults } = await loadConfig(path.join(root, "svartz.config.ts"));
  expect(vaults.map(({ id, mountPath }) => ({ id, mountPath }))).toEqual([
    { id: "notes", mountPath: "/notes" },
    { id: "lore", mountPath: "/lore" },
  ]);
});

// Proves init refuses vaults that would collide with its own files or write into a folder it promised to leave alone,
// and that it refuses them before writing anything.
it.each([
  ["a vault named after a file init writes", ["--vault", "package.json"], "package.json"],
  ["a new vault inside an existing one", ["--vault", "Garden", "--vault", "Garden/Archive"], "Garden/Archive"],
  ["a new vault inside another new one", ["--vault", "notes", "--vault", "notes/drafts"], "notes/drafts"],
])("refuses %s before writing", async (_, flags, named) => {
  const root = await fixture();
  await mkdir(path.join(root, "Garden"));
  await writeFile(path.join(root, "Garden", "Garden.md"), "# Garden\n");

  const failure = await execFileAsync(process.execPath, [cli, "init", "--no-install", "--no-git", ...flags], { cwd: root })
    .catch((error: { stderr: string }) => error);

  expect(failure).toMatchObject({ stderr: expect.stringContaining(named) });
  expect(await readdir(root)).toEqual(["Garden"]);
  expect(await readdir(path.join(root, "Garden"))).toEqual(["Garden.md"]);
});

// Proves `host` is refused outside a SvelteKit app, where nothing could serve it, before any file is written.
it("refuses the host target without a SvelteKit app", async () => {
  const root = await fixture();
  const failure = await execFileAsync(process.execPath, [cli, "init", "--no-install", "--no-git", "--target", "host"], { cwd: root })
    .catch((error: { stderr: string }) => error);

  expect(failure).toMatchObject({ stderr: expect.stringMatching(/host.*SvelteKit app.*static/s) });
  expect(await readdir(root)).toEqual([]);
});

// Proves a flag that can't be matched to the vaults stops init before it writes anything.
it("refuses flags that don't match the vaults, before writing", async () => {
  const root = await fixture();
  const failure = await execFileAsync(process.execPath, [
    cli, "init", "--no-install", "--no-git", "--vault", "a", "--vault", "b", "--vault", "c", "--theme", "wiki", "--theme", "blog",
  ], { cwd: root }).catch((error: { stderr: string }) => error);

  expect(failure).toMatchObject({ stderr: expect.stringContaining("--theme is given 2 times for 3 vaults") });
  expect(await readdir(root)).toEqual([]);
  await expect(access(path.join(root, "svartz.config.ts"))).rejects.toMatchObject({ code: "ENOENT" });
});

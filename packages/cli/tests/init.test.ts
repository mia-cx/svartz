import { execFile } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { loadConfigFromFile } from "vite";
import { commandExecutable, InitConflictError, InitLayoutError, InitOperationError, initProject } from "../src/init";

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

it("uses a command shim for Windows package managers but the Git executable for Git", () => {
  expect(commandExecutable("pnpm", "win32")).toBe("pnpm.cmd");
  expect(commandExecutable("git", "win32")).toBe("git");
  expect(commandExecutable("bun", "win32")).toBe("bun");
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
  await expect(access(path.join(root, "src/routes/+page.svelte"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(await readFile(path.join(root, "src/routes/[...slug]/+page.svelte"), "utf8"))
    .toContain("virtual:svartz/tailwind-sources.css");
  expect(await readFile(path.join(root, "src/routes/+layout.svelte"), "utf8"))
    .not.toContain("layout.css");
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
    "__svartz_with_host(__svartz_host_config)",
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
  expect(manifest.devDependencies).toHaveProperty("tailwindcss", "^4.2.2");
  expect(await readFile(path.join(root, "svartz.config.ts"), "utf8")).toContain(
    '"host-app"',
  );
  expect(await readFile(path.join(root, "src/routes/[...slug]/+page.ts"), "utf8"))
    .toContain('virtual:svartz/host');
  expect(await readFile(path.join(root, "src/routes/[...slug]/+page.svelte"), "utf8"))
    .toContain("virtual:svartz/tailwind-sources.css");
  expect(await readFile(path.join(root, "src/app.d.ts"), "utf8"))
    .toContain('/// <reference types="@svartz/vite/virtual-modules" />');
});

it("upgrades only the previous generated CSS entry and root layout", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "src/routes/[...slug]"), { recursive: true });
  await writeFile(path.join(root, "src/routes/+layout.svelte"), "<script lang=\"ts\">\n  import './layout.css';\n  let { children } = $props();\n</script>\n\n{@render children()}\n");
  await writeFile(path.join(root, "src/routes/[...slug]/+page.svelte"), "<script lang=\"ts\">\n  import { page } from '$app/state';\n  import SvartzRuntimePage from '@svartz/ui/runtime';\n</script>\n\n<SvartzRuntimePage pathname={page.url.pathname} />\n");
  await writeFile(path.join(root, "vite.config.ts"), "export default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));

  expect((await initProject({ cwd: root, install: false, git: false })).kind).toBe("integrated");
  expect(await readFile(path.join(root, "src/routes/[...slug]/+page.svelte"), "utf8"))
    .toContain("virtual:svartz/tailwind-sources.css");
  expect(await readFile(path.join(root, "src/routes/+layout.svelte"), "utf8"))
    .not.toContain("layout.css");
});

it("keeps an existing layout CSS import when that stylesheet belongs to the host", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "src/routes"), { recursive: true });
  const layout = "<script lang=\"ts\">\n  import './layout.css';\n  let { children } = $props();\n</script>\n\n{@render children()}\n";
  await writeFile(path.join(root, "src/routes/+layout.svelte"), layout);
  await writeFile(path.join(root, "src/routes/layout.css"), "body { background: rebeccapurple; }\n");
  await writeFile(path.join(root, "vite.config.ts"), "export default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));

  expect((await initProject({ cwd: root, install: false, git: false })).kind).toBe("integrated");
  expect(await readFile(path.join(root, "src/routes/+layout.svelte"), "utf8")).toBe(layout);
  expect(await readFile(path.join(root, "src/routes/layout.css"), "utf8"))
    .toBe("body { background: rebeccapurple; }\n");
});

it.each(["^3.4.17", "3.x", ">=3 <4", "v3.4.17", "workspace:^3.4.17", "github:tailwindlabs/tailwindcss#v3.4.17", "git+https://github.com/tailwindlabs/tailwindcss.git#v3.4.17"])("rejects a Tailwind 3 host before writing for %s", async (version) => {
  const root = await fixture();
  const viteConfig = "export default { plugins: [] };\n";
  const manifest = JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0", tailwindcss: version },
  });
  await writeFile(path.join(root, "vite.config.ts"), viteConfig);
  await writeFile(path.join(root, "package.json"), manifest);

  const failure = await initProject({ cwd: root, install: false, git: false }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(InitLayoutError);
  expect(failure).toMatchObject({ reason: "unsupported-tailwind", message: expect.stringContaining("Tailwind CSS 4") });
  expect(await readFile(path.join(root, "vite.config.ts"), "utf8")).toBe(viteConfig);
  expect(await readFile(path.join(root, "package.json"), "utf8")).toBe(manifest);
  await expect(access(path.join(root, "svartz.config.ts"))).rejects.toMatchObject({ code: "ENOENT" });
});

it.each(["^4.0.0-dev3", "file:../tailwindcss-v3-compat"])("accepts a non-v3 Tailwind spec %s", async (version) => {
  const root = await fixture();
  await writeFile(path.join(root, "vite.config.ts"), "export default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0", tailwindcss: version },
  }));

  expect((await initProject({ cwd: root, install: false, git: false })).kind).toBe("integrated");
});

it("preserves host app types and adds virtual module declarations once", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/app.d.ts"), "declare global { namespace App { interface Locals { user: string } } }\nexport {};\n");
  await writeFile(path.join(root, "vite.config.ts"), "export default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));

  expect((await initProject({ cwd: root, install: false, git: false })).kind).toBe("integrated");
  const appTypes = await readFile(path.join(root, "src/app.d.ts"), "utf8");
  expect(appTypes).toContain("interface Locals { user: string }");
  expect(appTypes.match(/@svartz\/vite\/virtual-modules/g)).toHaveLength(1);
  expect((await initProject({ cwd: root, install: false, git: false })).kind).toBe("already-configured");
  expect(await readFile(path.join(root, "src/app.d.ts"), "utf8")).toBe(appTypes);
});

it("upgrades the previous UI virtual-module reference in an existing host", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/app.d.ts"), '/// <reference types="@svartz/ui/virtual-modules" />\nexport {};\n');
  await writeFile(path.join(root, "vite.config.ts"), "export default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));

  await initProject({ cwd: root, install: false, git: false });
  expect(await readFile(path.join(root, "src/app.d.ts"), "utf8"))
    .toBe('/// <reference types="@svartz/vite/virtual-modules" />\nexport {};\n');
});

it.each([
  "/// <reference types='@svartz/ui/virtual-modules' />",
  "/// <reference types='@svartz/vite/virtual-modules' />",
])("normalizes an existing %s reference", async (reference) => {
  const root = await fixture();
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/app.d.ts"), `${reference}\nexport {};\n`);
  await writeFile(path.join(root, "vite.config.ts"), "export default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));

  await initProject({ cwd: root, install: false, git: false });
  const source = await readFile(path.join(root, "src/app.d.ts"), "utf8");
  expect(source.match(/@svartz\/vite\/virtual-modules/g)).toHaveLength(1);
  expect(source).not.toContain("@svartz/ui/virtual-modules");
  expect(await initProject({ cwd: root, install: false, git: false })).toMatchObject({ kind: "already-configured" });
});

it.each([
  "// export default $host({ plugins: [] });\nexport default { plugins: [] };",
  "/*\nexport default $host({ plugins: [] });\n*/\nexport default { plugins: [] };",
])("ignores a commented-out wrapper when integrating a host", async (defaultExport) => {
  const root = await fixture();
  await writeFile(path.join(root, "vite.config.ts"),
    `import { withSvartzHost as $host } from '@svartz/vite/host';\n${defaultExport}\n`);
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));

  await initProject({ cwd: root, install: false, git: false });
  const source = await readFile(path.join(root, "vite.config.ts"), "utf8");
  expect(source).toContain("const __svartz_host_config = { plugins: [] };");
  expect(source).toContain("export default $host(__svartz_host_config);");
});

it.each(["vite.config.cjs", "vite.config.cts"])(
  "wraps a CommonJS host config in %s without replacing its config function",
  async (fileName) => {
    const root = await fixture();
    const configPath = path.join(root, fileName);
    await writeFile(configPath, "module.exports = (env) => ({ server: { port: env.command === 'serve' ? 4173 : 0 } });\n");
    await writeFile(path.join(root, "package.json"), JSON.stringify({
      devDependencies: { "@sveltejs/kit": "^2.0.0" },
    }));

    expect((await initProject({ cwd: root, install: false, git: false })).kind).toBe("integrated");
    const integrated = await readFile(configPath, "utf8");
    expect(integrated).toContain("const __svartz_host_config = module.exports;");
    expect(integrated).toContain("withSvartzHost(__svartz_host_config)(env)");
    await mkdir(path.join(root, "node_modules/@svartz"), { recursive: true });
    await symlink(path.resolve(import.meta.dirname, "../../vite"), path.join(root, "node_modules/@svartz/vite"), "dir");
    const loaded = await loadConfigFromFile({ command: "serve", mode: "development" }, configPath, root);
    expect(loaded?.config.server?.port).toBe(4173);
    expect((await initProject({ cwd: root, install: false, git: false })).kind).toBe("already-configured");
    expect(await readFile(configPath, "utf8")).toBe(integrated);
  },
);

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

it("reuses an imported host helper when wrapping an existing Vite config", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "vite.config.ts"),
    "import { withSvartzHost as wrapHost } from '@svartz/vite/host';\nexport default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));

  await initProject({ cwd: root, install: false, git: false });
  const source = await readFile(path.join(root, "vite.config.ts"), "utf8");
  expect(source.match(/from '@svartz\/vite\/host'/g)).toHaveLength(1);
  expect(source).toContain("export default wrapHost(__svartz_host_config)");
});

it("wraps the Vite default export even if an imported helper is called elsewhere", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "vite.config.ts"),
    "import { withSvartzHost as wrapHost } from '@svartz/vite/host';\nconst auxiliary = wrapHost({});\nexport default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));

  await initProject({ cwd: root, install: false, git: false });
  const source = await readFile(path.join(root, "vite.config.ts"), "utf8");
  expect(source).toContain("const auxiliary = wrapHost({});");
  expect(source).toContain("export default wrapHost(__svartz_host_config)");
});

it.each([
  "export default $host({ plugins: [] });",
  "export default ($host)({ plugins: [] });",
])("recognizes an existing host wrapper with a dollar-sign alias", async (defaultExport) => {
  const root = await fixture();
  const config = `import { withSvartzHost as $host } from '@svartz/vite/host';\n${defaultExport}\n`;
  await writeFile(path.join(root, "vite.config.ts"), config);
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));

  await initProject({ cwd: root, install: false, git: false });
  expect(await readFile(path.join(root, "vite.config.ts"), "utf8")).toBe(config);
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

it("rejects a symlinked catchall before touching its host-owned target", async () => {
  const root = await fixture();
  const target = path.join(root, "host-route");
  await mkdir(target);
  await mkdir(path.join(root, "src/routes"), { recursive: true });
  await writeFile(path.join(target, "+page.ts"), "export const load = () => ({});\n");
  await symlink(target, path.join(root, "src/routes/[...slug]"), "dir");
  const viteConfig = "export default { plugins: [] };\n";
  await writeFile(path.join(root, "vite.config.ts"), viteConfig);
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));

  const failure = await initProject({ cwd: root, install: false, git: false }).catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(InitConflictError);
  expect(failure).toMatchObject({ paths: ["src/routes/[...slug]"] });
  expect(await readFile(path.join(root, "vite.config.ts"), "utf8")).toBe(viteConfig);
  await expect(access(path.join(target, "+page.svelte"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(path.join(root, "svartz.config.ts"))).rejects.toMatchObject({ code: "ENOENT" });
});

it.each([
  "src/routes/[...slug]/+page.js",
  "src/routes/(site)/[...rest]/+page.svelte",
])("preserves an existing catchall at %s", async (routePath) => {
  const root = await fixture();
  await mkdir(path.dirname(path.join(root, routePath)), { recursive: true });
  await writeFile(path.join(root, routePath), "// host route\n");
  await writeFile(path.join(root, "vite.config.ts"), "export default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }));

  await initProject({ cwd: root, install: false, git: false });
  expect(await readFile(path.join(root, routePath), "utf8")).toBe("// host route\n");
  await expect(access(path.join(root, "src/routes/[...slug]/+page.ts")))
    .rejects.toMatchObject({ code: "ENOENT" });
});

it("upgrades only the previous Svartz catchall loader", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "src/routes"), { recursive: true });
  await writeFile(path.join(root, "vite.config.ts"), "export default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "host-app",
    dependencies: { "@sveltejs/kit": "^2.0.0" },
  }));
  await initProject({ cwd: root, install: false, git: false });

  const catchall = path.join(root, "src/routes/[...slug]/+page.ts");
  const legacy = `import type { EntryGenerator } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { routes } from 'virtual:svartz/host';

export const load = ({ url }) => {
  const appPath = base ? url.pathname.slice(base.length) || '/' : url.pathname;
  const pathname = appPath.endsWith('/') ? appPath : \`\${appPath}/\`;
  const destination = routes.redirects[pathname];
  if (destination) redirect(308, \`\${base}\${destination}\`);
  if (!routes.all.includes(pathname)) error(404);
};

export const entries: EntryGenerator = async () => routes.all
  .map((pathname) => ({ slug: pathname.replace(/^\\/+|\\/+$/g, '') }));
`;
  await writeFile(catchall, legacy);
  expect((await initProject({ cwd: root, install: false, git: false })).kind).toBe("integrated");
  expect(await readFile(catchall, "utf8")).toContain("await prepareHostVault(pathname)");

  const custom = "export const load = () => ({ custom: true });\n";
  await writeFile(catchall, custom);
  expect((await initProject({ cwd: root, install: false, git: false })).kind).toBe("already-configured");
  expect(await readFile(catchall, "utf8")).toBe(custom);
});

it("upgrades generated host routes to link SSR styles without changing custom routes", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "src/routes"), { recursive: true });
  await writeFile(path.join(root, "vite.config.ts"), "export default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "host-app",
    dependencies: { "@sveltejs/kit": "^2.0.0" },
  }));
  await initProject({ cwd: root, install: false, git: false });

  const pagePath = path.join(root, "src/routes/[...slug]/+page.svelte");
  const loadPath = path.join(root, "src/routes/[...slug]/+page.ts");
  const page = await readFile(pagePath, "utf8");
  const load = await readFile(loadPath, "utf8");
  await writeFile(pagePath, page
    .replace("  import type { PageData } from './$types';\n", "")
    .replace("  let { data }: { data: PageData } = $props();\n", "")
    .replace(/\n<svelte:head>[\s\S]*?<\/svelte:head>\n/, ""));
  await writeFile(loadPath, load
    .replace("{ assets, base }", "{ base }")
    .replace("hostStylesheets, ", "")
    .replace(/  return \{ svartzStylesheets:.*\n/, ""));

  expect((await initProject({ cwd: root, install: false, git: false })).kind).toBe("integrated");
  expect(await readFile(pagePath, "utf8")).toBe(page);
  expect(await readFile(loadPath, "utf8")).toBe(load);
});

it("preserves an old generated page when its loader was customized", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "src/routes"), { recursive: true });
  await writeFile(path.join(root, "vite.config.ts"), "export default { plugins: [] };\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "host-app", dependencies: { "@sveltejs/kit": "^2.0.0" },
  }));
  await initProject({ cwd: root, install: false, git: false });

  const pagePath = path.join(root, "src/routes/[...slug]/+page.svelte");
  const loadPath = path.join(root, "src/routes/[...slug]/+page.ts");
  const oldPage = (await readFile(pagePath, "utf8"))
    .replace("  import type { PageData } from './$types';\n", "")
    .replace("  let { data }: { data: PageData } = $props();\n", "")
    .replace(/\n<svelte:head>[\s\S]*?<\/svelte:head>\n/, "");
  await writeFile(pagePath, oldPage);
  await writeFile(loadPath, "export const load = () => ({ custom: true });\n");

  expect((await initProject({ cwd: root, install: false, git: false })).kind).toBe("already-configured");
  expect(await readFile(pagePath, "utf8")).toBe(oldPage);
});

it("reports an existing config without a Kit app instead of replacing it", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "svartz.config.mjs"), "export default {};\n");
  const failure = await initProject({ cwd: root, install: false, git: false }).catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(InitLayoutError);
  expect(failure).toMatchObject({ reason: "missing-kit", message: expect.stringContaining("no SvelteKit app was found") });
  await expect(access(path.join(root, "package.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("reports every new-project conflict before writing anything", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "package.json"), "{}\n");
  await writeFile(path.join(root, ".gitignore"), "keep\n");
  const failure = await initProject({ cwd: root, install: false, git: false }).catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(InitConflictError);
  expect(failure).toMatchObject({ paths: expect.arrayContaining(["package.json", ".gitignore"]) });
  expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe("keep\n");
  await expect(
    access(path.join(root, "svartz.config.ts")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

it("rejects a file-valued template ancestor before writing scaffold files", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "src"), "owned file\n");

  await expect(initProject({ cwd: root, install: false, git: false }))
    .rejects.toThrow("src");
  await expect(access(path.join(root, ".gitignore"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(path.join(root, "src"), "utf8")).toBe("owned file\n");
});

it("leaves an unsupported host Vite config untouched", async () => {
  const root = await fixture();
  const viteConfig = "module.exports = { plugins: [] };\n";
  const manifest = JSON.stringify({
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  });
  await writeFile(path.join(root, "vite.config.js"), viteConfig);
  await writeFile(path.join(root, "package.json"), manifest);

  const failure = await initProject({ cwd: root, install: false, git: false }).catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(InitLayoutError);
  expect(failure).toMatchObject({ reason: "unsupported-vite", message: expect.stringContaining("no default export") });
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

it("tags malformed project manifests as operational failures", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "package.json"), "{invalid\n");
  const failure = await initProject({ cwd: root, install: false, git: false }).catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(InitOperationError);
  expect(failure).toMatchObject({ operation: "parse package.json" });
});

it("tags an invalid package-manager field as an operational failure", async () => {
  const root = await fixture();
  const manifest = '{"packageManager":1}\n';
  await writeFile(path.join(root, "package.json"), manifest);
  const failure = await initProject({ cwd: root, install: false, git: false }).catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(InitOperationError);
  expect(failure).toMatchObject({ operation: "detect package manager" });
  expect(await readFile(path.join(root, "package.json"), "utf8")).toBe(manifest);
  await expect(access(path.join(root, "svartz.config.ts"))).rejects.toMatchObject({ code: "ENOENT" });
});

import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { ResolvedConfig } from "@svartz/core";
import { createHostIndexSource, createHostRegistrySource, deploymentBasePath, getGeneratedHostIndexPath, getGeneratedHostRegistryPath, getGeneratedHostStylesPath, readHostAdapterName, svelteKitPaths } from "../src/host-registry";

const vault = (id: string, mountPath: string): ResolvedConfig => ({
  version: "1.0.0",
  id,
  path: `/workspace/${id}`,
  outDir: `/workspace/.svartz/vaults/${id}/dist`,
  mountPath,
  include: [],
  exclude: [],
  linkResolution: "closest",
  theme: { base: "@svartz/theme-minimal" },
  site: { title: id, url: "https://example.test" },
  frontmatter: {
    titleField: "title", descriptionField: "description", tagsField: "tags",
    aliasesField: "aliases", createdAtField: "created_at", updatedAtField: "updated_at",
    publishedField: "published_at",
  },
  target: { type: "host" },
  plugins: [],
});

describe("host registry", () => {
  it("imports route metadata eagerly and loads runtime code for only the prepared mount", () => {
    const source = createHostRegistrySource([vault("blog", "/blog"), vault("work", "/work")]);
    expect(source).toContain('import * as index0 from "/workspace/.svartz/vaults/blog/artifacts/index.ts"');
    expect(source).toContain('import * as index1 from "/workspace/.svartz/vaults/work/artifacts/index.ts"');
    expect(source).toContain('import("/workspace/.svartz/vaults/blog/artifacts/runtime-artifacts.ts")');
    expect(source).toContain('import("/workspace/.svartz/vaults/work/artifacts/runtime-theme.ts")');
    expect(source).toContain('import.meta.env.SSR ?');
    expect(source).toContain('return [...styles.shared, ...(key ? styles.notes[key] ?? [] : [])];');
    expect(source).not.toMatch(/import \* as (?:artifacts|theme)/);
    expect(source).toContain('mountPath: "/blog"');
    expect(source).toContain('mountPath: "/work"');
    expect(source).toContain('basePath: ""');
    expect(source).toContain("await theme.ready;");
    expect(source).toContain("await preparing.get(selected.id);");
    expect(source).toContain("const match = selected.theme.resolveRuntimeRoute({ pathname: vaultPathname, slug });");
    expect(source).toContain("await selected.artifacts.prepareNoteArtifact(key);");
    expect(getGeneratedHostRegistryPath("/workspace")).toBe("/workspace/.svartz/host/runtime.ts");
    expect(getGeneratedHostStylesPath("/workspace/.svartz/host/runtime.ts", "../../../package"))
      .toMatch(/^\/workspace\/\.svartz\/host\/styles\/[^/]+\.json$/);
    expect(getGeneratedHostStylesPath("/workspace/.svartz/host/runtime.ts", "aaa").toLowerCase())
      .not.toBe(getGeneratedHostStylesPath("/workspace/.svartz/host/runtime.ts", "aaG").toLowerCase());
    expect(Buffer.byteLength(basename(getGeneratedHostStylesPath("/workspace/.svartz/host/runtime.ts", "x".repeat(126)))))
      .toBeLessThanOrEqual(255);
  });

  // Proves the plugin page route's matchers, which run on the server and in the browser, claim only `<mount>/-/<name>/`
  // where a plugin of that mount's vault claims the name: any other path, a note in a folder named `-` included, and a
  // name only another vault claims, is a note.
  it("matches plugin pages only under a name the mount's own vault claims", async () => {
    const root = await mkdtemp(join(tmpdir(), "svartz-host-registry-"));
    try {
      const vaults = [["docs", "/docs", ["account"]], ["blog", "", []], ["wiki", "/team/wiki", ["history"]]] as const;
      const configs = await Promise.all(vaults.map(async ([id, mountPath, pages]) => {
        const config = { ...vault(id, mountPath), outDir: join(root, id, "dist") };
        await mkdir(join(root, id, "artifacts"), { recursive: true });
        await writeFile(join(root, id, "artifacts/index.ts"), "export const index = { routes: { all: [], redirects: {} } };\n");
        await writeFile(join(root, id, "artifacts/plugin-pages.ts"), `export const pluginPages = ${JSON.stringify(pages)};\n`);
        return config;
      }));
      const registry = join(root, "runtime.ts");
      await writeFile(registry, createHostRegistrySource(configs));
      const { isPluginPageMount, isPluginPageName } = await import(registry) as Record<string, (param: string) => boolean>;
      // As SvelteKit runs `[...mount=svartzMount]/-/[...page=svartzPage]`: the page matcher only after the mount matched.
      const routes = (path: string) => {
        const [, mount = "", page = ""] = /^(?:(.*)\/)?-\/(.*)$/.exec(path)!;
        return isPluginPageMount(mount) && isPluginPageName(page);
      };

      expect(["docs/-/account", "docs/-/account/settings", "team/wiki/-/history/notes/intro"].map(routes)).toEqual([true, true, true]);
      // A name another vault claims is a note here.
      expect(["docs/-/history", "team/wiki/-/account"].map(routes)).toEqual([false, false]);
      // The blog has no plugin pages, so even its root mount routes `/-/…` to notes; nested folders are never mounts.
      expect(["-/account", "guides/-/account", "docs/guides/-/account", "team/-/history"].map(routes)).toEqual([false, false, false, false]);
      expect(["docs/-/guide", "docs/-/accounts", "docs/-/", "docs/-/-/account"].map(routes)).toEqual([false, false, false, false]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("publishes each vault's index without importing the page runtime or theme", () => {
    const source = createHostIndexSource([vault("blog", "/blog"), vault("work", "/work")], "/site");
    expect(source).toContain('import { index as index0 } from "/workspace/.svartz/vaults/blog/artifacts/index.ts"');
    expect(source).toContain('{ id: "work", mountPath: "/work", basePath: "/site", index: index1, siteConfig: {"title":"work","url":"https://example.test"} }');
    // Vite compiles dynamic imports too, so the entry must not name runtime modules at all.
    expect(source).not.toMatch(/import\(|runtime-|\$app\//);
    expect(getGeneratedHostIndexPath("/workspace")).toBe("/workspace/.svartz/host/index.ts");
  });

  it("uses the target or canonical host URL as the deployment base", () => {
    expect(deploymentBasePath({ ...vault("docs", ""), target: { type: "static", basePath: "/site" } })).toBe("/site");
    expect(deploymentBasePath({ ...vault("docs", ""), target: { type: "static" }, site: { title: "Docs", url: "https://example.test/site" } })).toBe("");
    expect(deploymentBasePath({ ...vault("blog", "/blog"), site: { title: "Blog", url: "https://example.test/site" } })).toBe("/site");
    expect(createHostRegistrySource([{ ...vault("blog", "/blog"), site: { title: "Blog", url: "https://example.test/site" } }]))
      .toContain('basePath: "/site"');
    expect(createHostRegistrySource([{ ...vault("blog", "/blog"), target: { type: "static", basePath: "/site" } }]))
      .toContain('basePath: "/site"');
    expect(deploymentBasePath({ ...vault("blog", "/blog"), site: { title: "Blog" } }, "/site")).toBe("/site");
    const source = createHostRegistrySource([vault("blog", "/site/docs")], { base: "/site", assets: "/site" });
    expect(source).toContain('basePath: "/site"');
    expect(source).toContain("return pathname === mountPath || pathname.startsWith(`${mountPath}/`);");
    expect(source).not.toContain("pathname.slice(basePath.length)");
  });

  it("exports SvelteKit's base and assets, which SvelteKit 3's $app/paths dropped", () => {
    const define = { __SVELTEKIT_PATHS_BASE__: '"/site"', __SVELTEKIT_PATHS_ASSETS__: '""' };
    expect(svelteKitPaths(define)).toEqual({ base: "/site", assets: "/site" });
    expect(svelteKitPaths({ ...define, __SVELTEKIT_PATHS_ASSETS__: '"https://cdn.example.test"' }))
      .toEqual({ base: "/site", assets: "https://cdn.example.test" });
    expect(svelteKitPaths({})).toBeUndefined();
    const source = createHostRegistrySource([vault("blog", "/blog")], { base: "/site", assets: "https://cdn.example.test" });
    expect(source).toContain('export const base = "/site";');
    expect(source).toContain('export const assets = "https://cdn.example.test";');
  });

  it("reads the adapter from SvelteKit's plugin options, at the top level or under kit", async () => {
    const setup = (options: unknown) => [{ name: "vite-plugin-sveltekit-setup", api: { options } }];
    // SvelteKit 3's validated options keep an empty `kit` key.
    const plugin = setup({ adapter: { name: "@sveltejs/adapter-cloudflare" }, kit: undefined });
    const configFile = setup({ extensions: [".svelte"], kit: { adapter: { name: "@sveltejs/adapter-node" } } });

    expect(await readHostAdapterName("/nowhere", plugin)).toBe("@sveltejs/adapter-cloudflare");
    expect(await readHostAdapterName("/nowhere", configFile)).toBe("@sveltejs/adapter-node");
  });});

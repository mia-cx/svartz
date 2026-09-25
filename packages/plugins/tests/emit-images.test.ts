import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import sharp from "sharp";
import type { Index, PluginContext, ResolvedConfig, SvartzTheme } from "@svartz/core";
import { emitImages } from "../src/emit-images";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function context(options: { favicon?: string; host?: boolean; image?: string } = {}): Promise<PluginContext> {
  const root = await mkdtemp(join(tmpdir(), "svartz-images-"));
  roots.push(root);
  const theme = {
    socialImage: ({ title }: { title: string }) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><text x="20" y="50">${title}</text></svg>`,
    faviconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="black"/></svg>',
  } as SvartzTheme;
  const entries = [
    { slug: "plain", href: "/blog/plain/", path: "plain.md", title: "Plain", properties: {}, description: "Public" },
    { slug: "custom", href: "/blog/custom/", path: "custom.md", title: "Custom", properties: { socialImage: "cover.png" } },
    { slug: "locked", href: "/blog/locked/", path: "locked.md", title: "Secret", properties: { encrypted: true, socialImage: "secret.png" } },
  ] as unknown as Index["entries"];
  return {
    config: {
      id: "blog", path: root, outDir: join(root, "dist"), mountPath: "/blog",
      target: { type: options.host ? "host" : "static" },
      site: { title: "Blog", url: "https://example.test", image: options.image,
        favicon: options.favicon ? join(root, options.favicon) : undefined },
      discovery: { socialImages: { enabled: true }, favicon: { enabled: !options.host } },
    } as ResolvedConfig,
    files: [
      { path: "plain.md", slug: "plain", extension: ".md", content: "" },
      { path: "custom.md", slug: "custom", extension: ".md", content: "", frontmatter: { socialImage: "cover.png" } },
      { path: "locked.md", slug: "locked", extension: ".md", content: "" },
      { path: "cover.png", sourcePath: join(root, "cover.png"), slug: "cover", extension: ".png", content: "" },
    ],
    index: { entries } as Index,
    artifacts: new Map(),
    meta: new Map([["svartz:theme", theme]]),
  } as PluginContext;
}

function ico(png: Buffer): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 32;
  header[7] = 32;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

it("generates only public note previews and keeps explicit images", async () => {
  const ctx = await context({ image: "/fallback.png" });
  await emitImages().emitArtifacts!.run(ctx);
  expect(ctx.index?.entries.map((entry) => entry.socialImage)).toEqual([
    "/blog/__svartz/social/plain.png", "/blog/cover.png", "/fallback.png",
  ]);
  expect(ctx.artifacts.has("assets/__svartz/social/custom.png")).toBe(false);
  expect(ctx.artifacts.has("assets/__svartz/social/locked.png")).toBe(false);
  const preview = ctx.artifacts.get("assets/__svartz/social/plain.png")!;
  expect((await sharp(preview.contents).metadata()).format).toBe("png");
  expect(ctx.index?.favicon?.svg).toBe("/blog/__svartz/favicon.svg");
});

it.each(["svg", "png", "jpg", "jpeg", "webp", "ico"])("decodes %s favicon input", async (extension) => {
  const ctx = await context({ favicon: `icon.${extension}` });
  const root = ctx.config.path;
  const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#ff0000" } }).png().toBuffer();
  const source = extension === "svg"
    ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>')
    : extension === "ico" ? ico(png)
    : extension === "png" ? png
    : await sharp(png).toFormat(extension === "jpeg" ? "jpeg" : extension).toBuffer();
  await writeFile(join(root, `icon.${extension}`), source);
  await emitImages().emitArtifacts!.run(ctx);
  const favicon = ctx.artifacts.get("assets/__svartz/favicon-32.png")!;
  const touch = ctx.artifacts.get("assets/__svartz/apple-touch-icon.png")!;
  expect((await sharp(favicon.contents).metadata()).width).toBe(32);
  expect((await sharp(touch.contents).metadata()).width).toBe(180);
  expect(ctx.artifacts.has("assets/__svartz/favicon.svg")).toBe(extension === "svg");
});

it("keeps host favicon ownership until enabled", async () => {
  const ctx = await context({ host: true });
  await emitImages().emitArtifacts!.run(ctx);
  expect(ctx.index?.favicon).toBeUndefined();
  expect([...ctx.artifacts.keys()]).toEqual(["assets/__svartz/social/plain.png"]);
  ctx.config = { ...ctx.config, discovery: { ...ctx.config.discovery, favicon: { enabled: true } } };
  ctx.artifacts.clear();
  await emitImages().emitArtifacts!.run(ctx);
  expect(ctx.index?.favicon?.png).toBe("/blog/__svartz/favicon-32.png");
});

it("rejects a malformed ICO instead of trusting its extension", async () => {
  const ctx = await context({ favicon: "broken.ico" });
  await writeFile(join(ctx.config.path, "broken.ico"), "not an icon");
  await expect(emitImages().emitArtifacts!.run(ctx)).rejects.toThrow();
});

it("requires a public URL when social previews are explicitly enabled for production", async () => {
  const ctx = await context();
  ctx.config = { ...ctx.config, site: { title: "Blog" } };
  await expect(emitImages().emitArtifacts!.run(ctx)).rejects.toThrow(/needs site.url/);
});

it("rejects a published asset that claims the generated image path", async () => {
  const ctx = await context();
  ctx.files.push({ path: "__svartz/social/plain.png", slug: "collision", extension: ".png", content: "" });
  await expect(emitImages().emitArtifacts!.run(ctx)).rejects.toThrow(/conflicts with a generated Svartz image/);
});

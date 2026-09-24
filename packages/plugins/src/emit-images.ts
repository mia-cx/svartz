/** Build owned preview and favicon assets from the final published index. */
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { extractLargestImageAsPng } from "@humanwhocodes/ico-to-png";
import { definePlugin, type Artifact, type IndexEntry, type PluginContext, type SvartzTheme } from "@svartz/core";
import sharp from "sharp";
import { createAssetResolver } from "./internal/asset-references";

const OWNED_PATH = "__svartz";
const ICON_INPUTS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico"]);
const IMAGE_BATCH_SIZE = 4;

function addImage(ctx: PluginContext, name: string, contents: Uint8Array | string, mimeType: string): void {
  const ownedPath = `${OWNED_PATH}/${name}`;
  if (ctx.files.some((file) => file.path === ownedPath)) {
    throw new Error(`Published vault asset "${ownedPath}" conflicts with a generated Svartz image.`);
  }
  const key = `assets/${OWNED_PATH}/${name}`;
  const artifact: Artifact = {
    key,
    path: resolve(ctx.config.outDir, "..", "artifacts", key),
    type: "asset",
    pluginId: EMIT_IMAGES_ID,
    contents,
    mimeType,
  };
  ctx.artifacts.set(key, artifact);
}

function mountedAsset(ctx: PluginContext, name: string): string {
  return `${ctx.config.mountPath}/${OWNED_PATH}/${name}`;
}

function noteImage(ctx: PluginContext, path: string, raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  const assets = ctx.files.filter((file) => ![".md", ".mdx", ".svx"].includes(file.extension ?? ""));
  const note = ctx.files.find((file) => file.path === path)!;
  const asset = createAssetResolver(assets)(note, raw);
  if (asset) return `${ctx.config.mountPath}/${asset.split("/").map(encodeURIComponent).join("/")}`;
  if (raw.startsWith("/")) return raw;
  throw new Error(`Social image "${raw}" in "${path}" is not a published attachment.`);
}

async function emitSocialImages(ctx: PluginContext, theme: SvartzTheme): Promise<void> {
  if (!ctx.index) return;
  if (ctx.config.discovery.socialImages.enabled && !ctx.config.site.url && ctx.meta.get("svartz:mode") !== "development") {
    throw new Error(`Vault "${ctx.config.id}" needs site.url to generate social previews in production.`);
  }
  const enabled = ctx.config.discovery.socialImages.enabled && Boolean(theme.socialImage);
  const renderEntry = async (entry: IndexEntry) => {
    if (entry.locked === true || entry.properties.encrypted === true || entry.properties.hidden === true) {
      return { ...entry, socialImage: ctx.config.site.image };
    }

    const override = ["socialImage", "image", "cover"]
      .map((field) => entry.properties[field])
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (override) return { ...entry, socialImage: noteImage(ctx, entry.path, override.trim()) };
    if (!enabled) return { ...entry, socialImage: ctx.config.site.image };

    const svg = theme.socialImage!({
      title: entry.title,
      description: entry.description,
      siteTitle: ctx.config.site.title,
    });
    const png = await sharp(Buffer.from(svg)).resize(1200, 630).png().toBuffer();
    const name = `social/${entry.slug}.png`;
    addImage(ctx, name, png, "image/png");
    return { ...entry, socialImage: mountedAsset(ctx, name) };
  };
  const entries: IndexEntry[] = [];
  for (let index = 0; index < ctx.index.entries.length; index += IMAGE_BATCH_SIZE) {
    entries.push(...await Promise.all(ctx.index.entries.slice(index, index + IMAGE_BATCH_SIZE).map(renderEntry)));
  }
  ctx.index = { ...ctx.index, entries };
}

async function faviconSource(ctx: PluginContext, theme: SvartzTheme): Promise<{ data: Buffer; extension: string } | undefined> {
  const configured = ctx.config.site.favicon;
  if (!configured) return theme.faviconSvg
    ? { data: Buffer.from(theme.faviconSvg), extension: ".svg" }
    : undefined;
  if (/^[a-z]+:\/\//i.test(configured)) throw new Error("site.favicon must be a local file path.");
  const extension = extname(configured).toLowerCase();
  if (!ICON_INPUTS.has(extension)) throw new Error(`Unsupported favicon format "${extension}".`);
  return { data: await readFile(configured), extension };
}

async function emitFavicon(ctx: PluginContext, theme: SvartzTheme): Promise<void> {
  if (!ctx.config.discovery.favicon.enabled || !ctx.index) return;
  const source = await faviconSource(ctx, theme);
  if (!source) return;
  const input = source.extension === ".ico"
    ? Buffer.from(extractLargestImageAsPng(source.data).data)
    : source.data;
  const image = sharp(input);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Favicon source has no image dimensions.");
  const icon = await sharp(input).resize(32, 32, { fit: "contain" }).png().toBuffer();
  const touch = await sharp(input).resize(180, 180, { fit: "contain" }).png().toBuffer();
  addImage(ctx, "favicon-32.png", icon, "image/png");
  addImage(ctx, "apple-touch-icon.png", touch, "image/png");
  if (source.extension === ".svg") addImage(ctx, "favicon.svg", source.data, "image/svg+xml");
  if (source.extension === ".ico") addImage(ctx, "favicon.ico", source.data, "image/x-icon");
  ctx.index = {
    ...ctx.index,
    favicon: {
      ...(source.extension === ".svg" && { svg: mountedAsset(ctx, "favicon.svg") }),
      png: mountedAsset(ctx, "favicon-32.png"),
      appleTouch: mountedAsset(ctx, "apple-touch-icon.png"),
      inline: `data:image/png;base64,${icon.toString("base64")}`,
    },
  };
}

export const EMIT_IMAGES_ID = "core:emit-images" as const;

export const emitImages = definePlugin(() => ({
  id: EMIT_IMAGES_ID,
  emitArtifacts: {
    async run(ctx) {
      if (!ctx.index) return;
      const theme = ctx.meta.get("svartz:theme") as SvartzTheme | undefined;
      if (!theme) return;
      await emitSocialImages(ctx, theme);
      await emitFavicon(ctx, theme);
    },
    options: { fatal: true },
  },
}));

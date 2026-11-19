/** Publish notes after frontmatter parsing and retain only assets they reference. */
import { randomBytes } from "node:crypto";
import { minimatch } from "minimatch";
import { extname } from "node:path";
import { definePlugin, type ProcessedFile, type ResolvedConfig } from "@svartz/core";
import { referencedAssets } from "./internal/asset-references";
import { publicationOverride } from "./internal/datetime";
import { shouldIgnore } from "./internal/ignore";

const NOTE_EXTENSIONS = new Set([".md", ".mdx", ".svx"]);

const matches = (path: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => minimatch(path.replaceAll("\\", "/"), pattern, { dot: true }));

function isNote(file: ProcessedFile): boolean {
  return NOTE_EXTENSIONS.has(file.extension ?? extname(file.path).toLowerCase());
}

/**
 * Whether the build publishes a note at `path` inside the vault with `frontmatter`: discovery reads its folder, and
 * the vault's include and exclude patterns let it through and it isn't a draft, unless a publication date publishes
 * it anyway, and it isn't private. A published note may still be password-protected. Page history judges a note's
 * earlier versions with it, at the paths they had then.
 */
export function publishesNote(
  config: Pick<ResolvedConfig, "include" | "exclude" | "publicationMode" | "frontmatter">,
  path: string,
  frontmatter: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (path.replaceAll("\\", "/").split("/").some(shouldIgnore)) return false;
  let published = (config.publicationMode !== "inclusion" || matches(path, config.include)) && !matches(path, config.exclude);
  if (frontmatter?.draft === true) published = false;
  if (publicationOverride(frontmatter, config.frontmatter.publishedField) !== undefined) published = true;
  return published && frontmatter?.private !== true;
}

/**
 * Whether the build may publish the attachment at `path` inside the vault: discovery reads its folder and the
 * exclude patterns let it through. The build publishes it only once a published note references it.
 */
export function keepsAttachment(config: Pick<ResolvedConfig, "exclude">, path: string): boolean {
  return !path.replaceAll("\\", "/").split("/").some(shouldIgnore) && !matches(path, config.exclude);
}

export const filterUnpublished = definePlugin(() => ({
  id: "core:filter-unpublished",

  filterUnpublished: {
    run(ctx) {
      const publishedNotes = ctx.files.filter((file) => isNote(file) && publishesNote(ctx.config, file.path, file.frontmatter));

      let protectedCount = 0;
      for (const file of publishedNotes) {
        delete file.protection;
        const group = file.frontmatter?.password_group;
        if (group === undefined) {
          if (file.frontmatter?.hide_locked === true) {
            throw new Error(`Note "${file.path}" uses hide_locked without password_group`);
          }
          continue;
        }
        if (typeof group !== "string" || group.trim() !== group || group.length === 0) {
          throw new Error(`Note "${file.path}" needs a nonempty password_group name`);
        }
        const setting = ctx.config.passwordGroups?.[group];
        if (!setting) throw new Error(`Note "${file.path}" names undefined password group "${group}"`);
        if (!process.env[setting.env]) {
          throw new Error(`Password group "${group}" needs environment variable ${setting.env}`);
        }
        if (file.frontmatter?.hide_locked !== undefined && typeof file.frontmatter.hide_locked !== "boolean") {
          throw new Error(`Note "${file.path}" needs boolean hide_locked`);
        }
        file.protection = { group, hidden: file.frontmatter?.hide_locked === true };
        protectedCount++;
      }
      if (protectedCount > 0 && ctx.meta.get("svartz:protectionReady") !== true) {
        throw new Error("Protected notes require the encrypted publication pipeline");
      }
      const previousTokens = ctx.meta.get("svartz:protectedGroupTokens") as ReadonlyMap<string, string> | undefined;
      const groupTokens = new Map<string, string>();
      for (const file of publishedNotes) {
        const group = file.protection?.group;
        if (group && !groupTokens.has(group)) {
          groupTokens.set(group, previousTokens?.get(group) ?? randomBytes(18).toString("base64url"));
        }
      }
      ctx.meta.set("svartz:protectedGroupTokens", groupTokens);

      const assets = ctx.files.filter(
        (file) => !isNote(file) && keepsAttachment(ctx.config, file.path),
      );
      const roamMedia = ctx.meta.get("svartz:roamMedia") === true;
      const usedAssets = referencedAssets(publishedNotes, assets, roamMedia);
      ctx.meta.set("svartz:publicAssetPaths", referencedAssets(publishedNotes.filter((file) => !file.protection), assets, roamMedia));
      const protectedAssetPaths = new Map<string, Set<string>>();
      for (const file of publishedNotes) {
        if (!file.protection) continue;
        const groupAssets = protectedAssetPaths.get(file.protection.group) ?? new Set<string>();
        for (const path of referencedAssets([file], assets, roamMedia)) groupAssets.add(path);
        protectedAssetPaths.set(file.protection.group, groupAssets);
      }
      ctx.meta.set("svartz:protectedAssetPaths", protectedAssetPaths);
      const publishedPaths = new Set(publishedNotes.map((file) => file.path));
      ctx.files = ctx.files.filter((file) =>
        isNote(file) ? publishedPaths.has(file.path) : usedAssets.has(file.path),
      );

      const bodies = ctx.meta.get("sourceBodies");
      if (bodies instanceof Map) {
        const paths = new Set(publishedNotes.map((file) => file.path));
        for (const path of bodies.keys()) {
          if (!paths.has(path)) bodies.delete(path);
        }
      }
    },
    options: { fatal: true, enforce: "post" },
  },
}));

export const FILTER_UNPUBLISHED_ID = "core:filter-unpublished" as const;

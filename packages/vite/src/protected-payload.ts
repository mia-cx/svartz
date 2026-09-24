/** Package one password group's executable notes and metadata as ciphertext. */
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createProtectionSalt,
  deriveProtectionKey,
  sealProtectedPayload,
  type Artifact,
  type IndexEntry,
  type PluginContext,
} from "@svartz/core";
import { lookup } from "mrmime";
import { compileProtectedGraph } from "./protected-compile";

/** Build-local group output. Only `artifact.contents` may enter the public output. */
export async function createProtectedGroupArtifact(
  ctx: PluginContext,
  group: string,
  root: string,
): Promise<Artifact> {
  const environmentName = ctx.config.passwordGroups?.[group]?.env;
  const password = environmentName ? process.env[environmentName] : undefined;
  if (!password) throw new Error(`Password group "${group}" has no configured password`);
  const entries = (ctx.meta.get("svartz:protectedEntries") as Map<string, IndexEntry[]> | undefined)?.get(group);
  if (!entries?.length) throw new Error(`Password group "${group}" has no protected index`);

  const graph = await compileProtectedGraph(ctx, group, root);
  const paths = (ctx.meta.get("svartz:protectedAssetPaths") as Map<string, Set<string>> | undefined)?.get(group);
  const assets = await Promise.all([...paths ?? []].sort().map(async (path) => {
    const file = ctx.files.find((candidate) => candidate.path === path);
    if (!file?.sourcePath) throw new Error(`Protected attachment "${path}" is unavailable`);
    return {
      path,
      mimeType: lookup(path) ?? "application/octet-stream",
      data: (await readFile(file.sourcePath)).toString("base64"),
    };
  }));

  const token = randomBytes(18).toString("base64url");
  const id = `vault:${ctx.config.id}:group:${token}`;
  const salt = createProtectionSalt();
  const key = await deriveProtectionKey(password, salt);
  const payload = { version: 1, notes: graph.notes, entries, js: graph.js, css: graph.css, assets };
  const envelope = await sealProtectedPayload(key, salt, id, new TextEncoder().encode(JSON.stringify(payload)));
  const artifactKey = `assets/__svartz/protected/${token}.json`;
  return {
    key: artifactKey,
    path: resolve(ctx.config.outDir, "..", "artifacts", artifactKey),
    type: "asset",
    pluginId: "svartz:protected-payload",
    contents: JSON.stringify(envelope),
    mimeType: "application/json",
  };
}

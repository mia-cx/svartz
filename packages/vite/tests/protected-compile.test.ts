import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deriveProtectionKey, openProtectedPayload, resolveProtectedBridgeImports, type PluginContext, type ProcessedFile, type ProtectedEnvelope } from "@svartz/core";
import { expect, it, vi } from "vitest";
import { compileProtectedGraph } from "../src/protected-compile";
import { createProtectedGroupArtifact, emitProtectedGroupArtifacts } from "../src/protected-payload";
import { writeProtectedBridgeModules } from "../src/protected-bridge";

function context(root: string, files: ProcessedFile[]): PluginContext {
  return {
    config: {
      id: "test",
      path: join(root, "vault"),
      outDir: join(root, "dist"),
      frontmatter: { titleField: "title" },
      passwordGroups: { friends: { env: "SVARTZ_TEST_PASSWORD" } },
    },
    files,
    artifacts: new Map(),
    meta: new Map(),
  } as unknown as PluginContext;
}

function note(root: string, name: string, content: string, group: string): ProcessedFile {
  return {
    path: name,
    sourcePath: join(root, "vault", name),
    slug: name.replace(/\.svx$/, ""),
    extension: ".svx",
    content,
    frontmatter: { title: name },
    protection: { group, hidden: false },
  };
}

it("bundles transformed SVX and nested Svelte imports only in memory", async () => {
  const root = await mkdtemp(join(process.cwd(), ".tmp-protected-graph-"));
  const vault = join(root, "vault");
  try {
    await mkdir(vault);
    const content = '<script>import Counter from "./Counter.svelte";</script><h1>GRAPH_SECRET</h1><Counter /><style>h1 { color: red; }</style>';
    await writeFile(join(vault, "Note.svx"), "<h1>RAW_SECRET</h1>");
    await writeFile(join(vault, "Counter.svelte"), '<p>Nested counter</p>');
    const result = await compileProtectedGraph(context(root, [note(root, "Note.svx", content, "friends")]), "friends", root);

    expect(result.js).toContain("GRAPH_SECRET");
    expect(result.js).not.toContain("RAW_SECRET");
    expect(result.js).toContain("Nested counter");
    expect(result.css).toContain("color:red");
    expect(result.bridgeImports).toContain("svelte/internal/client");
    expect(result.js).toContain("svartz:bridge/");
    expect(result.modules.some((id) => id.endsWith("Note.svx"))).toBe(true);
    expect(result.modules.some((id) => id.endsWith("Counter.svelte"))).toBe(true);
    expect(await readdir(root)).toEqual(["vault"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("encrypts group code, metadata, and attachments without plaintext output", async () => {
  const root = await mkdtemp(join(process.cwd(), ".tmp-protected-payload-"));
  const vault = join(root, "vault");
  vi.stubEnv("SVARTZ_TEST_PASSWORD", "test-only-password");
  try {
    await mkdir(vault);
    await writeFile(join(vault, "Note.svx"), "<p>GROUP_BODY_SECRET</p>");
    await writeFile(join(vault, "photo.png"), Uint8Array.from([0, 1, 2, 255]));
    const ctx = context(root, [
      note(root, "Note.svx", "<p>GROUP_BODY_SECRET</p>", "friends"),
      { path: "photo.png", sourcePath: join(vault, "photo.png"), slug: "photo.png", extension: ".png", content: "" },
    ]);
    ctx.meta.set("svartz:protectedEntries", new Map([["friends", [{ slug: "Note", title: "GROUP_METADATA_SECRET" }]]]));
    ctx.meta.set("svartz:protectedAssetPaths", new Map([["friends", new Set(["photo.png"])]]));
    ctx.meta.set("svartz:protectedGroupTokens", new Map([["friends", "fixtureToken"]]));

    const artifact = await createProtectedGroupArtifact(ctx, "friends", root);
    const serialized = String(artifact.contents);
    expect(artifact.key).toMatch(/^assets\/__svartz\/protected\/[A-Za-z0-9_-]+\.json$/);
    expect(serialized).not.toMatch(/GROUP_BODY_SECRET|GROUP_METADATA_SECRET|test-only-password|photo\.png/);
    expect(await readdir(root)).toEqual(["vault"]);

    const envelope = JSON.parse(serialized) as ProtectedEnvelope;
    const key = await deriveProtectionKey("test-only-password", envelope.salt);
    const plaintext = await openProtectedPayload(key, envelope, envelope.id);
    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    expect(payload.js).toContain("GROUP_BODY_SECRET");
    expect(payload.entries[0].title).toBe("GROUP_METADATA_SECRET");
    expect(payload.notes).toEqual([{ slug: "Note", exportName: "note0" }]);
    expect(payload.bridgeImports).toContain("svelte/internal/client");
    const bridgeUrls = Object.fromEntries(payload.bridgeImports.map((id: string) =>
      [id, `https://example.test/${encodeURIComponent(id)}.js`]));
    expect(resolveProtectedBridgeImports(payload, bridgeUrls)).not.toContain("svartz:bridge/");
    expect(payload.assets).toEqual([{ path: "photo.png", mimeType: "image/png", data: "AAEC/w==" }]);

    await emitProtectedGroupArtifacts(ctx, root);
    const written = await readFile(artifact.path, "utf8");
    expect(written).toBe(ctx.artifacts.get(artifact.key)?.contents);
    expect(written).not.toMatch(/GROUP_BODY_SECRET|GROUP_METADATA_SECRET|test-only-password|photo\.png/);
    const bridges = await writeProtectedBridgeModules(ctx);
    const clientBridge = bridges.find((bridge) => bridge.id === "svelte/internal/client");
    expect(clientBridge).toBeDefined();
    expect(await readFile(clientBridge!.path, "utf8"))
      .toContain('export * from "svelte/internal/client";');
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});

it("rejects server-only and cross-group imports before publication", async () => {
  const root = await mkdtemp(join(process.cwd(), ".tmp-protected-import-"));
  const vault = join(root, "vault");
  try {
    await mkdir(vault);
    await writeFile(join(vault, "secret.server.js"), "export const secret = 'SERVER_SECRET'");
    await writeFile(join(vault, "Client.svelte"), '<script>import { secret } from "./secret.server.js";</script>{secret}');
    const server = note(root, "Note.svx", '<script>import Client from "./Client.svelte";</script><Client />', "friends");
    await writeFile(server.sourcePath!, server.content);
    await expect(compileProtectedGraph(context(root, [server]), "friends", root)).rejects.toThrow(/server-only/);

    const other = note(root, "Other.svx", "<p>OTHER_GROUP_SECRET</p>", "family");
    await writeFile(other.sourcePath!, other.content);
    const crossGroup = note(root, "Note.svx", '<script>import Other from "./Other.svx";</script><Other />', "friends");
    await writeFile(crossGroup.sourcePath!, crossGroup.content);
    await expect(compileProtectedGraph(context(root, [crossGroup, other]), "friends", root)).rejects.toThrow(/cannot import note/);

    await writeFile(join(vault, "Unpublished.svx"), "<p>UNPUBLISHED_SECRET</p>");
    const unpublished = note(root, "Note.svx", '<script>import Hidden from "./Unpublished.svx";</script><Hidden />', "friends");
    await writeFile(unpublished.sourcePath!, unpublished.content);
    await expect(compileProtectedGraph(context(root, [unpublished]), "friends", root)).rejects.toThrow(/unpublished note/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

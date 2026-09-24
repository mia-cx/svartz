import { expect, it } from "vitest";
import { createProtectionSalt, deriveProtectionKey, sealProtectedPayload } from "../src/protection";
import { ProtectedSession, resolveProtectedBridgeImports, type ProtectedGroupPayload } from "../src/protected-session";
import { mergeProtectedIndex } from "../src/protected-session";
import type { Index, IndexEntry } from "../src/types";

const entry = (slug: string, locked = false): IndexEntry => ({
  slug, href: `/${slug}/`, path: `${slug}.svx`, properties: {},
  page: { toc: true, comments: false }, title: slug, ...(locked ? { locked: true } : {}),
  tags: [], aliases: [], content: slug, links: [], toc: [],
  wordCount: 1, readingTimeMinutes: 1,
});

it("keeps password groups independently unlocked for the current session", async () => {
  const payload: ProtectedGroupPayload = {
    version: 1,
    notes: [{ slug: "locked", exportName: "note0" }],
    entries: [entry("locked")],
    search: [{ id: "locked", slug: "locked", href: "/locked/", title: "Secret title", content: "secret", tags: [], aliases: [] }],
    graph: { locked: ["public"], public: ["locked"] },
    js: 'import { mount } from "svartz:bridge/svelte";',
    css: "",
    assets: [],
    bridgeImports: ["svelte"],
  };
  const salt = createProtectionSalt();
  const key = await deriveProtectionKey("friends-password", salt);
  const envelope = await sealProtectedPayload(key, salt, "vault:blog:group:friends", new TextEncoder().encode(JSON.stringify(payload)));
  const session = new ProtectedSession();

  await expect(session.unlock(envelope, "wrong-password", envelope.id)).rejects.toThrow();
  expect(session.get(envelope.id)).toBeUndefined();
  expect(await session.unlock(envelope, "friends-password", envelope.id)).toEqual(payload);
  expect(session.get(envelope.id)?.search[0]?.title).toBe("Secret title");
  expect(session.get("vault:blog:group:family")).toBeUndefined();
  expect(resolveProtectedBridgeImports(payload, { svelte: "https://example.test/bridge.js" }))
    .toContain('from "https://example.test/bridge.js"');
  expect(() => resolveProtectedBridgeImports(payload, {})).toThrow(/Missing host runtime bridge/);
  session.lock(envelope.id);
  expect(session.get(envelope.id)).toBeUndefined();
});

it("merges unlocked discovery without listing hidden notes", () => {
  const index: Index = {
    version: "1.0.0", entries: [entry("public"), entry("locked", true)],
    search: [{ id: "public", slug: "public", href: "/public/", title: "public", content: "public", tags: [], aliases: [] }],
    graph: { public: [] }, backlinks: { public: [], locked: [] },
    tags: [], folders: [], assets: [],
    routes: { mountPath: "", notes: ["/public/", "/locked/", "/hidden/"], redirects: {}, tags: [], folders: [], feed: [], all: [] },
  };
  const group: ProtectedGroupPayload = {
    version: 1, notes: [], entries: [entry("locked"), entry("hidden")],
    search: [{ id: "locked", slug: "locked", href: "/locked/", title: "locked", content: "secret", tags: [], aliases: [] }],
    graph: { public: ["locked"], locked: ["public"], hidden: ["public"] },
    js: "", css: "", assets: [], bridgeImports: [],
  };
  const merged = mergeProtectedIndex(index, [group]);
  expect(merged.entries.map((item) => [item.slug, item.locked])).toEqual([["locked", undefined], ["public", undefined]]);
  expect(merged.search.map((item) => item.slug)).toEqual(["locked", "public"]);
  expect(merged.graph).toEqual({ locked: ["public"], public: ["locked"] });
  expect(merged.backlinks.locked).toEqual(["public"]);
  expect(JSON.stringify(merged)).not.toContain("hidden.svx");
});

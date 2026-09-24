import { expect, it } from "vitest";
import { createProtectionSalt, deriveProtectionKey, sealProtectedPayload } from "../src/protection";
import { ProtectedSession, resolveProtectedBridgeImports, type ProtectedGroupPayload } from "../src/protected-session";

it("keeps password groups independently unlocked for the current session", async () => {
  const payload: ProtectedGroupPayload = {
    version: 1,
    notes: [{ slug: "locked", exportName: "note0" }],
    entries: [{ slug: "locked", title: "Secret title" }],
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
  expect(session.get(envelope.id)?.entries[0]?.title).toBe("Secret title");
  expect(session.get("vault:blog:group:family")).toBeUndefined();
  expect(resolveProtectedBridgeImports(payload, { svelte: "https://example.test/bridge.js" }))
    .toContain('from "https://example.test/bridge.js"');
  expect(() => resolveProtectedBridgeImports(payload, {})).toThrow(/Missing host runtime bridge/);
  session.lock(envelope.id);
  expect(session.get(envelope.id)).toBeUndefined();
});

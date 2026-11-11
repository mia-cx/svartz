import { afterEach, describe, expect, it, vi } from "vitest";
import { seal, unseal } from "../src/seal";

const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const OTHER_SECRET = "other-secret-0123456789-abcdefghijklmn";
const DAY_SECONDS = 86_400;

afterEach(() => vi.useRealTimers());

describe("sealed cookie values", () => {
  it("open with the same secret and purpose before they expire", async () => {
    const sealed = await seal({ id: "github:1" }, SECRET, "session", DAY_SECONDS);
    expect(await unseal(sealed, SECRET, "session")).toEqual({ id: "github:1" });
  });

  it.each([
    ["one flipped character", (sealed: string) => sealed.slice(0, 20) + (sealed[20] === "A" ? "B" : "A") + sealed.slice(21), SECRET, "session"],
    ["a truncated value", (sealed: string) => sealed.slice(0, -4), SECRET, "session"],
    ["text that isn't base64url", () => "%%%not-sealed%%%", SECRET, "session"],
    ["another secret", (sealed: string) => sealed, OTHER_SECRET, "session"],
    ["the OAuth flow's key", (sealed: string) => sealed, SECRET, "oauth"],
  ] as const)("read as nothing after %s", async (_case, mutate, secret, purpose) => {
    const sealed = await seal({ id: "github:1" }, SECRET, "session", DAY_SECONDS);
    expect(await unseal(mutate(sealed), secret, purpose)).toBeUndefined();
  });

  it("read as nothing once they expire", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-11T00:00:00Z"));
    const sealed = await seal({ id: "github:1" }, SECRET, "session", DAY_SECONDS);
    vi.setSystemTime(new Date("2026-11-11T23:59:59Z"));
    expect(await unseal(sealed, SECRET, "session")).toEqual({ id: "github:1" });
    vi.setSystemTime(new Date("2026-11-12T00:00:01Z"));
    expect(await unseal(sealed, SECRET, "session")).toBeUndefined();
  });
});

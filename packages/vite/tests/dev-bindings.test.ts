import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serveDevBindings } from "../src/dev-bindings";

type WranglerStub = {
  calls: Record<string, unknown>[];
  failDispose: boolean;
  /** What `unstable_getVarsForDev` answers for GREETING, or `undefined` to make it throw. */
  greeting?: unknown;
};
type Slot = { [key: symbol]: (() => Promise<Readonly<Record<string, unknown>>>) | undefined } & { __wranglerStub?: WranglerStub };

const slot = globalThis as Slot;
const DEV_BINDINGS = Symbol.for("svartz.devBindings");
let root: string;

/** An app whose `wrangler` dependency records getPlatformProxy's options instead of starting workerd. */
async function appWithWranglerStub(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "svartz-dev-bindings-unit-"));
  await writeFile(join(dir, "package.json"), "{}");
  await writeFile(join(dir, "wrangler.json"), "{}");
  const wrangler = join(dir, "node_modules/wrangler");
  await mkdir(wrangler, { recursive: true });
  await writeFile(join(wrangler, "package.json"), JSON.stringify({ name: "wrangler", type: "module", main: "index.js" }));
  await writeFile(join(wrangler, "index.js"), `export async function getPlatformProxy(options) {
    const stub = globalThis.__wranglerStub;
    stub.calls.push(options);
    return { env: { DB: "local" }, dispose: async () => { if (stub.failDispose) throw new Error("dispose failed"); } };
  }
  export function unstable_readConfig() {
    return { vars: { GREETING: "hello" } };
  }
  export function unstable_getVarsForDev() {
    const { greeting } = globalThis.__wranglerStub;
    if (greeting === undefined) throw new Error("could not read .dev.vars");
    return { GREETING: greeting };
  }\n`);
  return dir;
}

/** A Wrangler config outside the project, as a vault build generates. */
async function generatedConfigDir(): Promise<string> {
  const dir = join(root, ".svartz/vaults/site");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "wrangler.json"), "{}");
  return dir;
}

beforeEach(async () => {
  slot.__wranglerStub = { calls: [], failDispose: false };
  root = await appWithWranglerStub();
});

afterEach(async () => {
  delete process.env.CLOUDFLARE_ENV;
  delete slot.__wranglerStub;
  delete slot[DEV_BINDINGS];
  await rm(root, { recursive: true, force: true });
});

describe("dev bindings", () => {
  it("selects the Wrangler environment CLOUDFLARE_ENV names, as wrangler and the adapter do", async () => {
    process.env.CLOUDFLARE_ENV = "staging";
    const stop = serveDevBindings(root, root);

    expect(await slot[DEV_BINDINGS]!()).toEqual({ DB: "local" });
    expect(slot.__wranglerStub!.calls).toEqual([expect.objectContaining({ environment: "staging", configPath: join(root, "wrangler.json") })]);
    await stop();
  });

  it("reports a failed proxy shutdown instead of swallowing it", async () => {
    const stop = serveDevBindings(root, root);
    await slot[DEV_BINDINGS]!();
    slot.__wranglerStub!.failDispose = true;

    await expect(stop()).rejects.toThrow("dispose failed");
    expect(slot[DEV_BINDINGS]).toBeUndefined();
  });

  // Wrangler 4.164 wraps each value as `{ type, value }`; earlier 4.x releases return it bare.
  it.each([
    ["bare", "hello"],
    ["wrapped", { type: "plain_text", value: "hello" }],
  ])("reads a generated config's project variables when Wrangler returns them %s", async (_shape, greeting) => {
    slot.__wranglerStub!.greeting = greeting;
    const stop = serveDevBindings(await generatedConfigDir(), root);

    expect(await slot[DEV_BINDINGS]!()).toEqual({ DB: "local", GREETING: "hello" });
    await stop();
  });

  it("starts no proxy when the project variables fail to load", async () => {
    const stop = serveDevBindings(await generatedConfigDir(), root);

    await expect(slot[DEV_BINDINGS]!()).rejects.toThrow("could not read .dev.vars");
    await expect(slot[DEV_BINDINGS]!()).rejects.toThrow("could not read .dev.vars");
    expect(slot.__wranglerStub!.calls).toEqual([]);
    await stop();
  });
});

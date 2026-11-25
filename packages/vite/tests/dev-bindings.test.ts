import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serveDevBindings } from "../src/dev-bindings";

type WranglerStub = {
  calls: Record<string, unknown>[];
  failDispose: boolean;
  /** The Wrangler release `unstable_getVarsForDev` answers like, or `undefined` to make it throw. */
  shape?: "bare" | "wrapped";
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
    return { env: { DB: "local", ...VARS }, dispose: async () => { if (stub.failDispose) throw new Error("dispose failed"); } };
  }
  // A JSON var shaped exactly like Wrangler's own wrapper.
  const VARS = { GREETING: "hello", FLAGS: { type: "json", value: { enabled: true } } };
  const SECRETS = { PRIVATE_SECRET: "from-dev-vars" };
  export function unstable_readConfig() {
    return { vars: VARS };
  }
  export function unstable_getVarsForDev(_configPath, _envFiles, vars) {
    const { shape } = globalThis.__wranglerStub;
    if (shape === undefined) throw new Error("could not read .dev.vars");
    if (shape === "bare") return { ...vars, ...SECRETS };
    const wrap = (type) => ([name, value]) => [name, { type, value }];
    return Object.fromEntries([
      ...Object.entries(vars).map(([name, value]) => wrap(typeof value === "string" ? "plain_text" : "json")([name, value])),
      ...Object.entries(SECRETS).map(wrap("secret_text")),
    ]);
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

    expect(await slot[DEV_BINDINGS]!()).toEqual({ DB: "local", GREETING: "hello", FLAGS: { type: "json", value: { enabled: true } } });
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

  // Wrangler 4.164 wraps each value as `{ type, value }`; earlier 4.x releases return vars and secrets bare.
  it.each(["bare", "wrapped"] as const)("adds a generated config's project secrets when Wrangler returns them %s", async (shape) => {
    slot.__wranglerStub!.shape = shape;
    const stop = serveDevBindings(await generatedConfigDir(), root);

    expect(await slot[DEV_BINDINGS]!()).toEqual({
      DB: "local",
      GREETING: "hello",
      FLAGS: { type: "json", value: { enabled: true } },
      PRIVATE_SECRET: "from-dev-vars",
    });
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

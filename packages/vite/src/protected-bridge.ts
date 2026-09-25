/** Generate public runtime facades that protected blob modules can import by URL. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { PluginContext } from "@svartz/core";

export interface ProtectedBridgeModule {
  readonly id: string;
  readonly path: string;
}

export async function writeProtectedBridgeModules(ctx: PluginContext): Promise<ProtectedBridgeModule[]> {
  const imports = ctx.meta.get("svartz:protectedBridgeImports") as ReadonlySet<string> | undefined;
  if (!imports?.size) return [];
  return Promise.all([...imports].sort().map(async (id) => {
    const name = createHash("sha256").update(id).digest("hex").slice(0, 20);
    const path = resolve(ctx.config.outDir, "..", "artifacts", "bridge", `${name}.ts`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `import * as runtime from ${JSON.stringify(id)};\nexport * from ${JSON.stringify(id)};\nexport const svartzBridgeExports = runtime;\nexport const svartzBridgeUrl = import.meta.url;\n`);
    return { id, path };
  }));
}

/**
 * Readers' comments beside the passage they respond to: `plugins: [auth({ … }), annotations({ database: { env: "DB" } })]`
 * in `svartz.config.ts`. The browser shows them with `attach` from `@svartz/plugin-annotations/browser`.
 */
import { fileURLToPath } from "node:url";
import { definePlugin, getCompilerContributions, type NormalizedSvartzPlugin, type SvartzPlugin } from "@svartz/core";
import type { MountOptions } from "./browser";
import type { AnnotationsOptions, AnnotationsServerOptions } from "./server";

export type { AnnotationsOptions, Reaction } from "./server";
export type { Annotation, Agreement } from "./store";
export type { Anchor } from "./anchor";

/** The plugin id, and so the path segment its routes answer under: `<mount>/_svartz/annotations/`. */
export const ANNOTATIONS_PLUGIN_ID = "annotations";

/** Writes each signed-in reader may make per hour unless `limits.writesPerHour` says otherwise. */
export const DEFAULT_WRITES_PER_HOUR = 30;

// Beside this module in dist.
const SERVER_MODULE = fileURLToPath(new URL("./server.js", import.meta.url));
const BROWSER_MODULE = fileURLToPath(new URL("./browser.js", import.meta.url));
const STYLESHEET = fileURLToPath(new URL("./browser.css", import.meta.url));

const REACTION_ID = /^[a-z0-9][a-z0-9-]*$/;
const IDENTITY_ID = /^[a-z]+:.+$/;

function fail(message: string): never {
  throw new Error(`[svartz:annotations] ${message}`);
}

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** Refuse config the routes could never serve, so a typo fails the build instead of every request. */
function resolve(options: AnnotationsOptions): AnnotationsServerOptions {
  if (!isText(options?.database?.env)) fail("database must name the D1 binding: { env: \"DB\" }");
  const reactions = options.reactions ?? [];
  if (!Array.isArray(reactions)) fail("reactions must be a list of { id, label, src }");
  const ids = new Set<string>();
  for (const [index, reaction] of reactions.entries()) {
    if (typeof reaction?.id !== "string" || !REACTION_ID.test(reaction.id)) {
      fail(`reactions[${index}].id must be lowercase letters, digits and hyphens`);
    }
    if (ids.has(reaction.id)) fail(`reactions lists "${reaction.id}" twice`);
    ids.add(reaction.id);
    if (!isText(reaction.label)) fail(`reactions[${index}].label must name the reaction for screen readers`);
    if (!isText(reaction.src)) fail(`reactions[${index}].src must be the reaction image's URL`);
  }
  const moderators = options.moderators ?? [];
  if (!Array.isArray(moderators) || !moderators.every((id) => typeof id === "string" && IDENTITY_ID.test(id))) {
    fail("moderators must be identity ids such as \"github:583231\"");
  }
  const writesPerHour = options.limits?.writesPerHour ?? DEFAULT_WRITES_PER_HOUR;
  if (!Number.isSafeInteger(writesPerHour) || writesPerHour < 1) fail("limits.writesPerHour must be a whole number above 0");
  return { database: { env: options.database.env }, reactions, moderators, limits: { writesPerHour } };
}

/** Annotations need a signed-in reader to write and D1 to store, so refuse a vault that has neither. */
function checkVault(vault: { readonly id: string; readonly target: { readonly type: string }; readonly plugins: readonly unknown[] }): void {
  if (vault.target.type === "node") {
    fail(`vault "${vault.id}" deploys to node, but annotations are stored in Cloudflare D1; deploy it to cloudflare-workers or cloudflare-pages`);
  }
  const auth = (vault.plugins as readonly SvartzPlugin[]).find(({ id }) => id === "auth");
  if (!auth?.server || auth.disabled) fail(`vault "${vault.id}" enables annotations without auth; add auth({ providers: … }) to the same vault`);
}

/**
 * The `annotations` plugin: its routes on the server, and in the browser a script that attaches to every note body a
 * theme marks with `data-svartz-note`, as theme-minimal and every theme extending it do.
 */
export function annotations(options: AnnotationsOptions): NormalizedSvartzPlugin {
  const serverOptions = resolve(options);
  const plugin: NormalizedSvartzPlugin = definePlugin(() => ({
    id: ANNOTATIONS_PLUGIN_ID,
    server: { module: SERVER_MODULE, options: serverOptions },
    forVault({ vault }) {
      checkVault(vault);
      return plugin;
    },
    emitArtifacts: {
      options: { fatal: true },
      run(ctx) {
        const compiler = getCompilerContributions(ctx);
        compiler.browserResources.set(ANNOTATIONS_PLUGIN_ID, {
          id: ANNOTATIONS_PLUGIN_ID,
          kind: "script",
          importId: BROWSER_MODULE,
          options: { endpoint: `${ctx.config.mountPath}/_svartz/${ANNOTATIONS_PLUGIN_ID}` } satisfies MountOptions,
        });
        compiler.browserResources.set(`${ANNOTATIONS_PLUGIN_ID}-css`, { id: `${ANNOTATIONS_PLUGIN_ID}-css`, kind: "css", importId: STYLESHEET });
      },
    },
  }))();
  return plugin;
}

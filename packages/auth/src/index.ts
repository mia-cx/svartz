/**
 * Reader sign-in for a vault: `plugins: [auth({ providers: { github: { … } } })]` in `svartz.config.ts`.
 * Server plugins read who is signed in with `readIdentity` from `@svartz/auth/server`.
 */
import { fileURLToPath } from "node:url";
import { definePlugin, getCompilerContributions, type ResolvedConfig } from "@svartz/core";
import type { SignInConfig } from "./browser";
import { isProviderId, PROVIDERS, type ProviderId } from "./providers";
import type { AuthOptions } from "./server";

export type { Identity, ProviderId } from "./providers";
export type { AuthOptions, ProviderOptions } from "./server";
export type { SignInConfig } from "./browser";

/** The plugin id, and so the path segment its routes answer under: `<mount>/_svartz/auth/`. */
export const AUTH_PLUGIN_ID = "auth";

// Beside this module in dist.
const SERVER_MODULE = fileURLToPath(new URL("./server.js", import.meta.url));
const BROWSER_MODULE = fileURLToPath(new URL("./browser.js", import.meta.url));
const STYLESHEET = fileURLToPath(new URL("./browser.css", import.meta.url));

function fail(message: string): never {
  throw new Error(`[svartz:auth] ${message}`);
}

/** Refuse config the routes could never serve, so a typo fails the build instead of every sign-in. */
function validate(options: AuthOptions): ProviderId[] {
  const names = Object.keys(options?.providers ?? {});
  if (names.length === 0) fail("list at least one provider under `providers`");
  for (const name of names) {
    if (!isProviderId(name)) fail(`unknown provider "${name}"; choose from ${Object.keys(PROVIDERS).join(", ")}`);
    const app = options.providers[name];
    if (typeof app?.clientId !== "string" || !app.clientId) fail(`providers.${name}.clientId must be the OAuth app's client ID`);
    if (typeof app.clientSecret?.env !== "string" || !app.clientSecret.env.trim()) {
      fail(`providers.${name}.clientSecret must name its environment variable: { env: "NAME" }`);
    }
  }
  if (options.privacyNotice !== undefined && typeof options.privacyNotice !== "string") {
    fail("privacyNotice must be the URL of the site's privacy notice");
  }
  return names as ProviderId[];
}

/**
 * The deployment base standalone shells give SvelteKit (`target.basePath` for `static` and `node`), so the browser
 * can reach the routes. Host vaults can't route server plugins yet.
 */
function deploymentBase(config: ResolvedConfig): string {
  const { target } = config;
  const base = (target.type === "static" || target.type === "node") && typeof target.basePath === "string" ? target.basePath : "";
  return base.replace(/\/+$/, "");
}

/** The `auth` plugin: sign-in routes on the server and the sign-in dialog in the browser. */
export function auth(options: AuthOptions) {
  const providers = validate(options);
  return definePlugin(() => ({
    id: AUTH_PLUGIN_ID,
    server: { module: SERVER_MODULE, options },
    emitArtifacts: {
      run(ctx) {
        const browser: SignInConfig = {
          endpoint: `${deploymentBase(ctx.config)}${ctx.config.mountPath}/_svartz/${AUTH_PLUGIN_ID}`,
          providers: providers.map((id) => ({ id, label: PROVIDERS[id].label })),
          ...options.privacyNotice ? { privacyNotice: options.privacyNotice } : {},
        };
        const compiler = getCompilerContributions(ctx);
        compiler.browserResources.set(AUTH_PLUGIN_ID, { id: AUTH_PLUGIN_ID, kind: "script", importId: BROWSER_MODULE, options: browser });
        compiler.browserResources.set(`${AUTH_PLUGIN_ID}-css`, { id: `${AUTH_PLUGIN_ID}-css`, kind: "css", importId: STYLESHEET });
      },
      options: { fatal: true },
    },
  }))();
}

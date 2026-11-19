import type { MaybePromise } from "../types";
import { decodeRoutePath } from "../route-path";

/** Path segment under which every server plugin answers: `<base><mount>/_svartz/<plugin-id>/`. */
export const SERVER_ROUTE_SEGMENT = "_svartz";

/** Path segment under which plugin pages render in the theme shell: `<base><mount>/-/<page>/`. */
export const PAGE_ROUTE_SEGMENT = "-";

/** Plugin ids that serve requests, and the page names plugins claim, double as one URL path segment. */
export const SERVER_PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Server-only environment variable names. Client-public `PUBLIC_` and `VITE_` names are refused. */
export const SECRET_ENV_NAME_PATTERN = /^(?!(?:PUBLIC_|VITE_))[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * `globalThis` slot through which `svartz dev` hands server plugins local Cloudflare bindings. The dev server (Node)
 * sets it to a function resolving the bindings; the router (SSR, same process) reads it per request in dev.
 */
export const DEV_BINDINGS = Symbol.for("svartz.devBindings");

/** What `svartz dev` stores in {@link DEV_BINDINGS}: resolves the bindings, vars and `.dev.vars` of the app's Wrangler config. */
export type DevBindings = () => Promise<Readonly<Record<string, unknown>>>;

/** Names a server environment variable in place of an inlined secret. */
export interface EnvReference {
  readonly env: string;
}

/** A plugin's server module and the JSON options its factory receives. */
export interface ServerModuleSpec<Options = unknown> {
  /** Absolute path, `file:` URL or package specifier of a module whose default export is a {@link ServerModuleFactory}. */
  readonly module: string;
  /** JSON-serializable. Name secrets with `{ env: "NAME" }`; read them from `context.env` per request. */
  readonly options?: Options;
  /**
   * Run this plugin's factory before the site answers its first request at runtime (a page, a plugin or one of the
   * app's own routes), instead of on this plugin's own first request. For a plugin whose factory sets up what other
   * code reads, as `auth`'s does with its admins. A factory that throws fails every request until it starts.
   */
  readonly eager?: boolean;
  /**
   * Pages this plugin renders in the theme shell. Each name claims `<base><mount>/-/<name>/` and every path below it,
   * such as `account` for `/-/account/`, or `history` for `/-/history/notes/intro/`. Names follow the plugin id rules,
   * and no two plugins on a vault may claim one. The factory's `page` renders them.
   */
  readonly pages?: readonly string[];
}

/** Public settings of the vault a server plugin belongs to. */
export interface ServerVaultSettings {
  readonly id: string;
  readonly mountPath: string;
  readonly site: Readonly<Record<string, unknown>>;
}

/** Per-request facilities handed to a server plugin's handler. */
export interface ServerContext {
  /**
   * The platform's env (Cloudflare vars, secrets and bindings), else the server's private env vars (Node). In dev, the
   * private env vars plus any {@link DEV_BINDINGS}, which win on a shared name.
   */
  readonly env: Readonly<Record<string, unknown>>;
  /** The client's IP address, when the adapter reports one. */
  readonly clientAddress: string | undefined;
  readonly vault: ServerVaultSettings;
  /** The absolute path this plugin answers under, without a trailing slash, such as `/_svartz/submissions`. */
  readonly base: string;
  /** Keeps work alive after the response: the platform's `waitUntil` on Workers; elsewhere the promise runs on and its failure is logged. */
  waitUntil(promise: Promise<unknown>): void;
}

/** Answers a request under the plugin's prefix. `undefined` answers 404. */
export type ServerHandler = (request: Request, context: ServerContext) => MaybePromise<Response | undefined>;

/** Per-request facilities handed to a plugin's page renderer. */
export interface PageContext extends ServerContext {
  /** The page's path below `/-/`, decoded and ending in a slash: `account/`, or `history/notes/intro/`. */
  readonly path: string;
}

/** A plugin page's content. The theme shell renders `html` as the page body, under its header and beside its explorer. */
export interface PluginPage {
  /** The document title, before the site's: `Account | Notes`. */
  readonly title: string;
  /** The page body, its heading included. Escape everything a reader or a provider supplied. */
  readonly html: string;
}

/** What a page renderer answers: the page, or a same-site path to send the reader to instead. */
export type PageResult = PluginPage | { readonly redirect: string };

/**
 * Renders a GET of one of the plugin's pages; `undefined` answers 404. Pages render on every request and are never
 * prerendered or cached. Forms on them post to the plugin's `/_svartz/<id>/` routes, which redirect back.
 */
export type PageRenderer = (request: Request, context: PageContext) => MaybePromise<PageResult | undefined>;

/** What a server factory builds when it renders pages: its request handler, if any, and its page renderer. */
export interface ServerModule {
  readonly handle?: ServerHandler;
  readonly page?: PageRenderer;
}

/**
 * A server module's default export: builds the handler once from the plugin's options and the build data its hooks
 * set in `getCompilerContributions(ctx).serverData` (`undefined` when they set none). A plugin with `pages` answers
 * `{ handle, page }`.
 */
export type ServerModuleFactory<Options = unknown, Data = unknown> = (options: Options, data: Data) => ServerHandler | ServerModule;

/** One active server plugin in a generated registry. */
export interface ServerRoute {
  readonly id: string;
  readonly load: () => Promise<unknown>;
  readonly options?: unknown;
  /** What the plugin's hooks recorded for its server module during this build. */
  readonly data?: unknown;
  /** The spec's `eager`: its factory runs before the handle answers its first request. */
  readonly eager?: boolean;
  /** The spec's `pages`: the names below `/-/` this plugin renders. */
  readonly pages?: readonly string[];
}

/** What a build knows about its server plugins; `virtual:svartz/server` exports one per vault. */
export interface ServerRegistry {
  /** Deployment base plus vault mount, without a trailing slash. */
  readonly basePath: string;
  readonly vault: ServerVaultSettings;
  readonly servers: readonly ServerRoute[];
  /** Published page URLs and their emitted Markdown copies, including the deployment base. */
  readonly markdown?: Readonly<Record<string, string>>;
}

/** The parts of SvelteKit's `RequestEvent` the router reads. */
export interface ServerHandleEvent {
  readonly request: Request;
  readonly url: URL;
  readonly platform?: unknown;
  /** The route SvelteKit matched, whose `trailingSlash` it applied before hooks ran; `id` is `null` when none did. */
  readonly route?: { readonly id: string | null };
  getClientAddress(): string;
}

/** Runtime inputs SvelteKit supplies to the generated registry. */
export interface ServerHandleRuntime {
  /**
   * The server's private env, used when the platform has no env of its own: `$env/dynamic/private` in SvelteKit 2,
   * `process.env` in SvelteKit 3, whose `$env/dynamic/private` holds only the variables an app declares.
   */
  readonly privateEnv: Readonly<Record<string, unknown>>;
  /**
   * The `cloudflare:workers` module on Cloudflare under SvelteKit 3, which no longer puts `env` and `ctx` on
   * `platform`: plugins read its `env` and keep work alive with its `waitUntil`.
   */
  readonly workers?: { readonly env: Readonly<Record<string, unknown>> } & WaitUntilHost;
  /** `$app/environment`'s `building`: plugin routes answer 404 while prerendering. */
  readonly building: boolean;
  /**
   * `$app/environment`'s `dev`: `context.env` is then `privateEnv` (the dev server's env and `.env`) plus the
   * {@link DEV_BINDINGS}, because adapter-cloudflare's dev emulator withholds `platform.env` from prerenderable routes,
   * which plugin URLs fall under.
   */
  readonly dev: boolean;
}

type WaitUntilHost = { waitUntil(promise: Promise<unknown>): void };

function platformEnv(platform: unknown): Readonly<Record<string, unknown>> | undefined {
  const env = (platform as { env?: unknown } | undefined)?.env;
  return env && typeof env === "object" ? env as Record<string, unknown> : undefined;
}

async function devEnv(privateEnv: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
  const bindings = (globalThis as { [DEV_BINDINGS]?: DevBindings })[DEV_BINDINGS];
  return bindings ? { ...privateEnv, ...await bindings() } : privateEnv;
}

function platformWaitUntil(platform: unknown): WaitUntilHost | undefined {
  const { ctx, context } = (platform ?? {}) as { ctx?: Partial<WaitUntilHost>; context?: Partial<WaitUntilHost> };
  const host = ctx ?? context;
  return typeof host?.waitUntil === "function" ? host as WaitUntilHost : undefined;
}

function clientAddress(event: ServerHandleEvent): string | undefined {
  try {
    // adapter-cloudflare answers null without a cf-connecting-ip header.
    return event.getClientAddress() || undefined;
  } catch {
    // Adapters without a client address throw; the contract reports it as unknown.
    return undefined;
  }
}

function notFound(pathname: string): Response {
  return Response.json({ error: "not_found", message: `Nothing answers ${pathname}.` }, { status: 404 });
}

async function loadServerModule(route: ServerRoute): Promise<ServerModule> {
  const module = await route.load() as { default?: unknown };
  if (typeof module.default !== "function") {
    throw new Error(`[svartz:server] plugin "${route.id}" server module must default-export a factory`);
  }
  const built: unknown = module.default(route.options, route.data);
  if (typeof built === "function") return { handle: built as ServerHandler };
  const { handle, page } = (built ?? {}) as Partial<Record<keyof ServerModule, unknown>>;
  if ((typeof handle === "function" || handle === undefined) && (typeof page === "function" || page === undefined)
    && (handle || page)) {
    return built as ServerModule;
  }
  throw new Error(`[svartz:server] plugin "${route.id}" server factory must return a handler or { handle, page }`);
}

/** Explicit media preferences take precedence over the known agent's default representation. */
function wantsMarkdown(request: Request): boolean {
  const ranges = (request.headers.get("accept") ?? "").toLowerCase().split(",").map((part) => {
    const [type, ...parameters] = part.trim().split(";");
    const quality = parameters.map((value) => value.trim()).find((value) => value.startsWith("q="));
    const q = quality === undefined ? 1 : Number(quality.slice(2));
    return { type, q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0 };
  });
  const quality = (type: string): number => {
    for (const match of [type, "text/*", "*/*"]) {
      const found = ranges.filter((range) => range.type === match);
      if (found.length) return Math.max(...found.map((range) => range.q));
    }
    return 0;
  };
  const markdown = quality("text/markdown");
  const html = quality("text/html");
  if (markdown !== html) return markdown > html;
  const explicitHtml = ranges.some((range) => range.type === "text/html");
  if (ranges.some((range) => range.type === "text/markdown")) return markdown > 0 && !explicitHtml;
  if (explicitHtml) return false;
  return markdown > 0 || !request.headers.has("accept")
    ? /\b(?:GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|Amazonbot|cohere-ai)\b/i.test(request.headers.get("user-agent") ?? "")
    : false;
}

/**
 * The emitted Markdown copy of the page at a request `pathname`, if it has one. Map keys are decoded and end in a
 * slash; request paths arrive percent-encoded, and without the slash under `trailingSlash: 'never'`.
 */
export function markdownCopyFor(markdown: Readonly<Record<string, string>> | undefined, pathname: string): string | undefined {
  if (!markdown) return undefined;
  const decoded = decodeRoutePath(pathname);
  if (decoded === undefined) return undefined;
  const key = decoded.endsWith("/") ? decoded : `${decoded}/`;
  return Object.hasOwn(markdown, key) ? markdown[key] : undefined;
}

function varyRepresentation(response: Response): Response {
  const result = new Response(response.body, response);
  const vary = new Set((result.headers.get("vary") ?? "").split(",").map((name) => name.trim()).filter(Boolean));
  if (!vary.has("*")) {
    for (const name of ["Accept", "User-Agent"]) {
      if (![...vary].some((existing) => existing.toLowerCase() === name.toLowerCase())) vary.add(name);
    }
  }
  result.headers.set("vary", [...vary].join(", "));
  // Cloudflare's shared cache does not key on arbitrary Vary fields.
  if (!/\bno-store\b/i.test(result.headers.get("cache-control") ?? "")) {
    result.headers.set("cache-control", "private, no-cache");
  }
  return result;
}

/** Serves a vault's server plugins: SvelteKit's `handle`, and the `load` of the route that renders plugin pages. */
export interface SvartzServer {
  /**
   * The SvelteKit `handle`: sends `<basePath>/_svartz/<id>/…` to plugin `<id>` and every other request to `resolve`.
   * Published page GET/HEAD requests that prefer Markdown get a 303 to the page's emitted copy; others resolve HTML.
   * Unknown ids, and handlers answering `undefined`, return 404. Responses for plugin pages are never cached.
   */
  readonly handle: <Event extends ServerHandleEvent>(input: {
    event: Event;
    resolve: (event: Event) => MaybePromise<Response>;
  }) => Promise<Response>;
  /**
   * The plugin page at `event.url`, rendered by the plugin that claims its name, or `undefined` when no plugin
   * renders one there (or while prerendering). The route's `load` turns a redirect into SvelteKit's and `undefined`
   * into a 404.
   */
  readonly page: (event: ServerHandleEvent) => Promise<PageResult | undefined>;
}

/**
 * Build a vault's {@link SvartzServer}. Each factory runs once: on its plugin's first request or page, or for an
 * `eager` plugin before the handle answers its first request of any kind.
 */
export function createServer(registry: ServerRegistry, runtime: ServerHandleRuntime): SvartzServer {
  const root = `${registry.basePath}/${SERVER_ROUTE_SEGMENT}/`;
  const pagesRoot = `${registry.basePath}/${PAGE_ROUTE_SEGMENT}/`;
  const routes = new Map(registry.servers.map((route) => [route.id, route]));
  const pageOwners = new Map(registry.servers.flatMap((route) => (route.pages ?? []).map((name) => [name, route] as const)));
  const eager = registry.servers.filter((route) => route.eager);
  const modules = new Map<string, Promise<ServerModule>>();

  const moduleFor = (route: ServerRoute): Promise<ServerModule> => {
    const cached = modules.get(route.id);
    if (cached) return cached;
    const pending = loadServerModule(route);
    modules.set(route.id, pending);
    pending.catch(() => modules.delete(route.id));
    return pending;
  };
  // Before pages and the app's own routes too: they read what eager plugins set up as much as plugins do.
  // Nothing answers at runtime while prerendering, so nothing starts.
  const startEager = () => Promise.all(eager.map(moduleFor));

  const contextFor = async (event: ServerHandleEvent, id: string): Promise<ServerContext> => {
    const waitUntilHost = platformWaitUntil(event.platform) ?? runtime.workers;
    return {
      env: runtime.dev
        ? await devEnv(runtime.privateEnv)
        : platformEnv(event.platform) ?? runtime.workers?.env ?? runtime.privateEnv,
      clientAddress: clientAddress(event),
      vault: registry.vault,
      base: `${root}${id}`,
      waitUntil: waitUntilHost
        ? (promise) => waitUntilHost.waitUntil(promise)
        : (promise) => {
            promise.catch((error: unknown) => console.error(`[svartz:server] plugin "${id}" background task failed`, error));
          },
    };
  };

  /** The page's path below `/-/`, decoded and ending in a slash, and the plugin that claims it. */
  const pageAt = (pathname: string): { path: string; route: ServerRoute } | undefined => {
    const slashed = pathname.endsWith("/") ? pathname : `${pathname}/`;
    if (!slashed.startsWith(pagesRoot)) return undefined;
    const path = decodeRoutePath(slashed.slice(pagesRoot.length));
    if (path === undefined) return undefined;
    const route = pageOwners.get(path.split("/", 1)[0]!);
    return route && { path, route };
  };

  const page = async (event: ServerHandleEvent): Promise<PageResult | undefined> => {
    if (runtime.building) return undefined;
    await startEager();
    const owned = pageAt(event.url.pathname);
    if (!owned) return undefined;
    const { route, path } = owned;
    const module = await moduleFor(route);
    if (!module.page) {
      throw new Error(`[svartz:server] plugin "${route.id}" claims pages, but its server factory returns no page renderer`);
    }
    // The page's own URL: a client-side navigation's request names its `__data.json` instead.
    const request = new Request(event.url, { headers: event.request.headers });
    return module.page(request, { ...await contextFor(event, route.id), path });
  };

  const handle: SvartzServer["handle"] = async ({ event, resolve }) => {
    if (!runtime.building) await startEager();
    // Read nothing but the pathname before the prefix check: SvelteKit forbids `url.search` while prerendering.
    const { pathname } = event.url;
    if (!runtime.building && pageAt(pathname)) {
      // Pages show who is signed in, so no shared cache may keep one.
      const response = await resolve(event);
      const uncached = new Response(response.body, response);
      uncached.headers.set("cache-control", "private, no-store");
      return uncached;
    }
    const markdownHref = markdownCopyFor(registry.markdown, pathname);
    if (!runtime.building && markdownHref && ["GET", "HEAD"].includes(event.request.method)) {
      // Redirect instead of serving the copy here: without `site.url` its links are relative to the `.md` URL.
      if (wantsMarkdown(event.request)) {
        const location = new URL(markdownHref, event.url).pathname;
        return varyRepresentation(new Response(null, { status: 303, headers: { location } }));
      }
      return varyRepresentation(await resolve(event));
    }
    if (!pathname.startsWith(root)) return resolve(event);
    // Plugins answer only at runtime. A crawled plugin link gets a 404 the shell's prerender config lets through;
    // a redirect here would be written out as a static page that shadows the live route.
    if (runtime.building) return notFound(pathname);
    // Svartz URLs end in a slash, and handlers always see one. SvelteKit redirects to it in dev but not for routes a
    // production build prerendered away, so the router does. When a route matched, SvelteKit already applied that
    // route's `trailingSlash` (a host app's default is 'never'); redirecting back would loop, so re-address instead.
    let { request } = event;
    if (!pathname.endsWith("/")) {
      if (!event.route?.id) {
        return new Response(null, { status: 308, headers: { location: `${pathname}/${event.url.search}` } });
      }
      const url = new URL(request.url);
      url.pathname = `${url.pathname}/`;
      request = new Request(url, request);
    }

    const id = pathname.slice(root.length).split("/", 1)[0]!;
    const route = routes.get(id);
    if (!route) return notFound(pathname);

    const { handle: handler } = await moduleFor(route);
    const response = await handler?.(request, await contextFor(event, id));
    return response ?? notFound(pathname);
  };

  return { handle, page };
}

/** The SvelteKit `handle` of {@link createServer}, for apps that render no plugin pages. */
export function createServerHandle(registry: ServerRegistry, runtime: ServerHandleRuntime): SvartzServer["handle"] {
  return createServer(registry, runtime).handle;
}

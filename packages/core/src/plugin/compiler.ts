import type { Pluggable } from "unified";
import type { PluginContext } from "./types";

/** Browser import contributed by an active content plugin.
 * Script modules export `mount(pathname)` and return an optional disposer.
 */
export interface BrowserResource {
  readonly id: string;
  readonly kind: "css" | "script" | "asset";
  readonly importId: string;
  /** JSON-serializable settings passed to a script module's mount function. */
  readonly options?: unknown;
}

/** Compiler steps and browser imports collected afresh for each pipeline run. */
export interface CompilerContributions {
  remarkPlugins: Pluggable[];
  rehypePlugins: Pluggable[];
  /** Late source transforms for mdsvex's separate, older SVX parser. */
  svxSourceTransforms: Array<(source: string) => string>;
  browserResources: Map<string, BrowserResource>;
  /**
   * JSON a plugin's hooks hand its own server module for this build, keyed by plugin id. The module's factory
   * receives it as its second argument. It ships in the server bundle only, never to the browser.
   */
  serverData: Map<string, unknown>;
}

export function getCompilerContributions(ctx: PluginContext): CompilerContributions {
  return ctx.compiler ??= {
    remarkPlugins: [],
    rehypePlugins: [],
    svxSourceTransforms: [],
    browserResources: new Map(),
    serverData: new Map(),
  };
}

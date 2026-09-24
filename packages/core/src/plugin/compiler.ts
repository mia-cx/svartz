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
  browserResources: Map<string, BrowserResource>;
}

export function getCompilerContributions(ctx: PluginContext): CompilerContributions {
  return ctx.compiler ??= {
    remarkPlugins: [],
    rehypePlugins: [],
    browserResources: new Map(),
  };
}

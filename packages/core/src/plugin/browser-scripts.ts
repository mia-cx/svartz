/** Where the site is served, for scripts that build URLs, such as a server plugin's `<base>/_svartz/<id>/`. */
export interface BrowserScriptContext {
  /** SvelteKit's deployment base path (`paths.base`), without a trailing slash; `""` at the domain root. */
  readonly base: string;
  /**
   * The note body this mount is for, when a host page renders the note with `SvartzNoteContent`: it carries
   * `data-svartz-note` when the note is public. A host page can show several, each mounting the scripts with its own.
   * Absent on theme pages, where the document holds one page; look up `[data-svartz-note]` there.
   */
  readonly note?: HTMLElement;
  /**
   * Show inert HTML in `target` as this page shows a note body: through the theme's content components (the host's
   * overrides first), sanitized as the build sanitizes. The renderer loads on first use. Absent when the page renders
   * no vault content.
   */
  readonly mountContent?: (target: HTMLElement) => Promise<ContentView>;
}

/** HTML shown through a page's content components, from {@link BrowserScriptContext.mountContent}. */
export interface ContentView {
  /** Show `html` in place of what shows. */
  render(html: string): void;
  destroy(): void;
}

/** Lifecycle contract for a script contributed by a content plugin. */
export interface BrowserScriptModule {
  mount(
    pathname: string,
    options?: unknown,
    context?: BrowserScriptContext,
  ): void | (() => void) | Promise<void | (() => void)>;
}

export interface BrowserScriptLoader {
  readonly id: string;
  readonly load: () => Promise<unknown>;
  readonly options?: unknown;
}

/** Mount active scripts and return one disposer for the current route. */
export async function mountBrowserScripts(
  scripts: readonly BrowserScriptLoader[],
  pathname: string,
  context: BrowserScriptContext = { base: "" },
): Promise<() => void> {
  const disposers: Array<() => void> = [];
  const disposeAll = (): unknown[] => {
    const errors: unknown[] = [];
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  };

  try {
    for (const { id, load, options } of scripts) {
      const module = await load() as Partial<BrowserScriptModule>;
      if (!module || typeof module.mount !== "function") {
        throw new Error(`[svartz:plugin] browser script "${id}" must export mount(pathname)`);
      }
      const dispose = await module.mount(pathname, options, context);
      if (typeof dispose === "function") disposers.push(dispose);
    }
  } catch (error) {
    const cleanupErrors = disposeAll();
    if (cleanupErrors.length) {
      throw new AggregateError([error, ...cleanupErrors], "Browser script mount and cleanup failed");
    }
    throw error;
  }

  return () => {
    const errors = disposeAll();
    if (errors.length) throw new AggregateError(errors, "Browser script cleanup failed");
  };
}

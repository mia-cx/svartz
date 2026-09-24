/** Lifecycle contract for a script contributed by a content plugin. */
export interface BrowserScriptModule {
  mount(pathname: string): void | (() => void) | Promise<void | (() => void)>;
}

export interface BrowserScriptLoader {
  readonly id: string;
  readonly load: () => Promise<unknown>;
}

/** Mount active scripts and return one disposer for the current route. */
export async function mountBrowserScripts(
  scripts: readonly BrowserScriptLoader[],
  pathname: string,
): Promise<() => void> {
  const disposers: Array<() => void> = [];
  const disposeAll = () => {
    for (const dispose of disposers.reverse()) dispose();
    disposers.length = 0;
  };

  try {
    for (const { id, load } of scripts) {
      const module = await load() as Partial<BrowserScriptModule>;
      if (!module || typeof module.mount !== "function") {
        throw new Error(`[svartz:plugin] browser script "${id}" must export mount(pathname)`);
      }
      const dispose = await module.mount(pathname);
      if (typeof dispose === "function") disposers.push(dispose);
    }
  } catch (error) {
    disposeAll();
    throw error;
  }

  return disposeAll;
}

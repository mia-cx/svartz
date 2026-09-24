/** Lifecycle contract for a script contributed by a content plugin. */
export interface BrowserScriptModule {
  mount(pathname: string, options?: unknown): void | (() => void) | Promise<void | (() => void)>;
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
      const dispose = await module.mount(pathname, options);
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

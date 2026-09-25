/** Render authored Mermaid fences after hydration and on client navigation. */
let mermaidModule: Promise<typeof import("mermaid")> | undefined;

async function loadMermaid() {
  const module = await (mermaidModule ??= import("mermaid"));
  module.default.initialize({ startOnLoad: false, securityLevel: "strict" });
  return module.default;
}

export function mount(): () => void {
  let disposed = false;
  let running = false;
  let queued = false;

  const render = async () => {
    if (disposed) return;
    if (running) { queued = true; return; }
    const nodes = [...document.querySelectorAll<HTMLElement>("pre.svartz-mermaid:not([data-svartz-mermaid])")];
    if (nodes.length === 0) return;
    running = true;
    for (const node of nodes) node.dataset.svartzMermaid = "pending";
    try {
      const mermaid = await loadMermaid();
      if (!disposed) await mermaid.run({ nodes: nodes.filter((node) => node.isConnected), suppressErrors: true });
      for (const node of nodes) node.dataset.svartzMermaid = "ready";
    } catch (error) {
      for (const node of nodes) node.dataset.svartzMermaid = "error";
      console.error("[svartz:mermaid] diagram rendering failed", error);
    } finally {
      running = false;
      if (queued) { queued = false; void render(); }
    }
  };

  const observer = new MutationObserver(() => { void render(); });
  observer.observe(document.body, { childList: true, subtree: true });
  void render();
  return () => { disposed = true; observer.disconnect(); };
}

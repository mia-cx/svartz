/**
 * The Split mode's preview: the page as the site renders it, through the page's own content components, updating as
 * the reader writes. Loaded the first time Split opens.
 *
 * The Markdown pipeline runs in a worker, so keystrokes never wait on it, and only after a pause in typing. One render
 * runs at a time; when the reader wrote more meanwhile, its result is dropped and the newest source renders next.
 */
import type { ContentView } from "@svartz/core";
import type { LinksResponse } from "./api";
import type { PreviewReply, PreviewRequest } from "./preview-worker";
import { loadLinks } from "./wikilinks";

/** What the preview shows: the Markdown, and the note it is, as a published page or a new note's vault path. */
export interface PreviewSource {
  readonly markdown: string;
  readonly note: { readonly page: string } | { readonly path: string };
}

export interface Preview {
  /** Show `source` once the reader pauses. */
  update(source: PreviewSource): void;
  destroy(): void;
}

/** Wait this long after the last keystroke before rendering. */
export const PREVIEW_DELAY_MS = 150;

/** Without the site's notes, nothing resolves; links show unresolved rather than the preview failing. */
const NO_LINKS: LinksResponse = { notes: [], linkResolution: "shallowest", mountPath: "", tagsRoute: "tags", attachments: [] };

/**
 * Render previews into `pane` with `mountContent`. `base` is the deployment base links start with; `endpoint` serves
 * the site's notes.
 */
export async function createPreview(
  pane: HTMLElement,
  { endpoint, base, mountContent }: { endpoint: string; base: string; mountContent: (target: HTMLElement) => Promise<ContentView> },
): Promise<Preview> {
  const [view, links = NO_LINKS] = await Promise.all([mountContent(pane), loadLinks(endpoint)]);
  // `.js`, as tsup emits it beside this module in dist; Vite bundles it as a worker.
  const worker = new Worker(new URL("./preview-worker.js", import.meta.url), { type: "module", name: "svartz-submissions-preview" });
  let latest: PreviewSource | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  /** Whether the source changed since the render in flight started. */
  let stale = false;

  function render() {
    if (!latest) return;
    if (busy) {
      stale = true;
      return;
    }
    busy = true;
    stale = false;
    const { markdown, note } = latest;
    const path = "path" in note ? note.path : links.notes.find(({ href }) => href === note.page)?.path ?? "index.md";
    worker.postMessage({ markdown, options: { ...links, path, base } } satisfies PreviewRequest);
  }

  worker.addEventListener("message", ({ data }: MessageEvent<PreviewReply>) => {
    busy = false;
    if (stale) return render();
    if ("error" in data) console.error("[submissions] couldn't render the preview", data.error);
    else view.render(data.html);
  });

  // Links open beside the editor, and a heading's anchor scrolls the preview, so following one never leaves the page.
  function follow(event: MouseEvent) {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href")!;
    if (href.startsWith("#")) pane.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView();
    else window.open(link.href, "_blank", "noopener");
  }
  pane.addEventListener("click", follow);

  return {
    update(source) {
      const first = latest === undefined;
      latest = source;
      clearTimeout(timer);
      // The first render shows at once; later ones wait for the reader to pause.
      if (first) render();
      else timer = setTimeout(render, PREVIEW_DELAY_MS);
    },
    destroy() {
      clearTimeout(timer);
      worker.terminate();
      pane.removeEventListener("click", follow);
      view.destroy();
    },
  };
}

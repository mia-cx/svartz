/**
 * The Split preview's Markdown pipeline, off the main thread: a long page takes a few hundred milliseconds to render,
 * and keystrokes mustn't wait on it. Answers each {@link PreviewRequest} with the page's HTML.
 */
import { renderPreview, type PreviewOptions } from "@svartz/plugins/preview";

export interface PreviewRequest {
  readonly markdown: string;
  readonly options: PreviewOptions;
}

export type PreviewReply = { readonly html: string } | { readonly error: string };

// The package's types include the DOM's, whose `self` is a window; a dedicated worker's posts without a target origin.
const worker = self as unknown as { postMessage(reply: PreviewReply): void };

self.addEventListener("message", async ({ data }: MessageEvent<PreviewRequest>) => {
  try {
    worker.postMessage({ html: await renderPreview(data.markdown, data.options) });
  } catch (cause) {
    worker.postMessage({ error: cause instanceof Error ? cause.message : String(cause) });
  }
});

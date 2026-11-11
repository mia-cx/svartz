/**
 * Readers' comments beside their passages. `attach(element, { endpoint, page })` loads the page's annotations,
 * highlights each passage with the CSS Custom Highlight API, so `element`'s DOM is never rewritten, and puts a marker
 * in the margin on the passage's first line. Each marker opens a card with the comment and its author.
 *
 * Style it with `@svartz/plugin-annotations/browser.css` and the custom properties it documents.
 */
import type { Identity } from "@svartz/auth";
import { locate, rangeOf } from "./anchor";
import type { Annotation } from "./store";

export interface AttachOptions {
  /** The annotations routes' base path, such as `/notes/_svartz/annotations`. */
  readonly endpoint: string;
  /** The note's path in its vault, the key its annotations are stored under. */
  readonly page: string;
}

/** Highlight names, for `::highlight(…)` in a host's own CSS. */
export const HIGHLIGHT = "svartz-annotations";
export const ACTIVE_HIGHLIGHT = "svartz-annotations-active";

type Comment = Extract<Annotation, { kind: "comment" }>;

const SVG_NS = "http://www.w3.org/2000/svg";
// Lucide's message-square.
const COMMENT_ICON = "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z";
/** The quote a marker's label repeats, so a screen reader can tell markers apart. */
const LABEL_QUOTE_LENGTH = 48;
/** Viewport space a card keeps clear of on each side. */
const VIEWPORT_GUTTER = 16;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?'")\]}]+$/;

let attached = 0;

function create<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

function commentIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2",
    "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true",
  })) svg.setAttribute(name, value);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", COMMENT_ICON);
  svg.append(path);
  return svg;
}

/** Comment text as text, with each http(s) URL made a link. Nothing in it is ever parsed as HTML. */
function linkify(text: string): (Node | string)[] {
  const parts: (Node | string)[] = [];
  let from = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    // "See https://example.com." means the URL without its full stop.
    const href = match[0].replace(TRAILING_PUNCTUATION, "");
    parts.push(text.slice(from, match.index));
    const link = create("a", "", href);
    link.href = href;
    link.rel = "ugc nofollow noopener";
    parts.push(link);
    from = match.index + href.length;
  }
  parts.push(text.slice(from));
  return parts;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words.at(-1)!] : words;
  return letters.map((word) => [...word][0]!.toLocaleUpperCase()).join("");
}

function avatar({ name, avatarUrl }: Identity): HTMLElement {
  if (avatarUrl) {
    const image = create("img", "sv-annotations-avatar");
    image.src = avatarUrl;
    // The name sits beside it.
    image.alt = "";
    image.width = image.height = 32;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    return image;
  }
  const fallback = create("span", "sv-annotations-avatar", initials(name));
  fallback.setAttribute("aria-hidden", "true");
  return fallback;
}

function author(identity: Identity): HTMLElement {
  const name = identity.profileUrl ? create("a", "sv-annotations-name", identity.name) : create("span", "sv-annotations-name", identity.name);
  if (name instanceof HTMLAnchorElement) {
    name.href = identity.profileUrl!;
    name.rel = "ugc nofollow noopener";
  }
  const who = create("span", "sv-annotations-who", name);
  if (identity.handle) who.append(create("span", "sv-annotations-handle", `@${identity.handle}`));
  return who;
}

function card(comment: Comment, id: string): HTMLElement {
  const time = create("time", "sv-annotations-time", new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(comment.createdAt)));
  time.dateTime = comment.createdAt;
  const body = create("p", "sv-annotations-body", ...linkify(comment.body));
  const node = create("div", "sv-annotations-card",
    create("div", "sv-annotations-byline", avatar(comment.author), author(comment.author), time), body);
  node.id = id;
  node.popover = "auto";
  // Cards render in the top layer, outside the hidden layer, so each hides itself.
  node.setAttribute("data-print-hide", "");
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-label", `Comment by ${comment.author.name}`);
  return node;
}

function quote(text: string): string {
  const words = text.trim().replace(/\s+/g, " ");
  return words.length > LABEL_QUOTE_LENGTH ? `${words.slice(0, LABEL_QUOTE_LENGTH).trimEnd()}…` : words;
}

function marker(comment: Comment, cardId: string): HTMLButtonElement {
  const button = create("button", "sv-annotations-marker", commentIcon());
  button.type = "button";
  button.setAttribute("aria-label", `Comment by ${comment.author.name} on “${quote(comment.anchor.exact)}”`);
  button.setAttribute("popovertarget", cardId);
  return button;
}

/** The highlight registered under `name`, shared by every attached element on the page. */
function highlightNamed(name: string): Highlight | undefined {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return undefined;
  const existing = CSS.highlights.get(name);
  if (existing) return existing;
  const created = new Highlight();
  CSS.highlights.set(name, created);
  return created;
}

/** The first rect of `range` that has width: a range starting at a line end also covers that empty stretch. */
function firstLine(range: Range): DOMRect | undefined {
  const rects = [...range.getClientRects()];
  return rects.find(({ width }) => width > 0) ?? rects[0];
}

/** Put an open card beside its marker in the margin, or under the marker's line when the margin is too narrow. */
function place(cardNode: HTMLElement, markerNode: HTMLElement): void {
  const anchor = markerNode.getBoundingClientRect();
  const viewport = document.documentElement.clientWidth;
  const width = cardNode.offsetWidth;
  const gap = anchor.width / 4;
  const beside = anchor.right + gap + width <= viewport - VIEWPORT_GUTTER;
  // Too narrow: hang it from the marker over the text, its right edge under the marker's.
  const left = beside ? anchor.right + gap : Math.max(VIEWPORT_GUTTER, Math.min(anchor.right - width, viewport - VIEWPORT_GUTTER - width));
  const top = beside ? anchor.top : anchor.bottom + gap;
  // Cards live in the top layer, positioned against the document, so they scroll with the passage.
  cardNode.style.left = `${left + scrollX}px`;
  cardNode.style.top = `${top + scrollY}px`;
}

/**
 * Show the annotations stored for `page` beside `content`, the note's body element. Returns `detach`, which removes every
 * marker, card and highlight it added. Passages no longer in the note are left out.
 */
export function attach(content: HTMLElement, { endpoint, page }: AttachOptions): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const prefix = `sv-annotations-${++attached}`;
  const highlight = highlightNamed(HIGHLIGHT);
  const placed: Array<{ range: Range; marker: HTMLButtonElement; card: HTMLElement }> = [];

  // Beside the content rather than in it, so its DOM and text stay the author's. Out of flow, so it never shifts the
  // layout; markers follow the content in tab order.
  const layer = create("div", "sv-annotations");
  layer.setAttribute("data-print-hide", "");
  content.after(layer);

  let frame = 0;
  const layout = () => {
    frame = 0;
    const origin = layer.getBoundingClientRect();
    const bounds = content.getBoundingClientRect();
    // Markers on the same line sit side by side, so each line's row is placed as one.
    const rows = new Map<number, Array<{ marker: HTMLButtonElement; card: HTMLElement }>>();
    for (const { range, marker: markerNode, card: cardNode } of placed) {
      const line = firstLine(range);
      if (!line) continue;
      const top = Math.round(line.top + (line.height - markerNode.offsetWidth) / 2 - origin.top);
      rows.set(top, [...rows.get(top) ?? [], { marker: markerNode, card: cardNode }]);
    }
    for (const [top, row] of rows) {
      const size = row[0]!.marker.offsetWidth;
      const step = size + size / 8;
      // When the margin is narrower than the row, the whole row moves left to stay on screen, rather than each
      // marker clamping to the same edge and covering the ones before it.
      const end = document.documentElement.clientWidth - size - 2 - (row.length - 1) * step;
      const start = Math.min(bounds.right + size / 2, end);
      for (const [index, { marker: markerNode, card: cardNode }] of row.entries()) {
        markerNode.style.translate = `${start + index * step - origin.left}px ${top}px`;
        if (cardNode.matches(":popover-open")) place(cardNode, markerNode);
      }
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(layout);
  };
  const resizes = new ResizeObserver(schedule);
  resizes.observe(content);
  resizes.observe(document.documentElement);
  addEventListener("resize", schedule, { signal });
  void document.fonts?.ready.then(() => signal.aborted || schedule());

  const show = (comments: readonly Comment[]) => {
    const text = content.textContent ?? "";
    const located = comments
      .map((comment) => ({ comment, position: locate(text, comment.anchor) }))
      .filter((entry): entry is { comment: Comment; position: NonNullable<typeof entry.position> } => entry.position !== null)
      // Reading order, which is also tab order.
      .sort((a, b) => a.position.start - b.position.start);
    for (const [index, { comment, position }] of located.entries()) {
      const range = rangeOf(content, position);
      const cardId = `${prefix}-${index}`;
      const markerNode = marker(comment, cardId);
      const cardNode = card(comment, cardId);
      cardNode.addEventListener("toggle", (event) => {
        if ((event as ToggleEvent).newState === "open") {
          place(cardNode, markerNode);
          if (highlight) CSS.highlights.set(ACTIVE_HIGHLIGHT, new Highlight(range));
        } else if (CSS.highlights?.get(ACTIVE_HIGHLIGHT)?.has(range)) {
          CSS.highlights.delete(ACTIVE_HIGHLIGHT);
        }
      }, { signal });
      highlight?.add(range);
      layer.append(markerNode, cardNode);
      placed.push({ range, marker: markerNode, card: cardNode });
    }
    layout();
  };

  const url = `${endpoint.replace(/\/+$/, "")}/?page=${encodeURIComponent(page)}`;
  fetch(url, { signal, headers: { accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      const { annotations } = await response.json() as { annotations: Annotation[] };
      if (!signal.aborted) show(annotations.filter((annotation): annotation is Comment => annotation.kind === "comment"));
    })
    .catch((error: unknown) => {
      if (!signal.aborted) console.error("[svartz:annotations] couldn't load this page's comments", error);
    });

  return () => {
    controller.abort();
    resizes.disconnect();
    if (frame) cancelAnimationFrame(frame);
    for (const { range } of placed) {
      highlight?.delete(range);
      if (CSS.highlights?.get(ACTIVE_HIGHLIGHT)?.has(range)) CSS.highlights.delete(ACTIVE_HIGHLIGHT);
    }
    if (highlight?.size === 0) CSS.highlights.delete(HIGHLIGHT);
    layer.remove();
  };
}

/**
 * Readers' comments beside their passages. `attach(element, { endpoint, page })` loads the page's annotations,
 * highlights each passage with the CSS Custom Highlight API, so `element`'s DOM is never rewritten, and puts a marker
 * in the margin on the passage's first line. Each marker opens a card with the comment, its author, and **+1**, which
 * toggles the reader's agreement and shows who agrees.
 *
 * Selecting text inside `element` shows a toolbar beside it; **Comment** opens a composer that posts to the plugin's
 * route. A signed-out reader gets `@svartz/auth`'s sign-in dialog, and the draft or +1 waits in `sessionStorage` until
 * they come back.
 *
 * Style it with `@svartz/plugin-annotations/browser.css` and the custom properties it documents.
 */
import type { Identity } from "@svartz/auth";
import { openSignIn } from "@svartz/auth/browser";
import { describe, locate, rangeOf, type Anchor, type Position } from "./anchor";
import { COMMENT_MAX_LENGTH } from "./limits";
import type { Agreement, Annotation } from "./store";

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
/** Space between a selection or passage and the toolbar or composer beside it. */
const GAP = 8;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?'")\]}]+$/;
const POST_FAILED = "Couldn't post your comment. Try again.";
const AGREE_FAILED = "Couldn't save your +1. Try again.";

/**
 * What a signed-out reader was doing, kept in `sessionStorage` while they sign in so it resumes when they return:
 * a comment's composer reopens on the same passage with the draft as it was, and a **+1** is applied.
 */
type Draft = { readonly endpoint: string; readonly page: string } & (
  | { readonly action: "comment"; readonly anchor: Anchor; readonly body: string }
  | { readonly action: "agree"; readonly annotation: string }
);

const DRAFT_KEY = "svartz-annotations:draft";

/** The draft saved for this page, removed from storage as it's taken. */
function takeDraft(endpoint: string, page: string): Draft | undefined {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
    if (draft?.endpoint !== endpoint || draft.page !== page) return undefined;
    if (draft.action === "comment" ? typeof draft.body !== "string" : draft.action !== "agree" || typeof draft.annotation !== "string") return undefined;
    sessionStorage.removeItem(DRAFT_KEY);
    return draft;
  } catch {
    // Storage is blocked or holds something else under the key: there is no draft to resume.
    return undefined;
  }
}

/** Save `draft`, or forget the saved one. */
function storeDraft(draft: Draft | undefined): void {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage is blocked: the draft still sits in the open composer, it just won't survive leaving the page.
  }
}

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

/** Names shown before the rest of the agreements become "N others". */
const AGREEMENT_NAMES = 3;
const NAMES = new Intl.ListFormat("en", { type: "conjunction" });

/** Who agrees, the reader first as "You": "You, Grace Hopper, and 2 others agree". Empty when nobody does. */
function agreedBy(people: readonly Identity[], viewer: string | undefined): string {
  if (!people.length) return "";
  const names = people.map(({ id, name }) => id === viewer ? "You" : name);
  const shown = names.length > AGREEMENT_NAMES ? [...names.slice(0, AGREEMENT_NAMES - 1), `${names.length - AGREEMENT_NAMES + 1} others`] : names;
  return `${NAMES.format(shown)} ${names.length === 1 && names[0] !== "You" ? "agrees" : "agree"}`;
}

function card(comment: Comment, id: string, ...footer: HTMLElement[]): HTMLElement {
  const time = create("time", "sv-annotations-time", new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(comment.createdAt)));
  time.dateTime = comment.createdAt;
  const body = create("p", "sv-annotations-body", ...linkify(comment.body));
  const node = create("div", "sv-annotations-card",
    create("div", "sv-annotations-byline", avatar(comment.author), author(comment.author), time), body, ...footer);
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

/** Mark `range` as the passage being read or answered. */
function activate(range: Range): void {
  if (typeof CSS !== "undefined" && "highlights" in CSS) CSS.highlights.set(ACTIVE_HIGHLIGHT, new Highlight(range));
}

/** Unmark `range`, unless another passage has become the active one since. */
function deactivate(range: Range): void {
  if (CSS.highlights?.get(ACTIVE_HIGHLIGHT)?.has(range)) CSS.highlights.delete(ACTIVE_HIGHLIGHT);
}

/** The first rect of `range` that has width: a range starting at a line end also covers that empty stretch. */
function firstLine(range: Range): DOMRect | undefined {
  const rects = [...range.getClientRects()];
  return rects.find(({ width }) => width > 0) ?? rects[0];
}

/** The last rect of `range` that has width: a range ending at a line start also covers that empty stretch. */
function lastLine(range: Range): DOMRect | undefined {
  const rects = [...range.getClientRects()].reverse();
  return rects.find(({ width }) => width > 0) ?? rects[0];
}

/** Put `node` at viewport point (`left`, `top`). Popovers live in the top layer, placed against the document, so they scroll with the page. */
function moveTo(node: HTMLElement, left: number, top: number): void {
  node.style.left = `${left + scrollX}px`;
  node.style.top = `${top + scrollY}px`;
}

/**
 * Put an open card or composer beside `anchor` in the margin, or under it when the margin is too narrow. `anchor` is
 * a marker's box, or the margin edge along a passage.
 */
function place(node: HTMLElement, anchor: DOMRect, gap = anchor.width / 4): void {
  const viewport = document.documentElement.clientWidth;
  const width = node.offsetWidth;
  const beside = anchor.right + gap + width <= viewport - VIEWPORT_GUTTER;
  // Too narrow: hang it from the anchor over the text, its right edge under the anchor's.
  const left = beside ? anchor.right + gap : Math.max(VIEWPORT_GUTTER, Math.min(anchor.right - width, viewport - VIEWPORT_GUTTER - width));
  moveTo(node, left, beside ? anchor.top : anchor.bottom + gap);
}

function popover<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string, label: string, ...children: (Node | string)[]) {
  const node = create(tag, className, ...children);
  // Manual: neither closes when a card opens or the sign-in dialog takes over, and a stray click can't lose a draft.
  node.popover = "manual";
  // Popovers render in the top layer, outside the hidden layer, so each hides itself.
  node.setAttribute("data-print-hide", "");
  node.setAttribute("aria-label", label);
  return node;
}

/**
 * Show the annotations stored for `page` beside `content`, the note's body element. Returns `detach`, which removes every
 * marker, card and highlight it added. Passages no longer in the note are left out.
 */
export function attach(content: HTMLElement, { endpoint, page }: AttachOptions): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const base = endpoint.replace(/\/+$/, "");
  const prefix = `sv-annotations-${++attached}`;
  let cards = 0;
  /** The signed-in reader's identity id, once the site has named them. */
  let viewer: string | undefined;
  /** A shown comment: its passage, marker and card, and its **+1** as the site last confirmed it. */
  interface Placed {
    readonly id: string;
    readonly start: number;
    readonly range: Range;
    readonly marker: HTMLButtonElement;
    readonly card: HTMLElement;
    readonly toggle: HTMLButtonElement;
    readonly count: HTMLElement;
    readonly faces: HTMLElement;
    readonly names: HTMLElement;
    readonly problem: HTMLElement;
    agreements: readonly Agreement[];
    agreed: boolean;
    /** While a +1 is being saved, its toggle is locked, so a late answer can't overwrite a newer one. */
    pending: boolean;
  }
  /** In reading order, which is also tab order. */
  const placed: Placed[] = [];

  // Beside the content rather than in it, so its DOM and text stay the author's. Out of flow, so it never shifts the
  // layout; markers follow the content in tab order.
  const layer = create("div", "sv-annotations");
  layer.setAttribute("data-print-hide", "");

  const commentAction = create("button", "sv-annotations-action", commentIcon(), "Comment");
  commentAction.type = "button";
  const toolbar = popover("div", "sv-annotations-toolbar", "Selected text", commentAction);
  toolbar.setAttribute("role", "toolbar");

  const input = create("textarea", "sv-annotations-input");
  input.rows = 4;
  input.maxLength = COMMENT_MAX_LENGTH;
  input.placeholder = "Write a comment…";
  input.setAttribute("aria-label", "Comment");
  // Why the last post failed, read out as it appears.
  const problem = create("p", "sv-annotations-problem");
  problem.id = `${prefix}-problem`;
  problem.setAttribute("role", "alert");
  input.setAttribute("aria-describedby", problem.id);
  const cancel = create("button", "sv-annotations-button", "Cancel");
  cancel.type = "button";
  const submit = create("button", "sv-annotations-button sv-annotations-primary", "Post comment");
  submit.type = "submit";
  const composer = popover("form", "sv-annotations-composer", "Comment", input, problem, create("div", "sv-annotations-actions", cancel, submit));
  composer.setAttribute("role", "dialog");

  layer.append(toolbar, composer);
  content.after(layer);

  /** The reader's selection the toolbar answers, copied so it outlives the selection itself. */
  let selected: Range | undefined;
  /** The passage the open composer answers. */
  let composing: { anchor: Anchor; position: Position; range: Range } | undefined;

  const placeToolbar = () => {
    const first = selected && firstLine(selected);
    const last = selected && lastLine(selected);
    if (!first || !last) return;
    const viewport = document.documentElement.clientWidth;
    // Above the selection's first line, clear of the reader's pointer; below its last when the viewport cuts it off.
    const above = first.top - toolbar.offsetHeight - GAP;
    const left = Math.max(VIEWPORT_GUTTER, Math.min(first.left, viewport - VIEWPORT_GUTTER - toolbar.offsetWidth));
    moveTo(toolbar, left, above >= GAP ? above : last.bottom + GAP);
  };

  const placeComposer = () => {
    const first = composing && firstLine(composing.range);
    const last = composing && lastLine(composing.range);
    if (!first || !last) return;
    // In the margin where the passage's marker will be, or under the passage when there's no room.
    const edge = content.getBoundingClientRect().right;
    place(composer, new DOMRect(edge, first.top, 0, last.bottom - first.top), GAP);
  };

  const hideToolbar = () => {
    selected = undefined;
    if (toolbar.matches(":popover-open")) toolbar.hidePopover();
  };

  let pointing = false;
  /** While a comment posts, its draft is fixed: nothing may change, cancel or replace it until the site answers. */
  let posting = false;
  /** Whether the next Tab brings focus to the toolbar: once per showing, so later Tabs move through the page. */
  let tabToToolbar = false;
  /** Offer the toolbar for a finished selection inside the content; a selection anywhere else, or none, takes it away. */
  const offerToolbar = () => {
    const selection = getSelection();
    const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : undefined;
    if (pointing || posting || !range || !content.contains(range.commonAncestorContainer) || !range.toString().trim()) return hideToolbar();
    selected = range.cloneRange();
    if (!toolbar.matches(":popover-open")) {
      toolbar.showPopover();
      tabToToolbar = true;
    }
    placeToolbar();
  };
  document.addEventListener("selectionchange", offerToolbar, { signal });
  // Wait for a drag to end, so the toolbar doesn't chase the pointer.
  document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Node && toolbar.contains(event.target)) return;
    pointing = true;
    hideToolbar();
  }, { signal });
  document.addEventListener("pointerup", () => {
    if (!pointing) return;
    pointing = false;
    offerToolbar();
  }, { signal });
  // Pressing the toolbar must neither clear the selection nor move focus, so copying still works until an action runs.
  toolbar.addEventListener("pointerdown", (event) => event.preventDefault(), { signal });

  // The toolbar can't sit inside the note, so Tab after selecting goes straight to it, and Escape goes back.
  let returnFocus: Element | null = null;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || event.shiftKey || !selected || !tabToToolbar) return;
    event.preventDefault();
    tabToToolbar = false;
    returnFocus = document.activeElement;
    commentAction.focus();
  }, { signal });
  toolbar.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    hideToolbar();
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
  }, { signal });

  /** Open the composer on `anchor`'s passage with `body` in it. */
  const compose = (anchor: Anchor, body: string) => {
    const position = locate(content.textContent ?? "", anchor);
    if (!position) return;
    if (composing) deactivate(composing.range);
    const range = rangeOf(content, position);
    // Described afresh, so a draft whose passage moved posts where it is now.
    composing = { anchor: describe(content, range), position, range };
    // The selection goes when the composer takes focus; the passage stays marked.
    activate(range);
    hideToolbar();
    composer.setAttribute("aria-label", `Comment on “${quote(anchor.exact)}”`);
    input.value = body;
    problem.textContent = "";
    if (!composer.matches(":popover-open")) composer.showPopover();
    placeComposer();
    input.focus();
  };

  const closeComposer = () => {
    if (composing) deactivate(composing.range);
    composing = undefined;
    input.value = "";
    problem.textContent = "";
    if (composer.matches(":popover-open")) composer.hidePopover();
  };

  commentAction.addEventListener("click", () => {
    if (selected) compose(describe(content, selected), composing ? input.value : "");
  }, { signal });

  // Cancel goes back to the selection the reader started from, toolbar and all.
  const cancelComposer = () => {
    if (posting) return;
    const range = composing?.range;
    closeComposer();
    storeDraft(undefined);
    if (!range) return;
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  };
  cancel.addEventListener("click", cancelComposer, { signal });
  composer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancelComposer();
    else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) composer.requestSubmit();
  }, { signal });

  const setPosting = (on: boolean) => {
    posting = on;
    // Busy and read-only rather than disabled: disabling the focused Post button or text would drop keyboard focus.
    if (on) composer.setAttribute("aria-busy", "true");
    else composer.removeAttribute("aria-busy");
    input.readOnly = on;
    cancel.disabled = on;
    if (on) hideToolbar();
  };
  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!composing || posting) return;
    const { anchor, position } = composing;
    const body = input.value;
    if (!body.trim()) {
      problem.textContent = "Write a comment before posting.";
      input.focus();
      return;
    }
    setPosting(true);
    problem.textContent = "";
    try {
      const response = await fetch(`${base}/`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ kind: "comment", page, anchor, body }),
        signal,
      });
      const answer = await response.json().catch(() => ({})) as { annotation?: Comment; message?: string };
      if (response.status === 401) {
        // Signing in leaves the page; the draft waits here and reopens on return.
        storeDraft({ endpoint: base, page, action: "comment", anchor, body });
        try {
          openSignIn();
        } catch (cause) {
          console.error("[svartz:annotations] couldn't open sign-in", cause);
          problem.textContent = answer.message ?? "Sign in to comment.";
        }
        return;
      }
      if (!response.ok || !answer.annotation) {
        problem.textContent = answer.message ?? POST_FAILED;
        return;
      }
      storeDraft(undefined);
      closeComposer();
      viewer = answer.annotation.author.id;
      const markerNode = add(answer.annotation, position);
      layout();
      markerNode.focus();
    } catch (cause) {
      if (signal.aborted) return;
      console.error("[svartz:annotations] couldn't post a comment", cause);
      problem.textContent = POST_FAILED;
    } finally {
      setPosting(false);
    }
  }, { signal });

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
        if (cardNode.matches(":popover-open")) place(cardNode, markerNode.getBoundingClientRect());
      }
    }
    placeToolbar();
    placeComposer();
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(layout);
  };
  const resizes = new ResizeObserver(schedule);
  resizes.observe(content);
  resizes.observe(document.documentElement);
  addEventListener("resize", schedule, { signal });
  void document.fonts?.ready.then(() => signal.aborted || schedule());

  /**
   * Highlight `comment`'s passage at `position` and give it a marker and card, in reading order. A comment already
   * shown keeps its marker: one posted before the page's list arrives comes back in both answers.
   */
  function add(comment: Comment, position: Position): HTMLButtonElement {
    const shown = placed.find(({ id }) => id === comment.id);
    if (shown) return shown.marker;
    const range = rangeOf(content, position);
    const cardId = `${prefix}-${cards++}`;
    const markerNode = marker(comment, cardId);

    // A native toggle button: Enter and Space work, and aria-pressed tells screen readers whether it's on.
    const count = create("span", "sv-annotations-count");
    const toggle = create("button", "sv-annotations-agree", "+1 ", count);
    toggle.type = "button";
    // Decorative: the names beside them say who they are.
    const faces = create("span", "sv-annotations-faces");
    faces.setAttribute("aria-hidden", "true");
    const names = create("span", "sv-annotations-names");
    const agreedLine = create("p", "sv-annotations-agreed", faces, names);
    agreedLine.id = `${cardId}-agreed`;
    toggle.setAttribute("aria-describedby", agreedLine.id);
    const problem = create("p", "sv-annotations-problem");
    problem.setAttribute("role", "alert");
    const cardNode = card(comment, cardId, create("div", "sv-annotations-agreement", toggle, agreedLine), problem);
    cardNode.addEventListener("toggle", (event) => {
      if ((event as ToggleEvent).newState === "open") {
        place(cardNode, markerNode.getBoundingClientRect());
        activate(range);
      } else {
        deactivate(range);
      }
    }, { signal });
    // Looked up now, not held across a fetch: another element detaching meanwhile may have unregistered the shared one.
    highlightNamed(HIGHLIGHT)?.add(range);
    const entry: Placed = {
      id: comment.id, start: position.start, range, marker: markerNode, card: cardNode,
      toggle, count, faces, names, problem,
      agreements: comment.agreements, agreed: comment.agreements.some(({ author }) => author.id === viewer), pending: false,
    };
    showAgreements(entry);
    toggle.addEventListener("click", () => void agree(entry, !entry.agreed), { signal });
    const next = placed.findIndex(({ start }) => start > position.start);
    if (next === -1) {
      layer.append(markerNode, cardNode);
      placed.push(entry);
    } else {
      placed[next]!.marker.before(markerNode, cardNode);
      placed.splice(next, 0, entry);
    }
    return markerNode;
  }

  /** Show `entry`'s count, who agrees, and whether the reader is one of them. */
  function showAgreements(entry: Placed): void {
    entry.toggle.setAttribute("aria-pressed", String(entry.agreed));
    entry.count.textContent = entry.agreements.length ? String(entry.agreements.length) : "";
    // Oldest first, but the reader before everyone.
    const people = entry.agreements.map(({ author: person }) => person).sort((a, b) => Number(b.id === viewer) - Number(a.id === viewer));
    entry.names.textContent = agreedBy(people, viewer);
    entry.faces.replaceChildren(...people.slice(0, AGREEMENT_NAMES).map(avatar));
  }

  /** Set the reader's **+1** on `entry` to `agreed`. Signed out, it waits through sign-in and is applied on return. */
  async function agree(entry: Placed, agreed: boolean): Promise<void> {
    if (entry.pending) return;
    entry.pending = true;
    entry.toggle.setAttribute("aria-busy", "true");
    entry.problem.textContent = "";
    try {
      const response = await fetch(`${base}/${encodeURIComponent(entry.id)}/agree/`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ agreed }),
        signal,
      });
      const answer = await response.json().catch(() => ({})) as { agreed?: boolean; agreements?: Agreement[]; message?: string };
      if (response.status === 401) {
        storeDraft({ endpoint: base, page, action: "agree", annotation: entry.id });
        try {
          openSignIn();
        } catch (cause) {
          console.error("[svartz:annotations] couldn't open sign-in", cause);
          entry.problem.textContent = answer.message ?? "Sign in to +1 a comment.";
        }
        return;
      }
      if (!response.ok || !answer.agreements) {
        entry.problem.textContent = answer.message ?? AGREE_FAILED;
        return;
      }
      entry.agreed = answer.agreed === true;
      entry.agreements = answer.agreements;
      showAgreements(entry);
    } catch (cause) {
      if (signal.aborted) return;
      console.error("[svartz:annotations] couldn't save a +1", cause);
      entry.problem.textContent = AGREE_FAILED;
    } finally {
      entry.pending = false;
      entry.toggle.removeAttribute("aria-busy");
    }
  }

  const show = (comments: readonly Comment[]) => {
    const text = content.textContent ?? "";
    for (const comment of comments) {
      const position = locate(text, comment.anchor);
      if (position) add(comment, position);
    }
    layout();
  };

  // Back from signing in: the composer reopens on the passage with the draft as it was, or the +1 is applied once
  // its comment is shown.
  const draft = takeDraft(base, page);
  if (draft?.action === "comment") compose(draft.anchor, draft.body);

  const url = `${base}/?page=${encodeURIComponent(page)}`;
  fetch(url, { signal, headers: { accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      const answer = await response.json() as { annotations: Annotation[]; viewer: { id: string } | null };
      if (signal.aborted) return;
      viewer = answer.viewer?.id;
      show(answer.annotations.filter((annotation): annotation is Comment => annotation.kind === "comment"));
      if (draft?.action !== "agree") return;
      const entry = placed.find(({ id }) => id === draft.annotation);
      if (!entry) return;
      entry.card.showPopover();
      entry.toggle.focus();
      void agree(entry, true);
    })
    .catch((error: unknown) => {
      if (!signal.aborted) console.error("[svartz:annotations] couldn't load this page's comments", error);
    });

  return () => {
    controller.abort();
    resizes.disconnect();
    if (frame) cancelAnimationFrame(frame);
    if (composing) deactivate(composing.range);
    // The registered highlight, which every live element shares; it goes only once none has ranges in it.
    const highlight = CSS.highlights?.get(HIGHLIGHT);
    for (const { range } of placed) {
      highlight?.delete(range);
      deactivate(range);
    }
    if (highlight?.size === 0) CSS.highlights.delete(HIGHLIGHT);
    layer.remove();
  };
}

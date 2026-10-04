/**
 * Presentation mode. A key plays the current note fullscreen as slides split at
 * the breaks the `presentation()` plugin marked. Slides are static copies of the
 * note, laid out on a 1280×720 canvas scaled to fit, so a deck reads the same on
 * a laptop and a projector.
 */
const BREAK = "hr[data-svartz-slide-break]";
// Themes mark the previewable note body.
const NOTE_BODY = "[data-sv-preview] .sv-prose, .sv-prose[data-sv-preview]";
// Link previews and the search dialog keep copies of other notes in the page.
const COPIES = ".sv-link-preview, dialog";
const CANVAS = { width: 1280, height: 720 } as const;
const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", " "]);

export type SlideAction = "start" | "next" | "prev" | "first" | "last" | "exit";

interface KeyInput {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
}

/** What a key does. Keys with Ctrl, Cmd, or Alt stay with the browser. */
export function slideAction(event: KeyInput, startKey: string, presenting: boolean): SlideAction | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined;
  if (!presenting) return event.key.toLowerCase() === startKey.toLowerCase() ? "start" : undefined;
  switch (event.key) {
    case " ":
      return event.shiftKey ? "prev" : "next";
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
    case "Enter":
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "Escape":
      return "exit";
    default:
      return undefined;
  }
}

/** Split nodes into slides at each break. The breaks go, and so do slides with only blank nodes. */
export function groupAtBreaks<T>(
  nodes: readonly T[],
  isBreak: (node: T) => boolean,
  isBlank: (node: T) => boolean = () => false,
): T[][] {
  const slides: T[][] = [[]];
  for (const node of nodes) {
    if (isBreak(node)) slides.push([]);
    else slides.at(-1)!.push(node);
  }
  return slides.filter((slide) => slide.some((node) => !isBlank(node)));
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

const isBlankNode = (node: Node) =>
  node.nodeType === Node.COMMENT_NODE || (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim());

const inPage = (element: Element) => !element.closest(COPIES);

/** The note being read, split into slides; nothing on pages without a note body. */
function readSlides(): { root: HTMLElement; slides: Node[][] } | undefined {
  const noteBody = [...document.querySelectorAll<HTMLElement>(NOTE_BODY)].find(inPage);
  const firstBreak = [...(noteBody ?? document).querySelectorAll(BREAK)].find(inPage);
  const root = firstBreak?.parentElement ?? noteBody;
  if (!root) return undefined;
  const slides = groupAtBreaks([...root.childNodes], (node) => node instanceof Element && node.matches(BREAK), isBlankNode);
  return slides.length > 0 ? { root, slides } : undefined;
}

/** A copy for the slide. Heading ids would repeat the note's; ids inside an SVG scope its styles, so they stay. */
function copyNode(node: Node): Node {
  const copy = node.cloneNode(true);
  if (!(copy instanceof Element)) return copy;
  for (const element of [copy, ...copy.querySelectorAll("[id]")]) {
    if (element.id && !element.closest("svg")) element.removeAttribute("id");
  }
  return copy;
}

interface Presentation {
  go(action: Exclude<SlideAction, "start">, key: string): void;
  close(): void;
}

function present(deck: { root: HTMLElement; slides: Node[][] }, onClose: () => void): Presentation {
  const { root, slides } = deck;
  const overlay = document.createElement("div");
  overlay.className = "svartz-slides";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-roledescription", "slide deck");
  overlay.setAttribute("aria-label", document.title);
  overlay.tabIndex = -1;
  const stage = document.createElement("div");
  stage.className = "svartz-slides-stage";
  // The scroll container; its body carries the note body's classes so the theme's prose styles apply.
  const slide = document.createElement("div");
  slide.className = "svartz-slide";
  slide.setAttribute("role", "group");
  slide.setAttribute("aria-roledescription", "slide");
  const body = document.createElement("div");
  body.className = `${root.className} svartz-slide-body`;
  // Announces each slide's content as it appears.
  body.setAttribute("aria-live", "polite");
  const counter = document.createElement("p");
  counter.className = "svartz-slides-counter";
  counter.setAttribute("aria-hidden", "true");
  slide.append(body);
  stage.append(slide);
  overlay.append(stage, counter);

  let index = 0;
  const render = () => {
    body.replaceChildren(...slides[index]!.map(copyNode));
    slide.scrollTop = 0;
    const position = `${index + 1} / ${slides.length}`;
    counter.textContent = position;
    slide.setAttribute("aria-label", `Slide ${index + 1} of ${slides.length}`);
  };
  const fit = () => {
    const scale = Math.min(innerWidth / CANVAS.width, innerHeight / CANVAS.height);
    stage.style.setProperty("--svartz-slide-scale", String(scale));
  };
  // A slide taller than the canvas scrolls first; the deck moves on at its edge.
  const scrollWithin = (action: "next" | "prev", key: string) => {
    if (!SCROLL_KEYS.has(key)) return false;
    const room = action === "next"
      ? slide.scrollHeight - slide.clientHeight - slide.scrollTop
      : slide.scrollTop;
    if (room < 1) return false;
    const step = key === "ArrowDown" || key === "ArrowUp" ? slide.clientHeight * 0.2 : slide.clientHeight * 0.85;
    slide.scrollBy({ top: action === "next" ? step : -step });
    return true;
  };

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const inerted = [...document.body.children].filter((element): element is HTMLElement => element instanceof HTMLElement && !element.inert);
  for (const element of inerted) element.inert = true;
  document.body.append(overlay);
  render();
  fit();
  addEventListener("resize", fit);
  overlay.focus();

  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    removeEventListener("resize", fit);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    if (document.fullscreenElement === overlay) void document.exitFullscreen().catch(() => undefined);
    overlay.remove();
    for (const element of inerted) element.inert = false;
    previousFocus?.focus();
    onClose();
  };
  // Leaving fullscreen from the browser's own controls ends the presentation too.
  const onFullscreenChange = () => {
    if (!document.fullscreenElement) close();
  };
  void overlay.requestFullscreen?.().then(
    () => document.addEventListener("fullscreenchange", onFullscreenChange),
    () => undefined,
  );

  return {
    go(action, key) {
      if (action === "exit") return close();
      if ((action === "next" || action === "prev") && scrollWithin(action, key)) return;
      const last = slides.length - 1;
      const next = { next: index + 1, prev: index - 1, first: 0, last }[action];
      const clamped = Math.max(0, Math.min(last, next));
      if (clamped === index) return;
      index = clamped;
      render();
    },
    close,
  };
}

/** Enter and Space on a link, button, or fold inside a slide do their own thing. */
const activatesTarget = (event: KeyboardEvent) =>
  (event.key === "Enter" || event.key === " ") &&
  event.target instanceof Element &&
  !event.target.classList.contains("svartz-slides") &&
  event.target.closest("a[href], button, summary, input, select, textarea") !== null;

/** Listen for the start key on every page; a navigation closes any open presentation. */
export function mount(_pathname: string, options?: { key?: string }): () => void {
  const startKey = options?.key ?? "p";
  let current: Presentation | undefined;

  // Capture phase, so page shortcuts (like Ctrl+K search) can't open under a running deck.
  const onKeyDown = (event: KeyboardEvent) => {
    if (current) {
      event.stopPropagation();
      if (activatesTarget(event)) return;
      const action = slideAction(event, startKey, true);
      if (!action || action === "start") return;
      event.preventDefault();
      current.go(action, event.key);
      return;
    }
    if (event.defaultPrevented || isTyping(event.target) || slideAction(event, startKey, false) !== "start") return;
    const deck = readSlides();
    if (!deck) return;
    event.preventDefault();
    current = present(deck, () => (current = undefined));
  };

  addEventListener("keydown", onKeyDown, true);
  return () => {
    removeEventListener("keydown", onKeyDown, true);
    current?.close();
  };
}

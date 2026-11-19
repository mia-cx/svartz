/**
 * The submission panel: a full-height modal dialog with a note's Markdown source in CodeMirror, a note for reviewers,
 * a line beside the submit button saying whether the save goes live or to review, as the server decides for this
 * reader, and the commit or pull request link once saved. Edit opens it on a published note's source; New page opens
 * it blank, under a title and a section. Loaded on the first click of either.
 *
 * The source opens in Live Preview, Source, Rich text or Split, as the reader last chose, and suggests published notes
 * after `[[`. Rich text formats from a toolbar and edits frontmatter as properties, loading on first use. Split shows
 * the source beside the page as the site renders it, or under Write and Preview tabs on a phone. What
 * the reader writes is kept as a {@link Draft} while they write it; the panel offers it back when it next opens on the
 * same page, warning when the page's source has changed since. When the server asks for sign-in, the panel marks the draft to resume and opens `@svartz/auth`'s sign-in
 * dialog; signing in returns the reader to the page, and the panel reopens with the draft at once.
 *
 * On a site that tracks edits, the line saying what became of a save then follows it through review, the build and
 * live, and the panel reopened on the same page says how the reader's last edit is doing above everything else.
 */
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import type { BrowserScriptContext } from "@svartz/core";
import { openSignIn } from "@svartz/auth/browser";
import {
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  type Destination,
  type DestinationResponse,
  type EditRequest,
  type EditResponse,
  type ErrorResponse,
  type FollowUpRequest,
  type FollowUpSourceResponse,
  type NewPageRequest,
  type EditStage,
  type SourceResponse,
  type StatusResponse,
} from "./api";
import { draftSlot, hashSource, readDraft, readSavedEdit, storeDraft, storeSavedEdit, type Draft } from "./draft";
import { livePreview } from "./live-preview";
import type { Preview, PreviewSource } from "./preview";
import { wikilinkCompletion } from "./wikilinks";

/**
 * What the panel submits: an edit of a published note, or a new note in one of `folders`. A new note with a `title`
 * keeps it, as the reader's own user page does. An edit with `pull` is a follow-up to that submission: `page` is then
 * the file's path inside the vault, and the panel loads and saves it on the submission's branch.
 */
export type EditorTarget =
  | { readonly kind: "edit"; readonly page: string; readonly pull?: number }
  | { readonly kind: "new"; readonly folders: readonly string[]; readonly title?: string };

export interface EditorInput {
  readonly target: EditorTarget;
  /** The plugin's URL path, deployment base included, without a trailing slash. */
  readonly endpoint: string;
  /** SvelteKit's deployment base, which preview links start with. */
  readonly base: string;
  /** Renders the Split preview through the page's content components. Without it, Split isn't offered. */
  readonly mountContent?: BrowserScriptContext["mountContent"];
  /** The page the panel opened on, which a draft kept for sign-in is saved under. */
  readonly pathname: string;
  /** Focus returns here when the panel closes. */
  readonly opener: HTMLElement;
  /** Show the Turnstile challenge with this site key, and send its token with the submission. */
  readonly turnstileSiteKey?: string;
  /** Follow a saved edit to live, and show the last one's progress when the panel reopens. */
  readonly tracked?: boolean;
}

/**
 * How the source shows, as the mode switch lists them, with the extension each installs. Every mode edits the same
 * document, so switching never changes its bytes. Rich text loads the first time it opens. Split shows the raw source
 * beside the rendered page.
 */
const MODES: Record<"live" | "source" | "rich" | "split", { label: string; extension: () => Extension | Promise<Extension> }> = {
  live: { label: "Live Preview", extension: livePreview },
  source: { label: "Source", extension: () => [] },
  rich: { label: "Rich text", extension: () => import("./rich-text").then(({ richText }) => richText()) },
  split: { label: "Split", extension: () => [] },
};
type Mode = keyof typeof MODES;
/** theme-minimal's phone breakpoint: below it, Split's panes become Write and Preview tabs. */
const PHONE = "(max-width: 40rem)";
const MODE_KEY = "svartz-submissions:mode";
/** Wait this long after the last keystroke before saving the draft. */
const AUTOSAVE_DELAY_MS = 400;

/** The mode the reader last chose in this browser, among the `offered` ones; Live Preview until they choose. */
function preferredMode(offered: readonly Mode[]): Mode {
  try {
    const mode = localStorage.getItem(MODE_KEY);
    return offered.includes(mode as Mode) ? mode as Mode : "live";
  } catch {
    return "live";
  }
}

function rememberMode(mode: Mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage is blocked: the choice lasts as long as the panel.
  }
}

const savedAt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** The parts of Turnstile's explicit-rendering API the panel uses. */
interface Turnstile {
  render(container: HTMLElement, options: { sitekey: string; theme: "auto"; size: "flexible" }): string | undefined;
  getResponse(widgetId: string): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const UNVERIFIED = "Finish the check that you're human, then open the pull request.";

/** What the submit button says, and what the panel says beside it, for each place a save can go. */
const DESTINATIONS = {
  commit: { idle: "Publish", sending: "Publishing…", hint: "Goes live once the site rebuilds." },
  "pull-request": { idle: "Open pull request", sending: "Opening pull request…", hint: "Goes to review before it goes live." },
  "follow-up": { idle: "Add to submission", sending: "Adding to submission…", hint: "Goes to review with your submission." },
} as const;

/** Where a save goes: as the server decides for a page, or into the submission a follow-up edits. */
type Destined = Destination | "follow-up";

/** How often an open panel asks how a saved edit is doing. */
const FOLLOW_INTERVAL_MS = 10_000;

/** What the panel says about a saved edit at each stage; `noun` is `edit` or `page`. */
function stageText({ stage, pull }: StatusResponse, noun: string): string {
  switch (stage) {
    case "open":
      return `Your ${noun} is waiting for review as pull request #${pull?.number}.`;
    case "closed":
      return `Pull request #${pull?.number} was closed without merging.`;
    case "committed":
      return pull ? `Pull request #${pull.number} was merged. Your ${noun} goes live once the site rebuilds.` : `Your ${noun} goes live once the site rebuilds.`;
    case "building":
      return `The site is rebuilding with your ${noun}.`;
    case "live":
      return `Your ${noun} is live.`;
    case "failed":
      return `The site's rebuild failed, so your ${noun} isn't live yet.`;
  }
}

/** Stages after which nothing more happens to an edit. */
const FINAL_STAGES: ReadonlySet<EditStage> = new Set(["live", "closed"]);

/**
 * Git's null object id, which no file has: sent in place of the loaded source's SHA when the panel holds a draft
 * written against another source, so a save that would commit opens a pull request instead.
 */
const UNKNOWN_SOURCE = "0".repeat(40);
const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let turnstileLoad: Promise<Turnstile> | undefined;

/** Cloudflare's script, added to the page once and shared by every panel. */
function loadTurnstile(): Promise<Turnstile> {
  turnstileLoad ??= new Promise<Turnstile>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = Object.assign(document.createElement("script"), { src: TURNSTILE_SCRIPT, async: true });
    script.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile) : reject()));
    script.addEventListener("error", () => reject());
    document.head.append(script);
  }).catch(() => {
    // The next panel tries again.
    turnstileLoad = undefined;
    throw new Error("Couldn't load the check that you're human. Check your connection, then reopen the editor.");
  });
  return turnstileLoad;
}

// Lucide "x".
const CLOSE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

/** The section a new page goes in, as the picker names it. */
const sectionName = (folder: string) => folder || "Top level";

/** Title and section, above the source, for a new page. */
const NEW_PAGE_FIELDS = `
    <div class="svartz-submissions-fields">
      <div class="svartz-submissions-field">
        <label class="sv-label" for="svartz-submissions-page-title">Title</label>
        <input id="svartz-submissions-page-title" name="title" type="text" maxlength="${MAX_TITLE_LENGTH}" autocomplete="off" required>
      </div>
      <div class="svartz-submissions-field">
        <label class="sv-label" for="svartz-submissions-section">Section</label>
        <select id="svartz-submissions-section" name="folder"></select>
      </div>
    </div>`;

const modeSwitch = (offered: readonly Mode[]) => `
    <fieldset class="svartz-submissions-modes">
      <legend class="sv-visually-hidden">Editor mode</legend>${offered.map((mode) => `
      <label><input type="radio" name="svartz-submissions-mode" value="${mode}">${MODES[mode].label}</label>`).join("")}
    </fieldset>`;

const panel = (target: EditorTarget, offered: readonly Mode[]) => `
<div class="svartz-submissions-panel">
  <header class="svartz-submissions-header">
    <h2 id="svartz-submissions-title">${target.kind === "new" ? "New page" : target.pull === undefined ? "Edit page" : "Edit submission"}</h2>${modeSwitch(offered)}
    <button type="button" class="sv-icon-button" data-close aria-label="Close editor">${CLOSE_ICON}</button>
  </header>
  <form class="svartz-submissions-form" data-kind="${target.kind}" novalidate>
    <div class="svartz-submissions-followed" role="status" hidden></div>${target.kind === "new" ? NEW_PAGE_FIELDS : ""}
    <div class="svartz-submissions-editor">
      <div class="svartz-submissions-tabs" role="tablist" aria-label="Split view" hidden>
        <button type="button" role="tab" id="svartz-submissions-write-tab" aria-controls="svartz-submissions-source">Write</button>
        <button type="button" role="tab" id="svartz-submissions-preview-tab" aria-controls="svartz-submissions-preview">Preview</button>
      </div>
      <div class="svartz-submissions-source" id="svartz-submissions-source">
        <p class="svartz-submissions-status" role="status">${target.kind === "edit" ? "Loading the page source…" : ""}</p>
      </div>
      <div class="svartz-submissions-preview sv-prose" id="svartz-submissions-preview" role="region" aria-label="Preview" hidden></div>
    </div>
    <div class="svartz-submissions-note">
      <label class="sv-label" for="svartz-submissions-note">${target.kind === "edit" ? "What changed" : "Why add this page"}</label>
      <textarea id="svartz-submissions-note" name="note" rows="3" maxlength="${MAX_NOTE_LENGTH}"></textarea>
    </div>
    <div class="svartz-submissions-turnstile" hidden></div>
    <p class="svartz-submissions-error" data-sv-signal role="alert" hidden></p>
    <footer class="svartz-submissions-actions">
      <button type="submit" class="svartz-submissions-primary" aria-describedby="svartz-submissions-destination" disabled>Open pull request</button>
      <button type="button" class="sv-action" data-close>Cancel</button>
      <p class="svartz-submissions-destination" id="svartz-submissions-destination" hidden></p>
    </footer>
  </form>
</div>`;

/**
 * A failure the reader can act on. `code` is the server's {@link ErrorResponse.error}; `existing` links the published
 * page a new page's title is taken by.
 */
class ServerError extends Error {
  constructor(message: string, readonly code?: string, readonly existing?: string) {
    super(message);
  }
}

/** JSON from the plugin's server, or a {@link ServerError} whose message the reader can act on. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ServerError("Couldn't reach the site. Check your connection and try again.");
  }
  const body = await response.json().catch(() => undefined) as T | Partial<ErrorResponse> | undefined;
  if (!response.ok) {
    const { message, error, existing } = (body ?? {}) as Partial<ErrorResponse>;
    throw new ServerError(
      typeof message === "string" ? message : `The site answered ${response.status}. Try again in a moment.`,
      typeof error === "string" ? error : undefined,
      typeof existing === "string" ? existing : undefined,
    );
  }
  return body as T;
}

/**
 * The last submission sent without a confirmed answer, by {@link draftSlot}: its id and the exact fields sent under it. Sending the same fields again reuses the id, so
 * the server finds the pull request a lost attempt may have opened, even after navigation closed the panel mid-send. Different fields get a new id: the server would answer with
 * the earlier pull request, which doesn't hold them.
 */
const unconfirmed = new Map<string, { readonly id: string; readonly payload: string }>();

/** 128 random bits as hex. `getRandomValues`, unlike `randomUUID`, works on sites served without HTTPS. */
function newSubmissionId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function query<E extends Element>(root: ParentNode, selector: string): E {
  const element = root.querySelector<E>(selector);
  if (!element) throw new Error(`[submissions] the panel has no ${selector}`);
  return element;
}

/** Open the panel on `target`. Returns a function that closes it without asking, for navigation cleanup. */
export function openEditor({ target, endpoint, base, mountContent, pathname, opener, turnstileSiteKey, tracked }: EditorInput): () => void {
  const offered = (Object.keys(MODES) as Mode[]).filter((mode) => mode !== "split" || mountContent);
  const dialog = document.createElement("dialog");
  dialog.className = "svartz-submissions";
  dialog.setAttribute("aria-labelledby", "svartz-submissions-title");
  dialog.innerHTML = panel(target, offered);
  const form = query<HTMLFormElement>(dialog, "form");
  const source = query<HTMLElement>(dialog, ".svartz-submissions-source");
  const note = query<HTMLTextAreaElement>(dialog, "textarea");
  const error = query<HTMLElement>(dialog, ".svartz-submissions-error");
  const actions = query<HTMLElement>(dialog, ".svartz-submissions-actions");
  const submit = query<HTMLButtonElement>(dialog, '[type="submit"]');
  const hint = query<HTMLElement>(dialog, ".svartz-submissions-destination");
  const challenge = query<HTMLElement>(dialog, ".svartz-submissions-turnstile");
  /** The last saved edit's progress, when the panel reopens on its page. */
  const lastEdit = query<HTMLElement>(dialog, ".svartz-submissions-followed");
  const noun = target.kind === "edit" ? "edit" : "page";
  /** The saved edit being followed, and when it is next asked about. */
  let followed: string | undefined;
  let followTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Ask how saved edit `id` is doing, after `delay` and then every {@link FOLLOW_INTERVAL_MS} while the panel is open
   * and the page shows, handing each answer to `show`, until it reaches a final stage. Following another edit stops it.
   */
  function follow(id: string, show: (status: StatusResponse) => void, delay = FOLLOW_INTERVAL_MS) {
    clearTimeout(followTimer);
    followed = id;
    const current = () => followed === id && dialog.isConnected;
    const ask = async () => {
      if (!current()) return;
      if (document.visibilityState === "visible") {
        try {
          const status = await request<StatusResponse>(`${endpoint}/status/?edit=${id}`);
          if (!current()) return;
          show(status);
          if (FINAL_STAGES.has(status.stage)) {
            // Seen to its end, so the next panel has nothing to show.
            if (readSavedEdit(endpoint, target)?.id === id) storeSavedEdit(endpoint, target, undefined);
            return;
          }
        } catch (failure) {
          // The site has no record of it for this reader: there is nothing to follow. Other failures ask again later.
          if ((failure as ServerError).code === "not_found") {
            if (readSavedEdit(endpoint, target)?.id === id) storeSavedEdit(endpoint, target, undefined);
            return;
          }
        }
      }
      if (current()) followTimer = setTimeout(ask, FOLLOW_INTERVAL_MS);
    };
    followTimer = setTimeout(ask, delay);
  }

  const previous = tracked ? readSavedEdit(endpoint, target) : undefined;
  if (previous) {
    let shown: EditStage | undefined;
    follow(previous.id, (status) => {
      if (status.stage === shown) return;
      shown = status.stage;
      const link = Object.assign(document.createElement("a"), {
        href: previous.url,
        textContent: previous.number === undefined ? "View commit" : `View pull request #${previous.number}`,
        rel: "noopener",
        target: "_blank",
      });
      lastEdit.replaceChildren(Object.assign(document.createElement("p"), { textContent: stageText(status, `last ${noun}`) }), link);
      lastEdit.hidden = false;
    }, 0);
  }
  const closers = dialog.querySelectorAll<HTMLButtonElement>("[data-close]");
  const title = dialog.querySelector<HTMLInputElement>('input[name="title"]');
  const folder = dialog.querySelector<HTMLSelectElement>('select[name="folder"]');
  /** Whether the title is given, and the reader writes only the page. */
  const fixedTitle = target.kind === "new" && target.title !== undefined;
  if (target.kind === "new") {
    folder?.append(...target.folders.map((path) => Object.assign(document.createElement("option"), { value: path, textContent: sectionName(path) })));
    if (title && target.title !== undefined) {
      title.value = target.title;
      title.readOnly = true;
    }
  }
  let turnstile: { api: Turnstile; id: string } | undefined;
  const draft = readDraft(endpoint, target);
  /** The kept draft while it waits to be restored or discarded: closing the panel mustn't forget it. */
  let unrestored = draft;
  /** The restore offer on screen; the draft isn't saved over while it shows. */
  let offer: HTMLElement | undefined;
  /** Set once sign-in is asked for: the saved draft then reopens the panel when the reader is back on this page. */
  let resumeOn: string | undefined;
  let autosave: ReturnType<typeof setTimeout> | undefined;
  /**
   * When the kept draft this panel read or last saved was saved. Tabs share the slot: a draft another tab saved since
   * has another time, and this panel never forgets it.
   */
  let ownSave = draft?.savedAt;

  let mode = preferredMode(offered);
  const presentation = new Compartment();
  for (const radio of dialog.querySelectorAll<HTMLInputElement>('input[name="svartz-submissions-mode"]')) {
    radio.checked = radio.value === mode;
    radio.addEventListener("change", () => {
      mode = radio.value as Mode;
      rememberMode(mode);
      present();
      arrange();
    });
  }

  /** Install the mode's presentation, once it has loaded; a mode chosen meanwhile wins. */
  function present() {
    const shown = mode;
    const install = (extension: Extension) => {
      if (shown === mode) view?.dispatch({ effects: presentation.reconfigure(extension) });
    };
    const extension = MODES[shown].extension();
    if (!(extension instanceof Promise)) return install(extension);
    void extension.then(install, (cause: unknown) => {
      console.error(`[submissions] couldn't load ${MODES[shown].label}`, cause);
      if (shown === mode) showError({ message: `Couldn't load ${MODES[shown].label}. Check your connection, then choose it again.` });
    });
  }

  const panes = query<HTMLElement>(dialog, ".svartz-submissions-editor");
  const tablist = query<HTMLElement>(dialog, '[role="tablist"]');
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const previewPane = query<HTMLElement>(dialog, ".svartz-submissions-preview");
  const phone = window.matchMedia(PHONE);
  /** Which of Split's panes shows on a phone. */
  let tab: "write" | "preview" = "write";
  /** The preview, once Split first opens; it lives as long as the panel. */
  let preview: Promise<Preview | undefined> | undefined;

  /** What the preview shows: the source, as the page it edits or the new note its title and section name. */
  function previewSource(): PreviewSource | undefined {
    if (!view) return undefined;
    const markdown = view.state.sliceDoc();
    if (target.kind === "edit") return { markdown, note: target.pull === undefined ? { page: target.page } : { path: target.page } };
    const name = title?.value.trim() || "Untitled";
    return { markdown, note: { path: `${folder?.value ? `${folder.value}/` : ""}${name}.md` } };
  }

  /** Bring the preview up to date, when Split shows it. */
  function refreshPreview() {
    const source = previewSource();
    if (mode !== "split" || !source || !mountContent) return;
    preview ??= import("./preview")
      .then(({ createPreview }) => createPreview(previewPane, { endpoint, base, mountContent }))
      .catch((cause: unknown) => {
        previewPane.textContent = "Couldn't load the preview. Check your connection, then reopen the editor.";
        console.error("[submissions] couldn't load the preview", cause);
        return undefined;
      });
    void preview.then((shown) => dialog.isConnected && shown?.update(previewSource()!));
  }

  /**
   * Lay the panes out for the mode: the source alone, or Split's source and preview side by side. On a phone, Split
   * shows one pane at a time under Write and Preview tabs.
   */
  function arrange() {
    const split = mode === "split";
    const tabbed = split && phone.matches;
    panes.dataset.mode = mode;
    dialog.dataset.mode = mode;
    tablist.hidden = !tabbed;
    previewPane.hidden = !split || (tabbed && tab === "write");
    source.hidden = tabbed && tab === "preview";
    for (const button of tabs) {
      const selected = button.id === `svartz-submissions-${tab}-tab`;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    // The panes are tab panels only while the tabs show.
    for (const [pane, label] of [[source, "write"], [previewPane, "preview"]] as const) {
      if (tabbed) {
        pane.setAttribute("role", "tabpanel");
        pane.setAttribute("aria-labelledby", `svartz-submissions-${label}-tab`);
      } else {
        pane.removeAttribute("aria-labelledby");
        if (pane === previewPane) pane.setAttribute("role", "region");
        else pane.removeAttribute("role");
      }
    }
    refreshPreview();
  }

  function selectTab(next: typeof tab) {
    tab = next;
    arrange();
    tabs.find((button) => button.id === `svartz-submissions-${tab}-tab`)!.focus();
  }
  for (const button of tabs) {
    button.addEventListener("click", () => selectTab(button.id.includes("preview") ? "preview" : "write"));
  }
  // Arrow keys, Home and End move between the tabs, and select the one they reach.
  tablist.addEventListener("keydown", (event) => {
    const next = { ArrowLeft: tab === "write" ? "preview" : "write", ArrowRight: tab === "write" ? "preview" : "write", Home: "write", End: "preview" }[event.key];
    if (!next) return;
    event.preventDefault();
    selectTab(next as typeof tab);
  });
  phone.addEventListener("change", arrange);

  const editable = new Compartment();
  let view: EditorView | undefined;
  let original = "";
  /**
   * The {@link Draft.sourceHash} of what the source holds: the loaded source's, or a restored draft's, so a draft
   * restored over a newer source still warns when it is offered again.
   */
  let sourceHash: string | undefined;
  /** The loaded source's blob SHA and {@link Draft.sourceHash}: an edit is based on it only while the hashes match. */
  let loaded: { sha: string; hash: string } | undefined;
  /** Where a save goes for this reader, as the server last said; `null` until it says, or when they can't save. */
  let destination: Destined = null;
  /**
   * Whether a new page's destination is being asked for its current title and section. The reader can't send until the
   * server says: the button would still promise what the last title got, and a save can go live where that went to review.
   */
  let asking = false;
  // The fields are locked while sending, so the pull request holds exactly what the reader sees. The panel can't be
  // dismissed then either: the reader would never see the pull request it opens.
  let phase: "editing" | "sending" | "sent" = "editing";
  /** Whether the error says the title is taken. */
  let conflict = false;
  /** Whether there is something to submit: a changed source, or a new page with a title and content. */
  const ready = () => {
    if (!view || asking) return false;
    const markdown = view.state.sliceDoc();
    return target.kind === "edit" ? markdown !== original : Boolean(title?.value.trim() && markdown.trim());
  };
  /** Whether closing would lose anything the reader typed. */
  const typed = () => (view !== undefined && view.state.sliceDoc() !== original) || Boolean(note.value.trim() || title?.value.trim());

  /** Forget the kept draft, unless another tab saved it. Answers whether storage holds no draft of this panel's. */
  function forget(): boolean {
    return readDraft(endpoint, target)?.savedAt !== ownSave || storeDraft(endpoint, target, undefined);
  }

  /**
   * Keep what the reader has written, or forget the kept draft when they've written nothing. Skipped while there is no
   * source to save, while a kept draft is still on offer, and once the pull request holds it. Answers whether storage
   * took it.
   */
  function save(): boolean {
    clearTimeout(autosave);
    if (!view || offer || phase === "sent") return true;
    if (!typed()) return forget();
    const savedAt = Date.now();
    const common = { markdown: view.state.sliceDoc(), note: note.value, savedAt, ...(resumeOn ? { resume: resumeOn } : {}) };
    const stored = storeDraft(endpoint, target, target.kind === "edit"
      ? { ...common, kind: "edit", page: target.page, sourceHash }
      : { ...common, kind: "new", folder: folder?.value ?? "", title: title?.value ?? "" });
    // A refused save leaves the last stored draft in place, and this panel still owns it.
    if (stored) ownSave = savedAt;
    return stored;
  }

  /** Save once the reader pauses. */
  function saveSoon() {
    clearTimeout(autosave);
    autosave = setTimeout(save, AUTOSAVE_DELAY_MS);
  }

  function lock(locked: boolean) {
    view?.dispatch({ effects: editable.reconfigure(EditorView.editable.of(!locked)) });
    note.readOnly = locked;
    if (title) title.readOnly = locked || fixedTitle;
    if (folder) folder.disabled = locked;
  }

  function holdOpen(held: boolean) {
    for (const button of closers) button.disabled = held;
  }

  function showError({ message, code, existing }: { message: string; code?: string; existing?: string }) {
    error.textContent = message;
    conflict = code === "exists";
    if (existing) {
      const link = Object.assign(document.createElement("a"), { href: existing, textContent: "Open the existing page" });
      error.append(" ", link);
    }
    error.hidden = false;
  }

  /**
   * Close the panel. Navigation keeps what the reader wrote; a dismissal has already decided its fate, so the page's
   * cleanup closing it again does nothing.
   */
  function close(keep = true) {
    if (!dialog.isConnected) return;
    if (keep) save();
    clearTimeout(autosave);
    clearTimeout(destinationTimer);
    clearTimeout(followTimer);
    followed = undefined;
    window.removeEventListener("pagehide", save);
    phone.removeEventListener("change", arrange);
    void preview?.then((shown) => shown?.destroy());
    view?.destroy();
    if (turnstile) turnstile.api.remove(turnstile.id);
    dialog.close();
    dialog.remove();
    if (opener.isConnected) opener.focus();
  }

  /** Close on request, asking first when unsubmitted work would be lost. Ignored while sending. */
  function dismiss(): boolean {
    if (phase === "sending") return false;
    if (phase !== "sent" && typed() && !window.confirm(target.kind === "edit" ? "Discard your edit?" : "Discard this page?")) return false;
    // The reader discarded what they wrote; a draft still on offer, or one the panel couldn't load the source for, stays.
    if (!unrestored) forget();
    close(false);
    return true;
  }

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dismiss();
  });
  dialog.addEventListener("click", (event) => {
    if ((event.target as Element).closest("[data-close]")) dismiss();
  });
  // A taken title's message and link describe the name last sent; another name makes them wrong.
  function dropConflict() {
    if (!conflict) return;
    conflict = false;
    error.hidden = true;
    error.replaceChildren();
  }
  /** Say where a save goes, on the button and beside it. */
  function showDestination(next: Destined) {
    destination = next;
    hint.textContent = next ? DESTINATIONS[next].hint : "";
    hint.hidden = !next;
    if (phase === "editing") submit.textContent = DESTINATIONS[next ?? "pull-request"].idle;
  }

  let destinationTimer: ReturnType<typeof setTimeout> | undefined;
  /** Counts questions, so only the latest answer shows. */
  let asked = 0;
  /** Whether the error says the last question about where a new page goes got no answer. */
  let unanswered = false;
  /**
   * Ask where a new page goes once the reader pauses: its title and section decide which grants apply. Without an
   * answer the reader can't send, since the button can't say whether the page goes live; the error offers to ask again.
   */
  function askDestination() {
    clearTimeout(destinationTimer);
    const ask = ++asked;
    const name = title?.value.trim() ?? "";
    // The last answer was for another title or section, so it no longer says where this page goes.
    asking = Boolean(name);
    showDestination(null);
    if (unanswered) {
      unanswered = false;
      error.hidden = true;
      error.replaceChildren();
    }
    if (phase === "editing") submit.disabled = !ready();
    if (!name) return;
    destinationTimer = setTimeout(async () => {
      const query = new URLSearchParams({ folder: folder?.value ?? "", title: name });
      let answer: DestinationResponse;
      try {
        answer = await request<DestinationResponse>(`${endpoint}/destination/?${query}`);
      } catch (failure) {
        if (ask !== asked || !dialog.isConnected) return;
        showError(failure as ServerError);
        const retry = Object.assign(document.createElement("button"), { type: "button", className: "sv-action", textContent: "Try again" });
        retry.addEventListener("click", () => askDestination());
        error.append(" ", retry);
        unanswered = true;
        return;
      }
      if (ask !== asked || !dialog.isConnected) return;
      asking = false;
      showDestination(answer.destination);
      if (phase === "editing") submit.disabled = !ready();
    }, AUTOSAVE_DELAY_MS);
  }

  title?.addEventListener("input", () => {
    dropConflict();
    refreshPreview();
    if (phase === "editing") submit.disabled = !ready();
    askDestination();
    saveSoon();
  });
  folder?.addEventListener("change", () => {
    dropConflict();
    refreshPreview();
    askDestination();
    saveSoon();
  });
  note.addEventListener("input", saveSoon);
  // A closed tab or a crash loses at most the last pause's worth of typing.
  window.addEventListener("pagehide", save);

  /**
   * The submission's route, its key in {@link unconfirmed}, and its fields, without its id or Turnstile token. An edit
   * names the source it was written against by SHA: the loaded one, unless a restored draft was written against another.
   */
  function fields(markdown: string) {
    const key = draftSlot(endpoint, target);
    if (target.kind === "edit") {
      const sha = loaded && loaded.hash === sourceHash ? loaded.sha : UNKNOWN_SOURCE;
      if (target.pull !== undefined) return { route: "follow-up" as const, key, fields: { pull: target.pull, markdown, note: note.value, sha } };
      return { route: "edit" as const, key, fields: { page: target.page, markdown, note: note.value, sha } };
    }
    return { route: "new" as const, key, fields: { folder: folder?.value ?? "", title: title?.value ?? "", markdown, note: note.value } };
  }

  /**
   * Keep the submission for this page and open the sign-in dialog. Signing in leaves the page; the panel reopens with
   * the draft when the reader comes back. Without storage, the reader is told to copy their changes before signing in.
   */
  function signIn(failure: ServerError) {
    showError(failure);
    resumeOn = pathname;
    if (!save()) {
      resumeOn = undefined;
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: "Sign in" });
      button.addEventListener("click", () => openSignIn());
      error.append(" This browser can't keep your changes while you sign in, so copy them first. ", button);
      return;
    }
    // Cancelling the dialog hands focus back here, beside the message.
    submit.focus();
    try {
      openSignIn();
    } catch (cause) {
      // The vault has no auth plugin: the message stays, and the draft reopens nothing.
      resumeOn = undefined;
      save();
      console.error("[submissions] couldn't open sign-in", cause);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!view || phase !== "editing" || !ready()) return;
    const turnstileToken = turnstile?.api.getResponse(turnstile.id);
    if (turnstileSiteKey && !turnstileToken) return showError({ message: UNVERIFIED });
    // Sending what's on screen answers the offer: the kept draft gives way to it.
    if (offer) dropOffer();
    phase = "sending";
    lock(true);
    holdOpen(true);
    error.hidden = true;
    submit.disabled = true;
    submit.textContent = DESTINATIONS[destination ?? "pull-request"].sending;
    const submission = fields(view.state.sliceDoc());
    const payload = JSON.stringify(submission.fields);
    const last = unconfirmed.get(submission.key);
    const submissionId = last?.payload === payload ? last.id : newSubmissionId();
    unconfirmed.set(submission.key, { id: submissionId, payload });
    try {
      const saved = await request<EditResponse>(`${endpoint}/${submission.route}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submission.route === "follow-up"
          ? submission.fields satisfies FollowUpRequest
          : { submissionId, ...submission.fields, turnstileToken } satisfies EditRequest | NewPageRequest),
      });
      // Confirmed only once the reader can see the link: if navigation already closed the panel, the next panel
      // retries under this id and the server answers with the pull request this attempt opened.
      if (!dialog.isConnected) return;
      // The pull request holds these fields now and the panel stays locked; further typing would go nowhere.
      unconfirmed.delete(submission.key);
      forget();
      phase = "sent";
      challenge.hidden = true;
      holdOpen(false);
      showSaved(saved, submissionId);
    } catch (cause) {
      // Navigation closed the panel mid-send: the refusal belongs to a page the reader left, so it opens no sign-in
      // and saves no draft. The unconfirmed id stays for the next panel's retry.
      if (!dialog.isConnected) return;
      phase = "editing";
      lock(false);
      holdOpen(false);
      // The server spent the token; a retry needs a fresh one.
      if (turnstile) turnstile.api.reset(turnstile.id);
      submit.disabled = false;
      submit.textContent = DESTINATIONS[destination ?? "pull-request"].idle;
      const failure = cause as ServerError;
      if (failure.code === "sign_in_required") signIn(failure);
      else showError(failure);
    }
  });

  /**
   * What became of the save, in place of the buttons: the commit, the pull request, or why it went to review. On a site
   * that tracks edits, the line then follows submission `id` to live.
   */
  function showSaved(saved: EditResponse, id: string) {
    query<HTMLElement>(dialog, ".svartz-submissions-note").hidden = true;
    const edit = target.kind === "edit";
    const why = {
      changed: edit
        ? "This page changed since you opened it, so your edit went to review"
        : "A page with this title was saved meanwhile, so yours went to review",
      protected: `The repository's rules don't let the site publish your ${edit ? "edit" : "page"} directly, so it went to review`,
      route: `Your ${edit ? "edit gives this page" : "page asks for"} an address you can't publish to, so it went to review`,
    };
    const status = Object.assign(document.createElement("p"), {
      className: "svartz-submissions-opened",
      textContent: saved.kind === "commit"
        ? destination === "follow-up" ? "Added to your submission." : "Published. It goes live once the site rebuilds."
        : saved.reason
          ? `${why[saved.reason]} as pull request #${saved.number}.`
          : `Opened pull request #${saved.number}.`,
    });
    status.setAttribute("role", "status");
    const link = Object.assign(document.createElement("a"), {
      className: "svartz-submissions-primary",
      href: saved.url,
      textContent: saved.kind === "commit" ? "View commit" : `View pull request #${saved.number}`,
      rel: "noopener",
      target: "_blank",
    });
    const done = Object.assign(document.createElement("button"), { type: "button", className: "sv-action", textContent: "Close" });
    done.dataset.close = "";
    actions.replaceChildren(status, link, done);
    link.focus();
    if (!tracked) return;
    // This edit is now the one to follow, here and when the panel next opens on the page.
    lastEdit.hidden = true;
    storeSavedEdit(endpoint, target, { id, url: saved.url, ...(saved.kind === "pull-request" ? { number: saved.number } : {}), savedAt: Date.now() });
    let shown: EditStage = saved.kind === "commit" ? "committed" : "open";
    follow(id, (answer) => {
      if (answer.stage === shown) return;
      shown = answer.stage;
      status.textContent = stageText(answer, noun);
    });
  }

  /** CodeMirror on `markdown`, replacing the loading status. */
  function showSource(markdown: string) {
    original = markdown;
    if (target.kind === "edit") sourceHash = hashSource(markdown);
    source.replaceChildren();
    view = new EditorView({
      parent: source,
      state: EditorState.create({
        doc: markdown,
        extensions: [
          // Split and join on the file's own line ending, so untouched lines keep their bytes.
          EditorState.lineSeparator.of(markdown.includes("\r\n") ? "\r\n" : "\n"),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "Page source" }),
          editable.of(EditorView.editable.of(true)),
          presentation.of([]),
          wikilinkCompletion(endpoint),
          ...(target.kind === "new" ? [placeholder("Write the page in Markdown.")] : []),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            refreshPreview();
            if (phase !== "editing") return;
            submit.disabled = !ready();
            saveSoon();
          }),
        ],
      }),
    });
    present();
    refreshPreview();
  }

  /** The draft's fields, in place of the panel's. Saved at once, so a sign-in draft no longer reopens the panel. */
  function restore({ markdown, note: text, ...rest }: Draft) {
    view?.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: markdown } });
    note.value = text;
    if (rest.kind === "edit") {
      sourceHash = rest.sourceHash;
      // Written against another source, it is sent without a SHA the branch could hold, so it can only go to review.
      if (destination === "commit" && loaded?.hash !== sourceHash) showDestination("pull-request");
    } else if (title && folder) {
      title.value = rest.title;
      folder.value = rest.folder;
      askDestination();
    }
    submit.disabled = !ready();
    unrestored = undefined;
    save();
  }

  function dropOffer() {
    offer?.remove();
    offer = undefined;
    unrestored = undefined;
    lock(false);
  }

  /**
   * Offer the kept draft back above the source, focusing its first button, and say so when the page `changed` since it
   * was saved. The fields take no writing until the reader answers: the draft isn't saved over while it shows, so that
   * writing would be lost.
   */
  function offerDraft(kept: Draft, changed: boolean) {
    lock(true);
    const noun = target.kind === "edit" ? "edit" : "page";
    offer = document.createElement("div");
    offer.className = "svartz-submissions-restore";
    offer.setAttribute("role", "group");
    offer.setAttribute("aria-labelledby", "svartz-submissions-restore-text");
    offer.innerHTML = `<p id="svartz-submissions-restore-text"></p>
      <button type="button" class="sv-action" data-restore>Restore ${changed ? "anyway" : noun}</button>
      <button type="button" class="sv-action" data-discard>Discard ${noun}</button>`;
    query<HTMLElement>(offer, "p").textContent =
      `Unsent ${noun} from ${savedAt.format(kept.savedAt)}.${changed ? " This page changed since you saved this draft." : ""}`;
    query<HTMLElement>(offer, "[data-restore]").addEventListener("click", () => {
      dropOffer();
      restore(kept);
      view?.focus();
    });
    query<HTMLElement>(offer, "[data-discard]").addEventListener("click", () => {
      dropOffer();
      forget();
      save();
      (title ?? view)?.focus();
    });
    source.prepend(offer);
    query<HTMLElement>(offer, "[data-restore]").focus();
  }

  /**
   * With the source showing: back from signing in, the draft as the reader left it, ready to send, unless the page
   * changed meanwhile. Otherwise a kept draft is offered, and the panel starts where the reader writes. A draft without
   * a recorded source is offered as before: whether its page changed is unknown.
   */
  function begin() {
    const changed = draft?.kind === "edit" && draft.sourceHash !== undefined && draft.sourceHash !== sourceHash;
    if (draft?.resume === pathname && !changed) {
      restore(draft);
      submit.focus();
    } else if (draft) {
      offerDraft(draft, changed);
    } else {
      (target.kind === "edit" || fixedTitle ? view : title)?.focus();
    }
  }

  async function load(page: string, pull?: number) {
    try {
      // A follow-up edits the file as the submission's branch holds it now.
      const answer = pull === undefined
        ? await request<SourceResponse>(`${endpoint}/source/?page=${encodeURIComponent(page)}`)
        : { ...await request<FollowUpSourceResponse>(`${endpoint}/follow-up/source/?pull=${pull}`), destination: "follow-up" as const };
      // Navigation closed the panel while the source loaded; a draft stays saved for the page's next visit.
      if (!dialog.isConnected) return;
      showSource(answer.markdown);
      loaded = { sha: answer.sha, hash: hashSource(answer.markdown) };
      showDestination(answer.destination);
      begin();
    } catch (cause) {
      source.replaceChildren();
      showError(cause as ServerError);
    }
  }

  async function showChallenge(sitekey: string) {
    challenge.hidden = false;
    try {
      const api = await loadTurnstile();
      if (!dialog.isConnected) return;
      const id = api.render(challenge, { sitekey, theme: "auto", size: "flexible" });
      if (id) turnstile = { api, id };
    } catch (cause) {
      challenge.hidden = true;
      showError(cause as Error);
    }
  }

  document.body.append(dialog);
  arrange();
  dialog.showModal();
  if (target.kind === "edit") {
    void load(target.page, target.pull);
  } else {
    showSource("");
    // A given title already decides where the page goes.
    if (fixedTitle) askDestination();
    begin();
  }
  if (turnstileSiteKey) void showChallenge(turnstileSiteKey);
  return close;
}

/**
 * The submission panel: a full-height modal dialog with a note's Markdown source in CodeMirror, a note for reviewers,
 * and the pull request link once submitted. Edit opens it on a published note's source; New page opens it blank,
 * under a title and a section. Loaded on the first click of either.
 */
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import {
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  type EditRequest,
  type EditResponse,
  type ErrorResponse,
  type NewPageRequest,
  type SourceResponse,
} from "./api";

/** What the panel submits: an edit of a published note, or a new note in one of `folders`. */
export type EditorTarget =
  | { readonly kind: "edit"; readonly page: string }
  | { readonly kind: "new"; readonly folders: readonly string[] };

export interface EditorInput {
  readonly target: EditorTarget;
  /** The plugin's URL path, deployment base included, without a trailing slash. */
  readonly endpoint: string;
  /** Focus returns here when the panel closes. */
  readonly opener: HTMLElement;
  /** Show the Turnstile challenge with this site key, and send its token with the submission. */
  readonly turnstileSiteKey?: string;
}

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

const panel = (target: EditorTarget) => `
<div class="svartz-submissions-panel">
  <header class="svartz-submissions-header">
    <h2 id="svartz-submissions-title">${target.kind === "edit" ? "Edit page" : "New page"}</h2>
    <button type="button" class="sv-icon-button" data-close aria-label="Close editor">${CLOSE_ICON}</button>
  </header>
  <form class="svartz-submissions-form" data-kind="${target.kind}" novalidate>${target.kind === "new" ? NEW_PAGE_FIELDS : ""}
    <div class="svartz-submissions-source">
      <p class="svartz-submissions-status" role="status">${target.kind === "edit" ? "Loading the page source…" : ""}</p>
    </div>
    <div class="svartz-submissions-note">
      <label class="sv-label" for="svartz-submissions-note">${target.kind === "edit" ? "What changed" : "Why add this page"}</label>
      <textarea id="svartz-submissions-note" name="note" rows="3" maxlength="${MAX_NOTE_LENGTH}"></textarea>
    </div>
    <div class="svartz-submissions-turnstile" hidden></div>
    <p class="svartz-submissions-error" data-sv-signal role="alert" hidden></p>
    <footer class="svartz-submissions-actions">
      <button type="submit" class="svartz-submissions-primary" disabled>Open pull request</button>
      <button type="button" class="sv-action" data-close>Cancel</button>
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
 * The last submission sent without a confirmed answer, by endpoint and page (`new` for new pages), so vaults on one
 * site never share an entry: its id and the exact fields sent under it. Sending the same fields again reuses the id, so
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
export function openEditor({ target, endpoint, opener, turnstileSiteKey }: EditorInput): () => void {
  const dialog = document.createElement("dialog");
  dialog.className = "svartz-submissions";
  dialog.setAttribute("aria-labelledby", "svartz-submissions-title");
  dialog.innerHTML = panel(target);
  const form = query<HTMLFormElement>(dialog, "form");
  const source = query<HTMLElement>(dialog, ".svartz-submissions-source");
  const note = query<HTMLTextAreaElement>(dialog, "textarea");
  const error = query<HTMLElement>(dialog, ".svartz-submissions-error");
  const actions = query<HTMLElement>(dialog, ".svartz-submissions-actions");
  const submit = query<HTMLButtonElement>(dialog, '[type="submit"]');
  const challenge = query<HTMLElement>(dialog, ".svartz-submissions-turnstile");
  const closers = dialog.querySelectorAll<HTMLButtonElement>("[data-close]");
  const title = dialog.querySelector<HTMLInputElement>('input[name="title"]');
  const folder = dialog.querySelector<HTMLSelectElement>('select[name="folder"]');
  if (target.kind === "new") {
    folder?.append(...target.folders.map((path) => Object.assign(document.createElement("option"), { value: path, textContent: sectionName(path) })));
  }
  let turnstile: { api: Turnstile; id: string } | undefined;

  const editable = new Compartment();
  let view: EditorView | undefined;
  let original = "";
  // The fields are locked while sending, so the pull request holds exactly what the reader sees. The panel can't be
  // dismissed then either: the reader would never see the pull request it opens.
  let phase: "editing" | "sending" | "sent" = "editing";
  /** Whether the error says the title is taken. */
  let conflict = false;
  /** Whether there is something to submit: a changed source, or a new page with a title and content. */
  const ready = () => {
    if (!view) return false;
    const markdown = view.state.sliceDoc();
    return target.kind === "edit" ? markdown !== original : Boolean(title?.value.trim() && markdown.trim());
  };
  /** Whether closing would lose anything the reader typed. */
  const typed = () => (view !== undefined && view.state.sliceDoc() !== original) || Boolean(note.value.trim() || title?.value.trim());

  function lock(locked: boolean) {
    view?.dispatch({ effects: editable.reconfigure(EditorView.editable.of(!locked)) });
    note.readOnly = locked;
    if (title) title.readOnly = locked;
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

  function close() {
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
    close();
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
  title?.addEventListener("input", () => {
    dropConflict();
    if (phase === "editing") submit.disabled = !ready();
  });
  folder?.addEventListener("change", dropConflict);

  /** The submission's route, its key in {@link unconfirmed}, and its fields, without its id or Turnstile token. */
  function fields(markdown: string) {
    if (target.kind === "edit") return { route: "edit", key: `${endpoint} ${target.page}`, fields: { page: target.page, markdown, note: note.value } };
    return { route: "new", key: `${endpoint} new`, fields: { folder: folder?.value ?? "", title: title?.value ?? "", markdown, note: note.value } };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!view || phase !== "editing" || !ready()) return;
    const turnstileToken = turnstile?.api.getResponse(turnstile.id);
    if (turnstileSiteKey && !turnstileToken) return showError({ message: UNVERIFIED });
    phase = "sending";
    lock(true);
    holdOpen(true);
    error.hidden = true;
    submit.disabled = true;
    submit.textContent = "Opening pull request…";
    const submission = fields(view.state.sliceDoc());
    const payload = JSON.stringify(submission.fields);
    const last = unconfirmed.get(submission.key);
    const submissionId = last?.payload === payload ? last.id : newSubmissionId();
    unconfirmed.set(submission.key, { id: submissionId, payload });
    try {
      const pull = await request<EditResponse>(`${endpoint}/${submission.route}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId, ...submission.fields, turnstileToken } satisfies EditRequest | NewPageRequest),
      });
      // The pull request holds these fields now and the panel stays locked; further typing would go nowhere.
      // Confirmed only once the reader can see the link: if navigation already closed the panel, the next panel
      // retries under this id and the server answers with the pull request this attempt opened.
      if (dialog.isConnected) unconfirmed.delete(submission.key);
      phase = "sent";
      challenge.hidden = true;
      holdOpen(false);
      showOpened(pull);
    } catch (cause) {
      phase = "editing";
      lock(false);
      holdOpen(false);
      // The server spent the token; a retry needs a fresh one.
      if (turnstile) turnstile.api.reset(turnstile.id);
      showError(cause as ServerError);
      submit.disabled = false;
      submit.textContent = "Open pull request";
    }
  });

  function showOpened(pull: EditResponse) {
    query<HTMLElement>(dialog, ".svartz-submissions-note").hidden = true;
    const status = Object.assign(document.createElement("p"), {
      className: "svartz-submissions-opened",
      textContent: `Opened pull request #${pull.number}.`,
    });
    status.setAttribute("role", "status");
    const link = Object.assign(document.createElement("a"), {
      className: "svartz-submissions-primary",
      href: pull.url,
      textContent: `View pull request #${pull.number}`,
      rel: "noopener",
      target: "_blank",
    });
    const done = Object.assign(document.createElement("button"), { type: "button", className: "sv-action", textContent: "Close" });
    done.dataset.close = "";
    actions.replaceChildren(status, link, done);
    link.focus();
  }

  /** CodeMirror on `markdown`, replacing the loading status. */
  function showSource(markdown: string) {
    original = markdown;
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
          ...(target.kind === "new" ? [placeholder("Write the page in Markdown.")] : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && phase === "editing") submit.disabled = !ready();
          }),
        ],
      }),
    });
  }

  async function load(page: string) {
    try {
      const { markdown } = await request<SourceResponse>(`${endpoint}/source/?page=${encodeURIComponent(page)}`);
      showSource(markdown);
      view?.focus();
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
  dialog.showModal();
  if (target.kind === "edit") {
    void load(target.page);
  } else {
    showSource("");
    title?.focus();
  }
  if (turnstileSiteKey) void showChallenge(turnstileSiteKey);
  return close;
}

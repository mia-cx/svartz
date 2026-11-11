/**
 * The edit panel: a full-height modal dialog with the note's Markdown source in CodeMirror, a "What changed" note,
 * and the pull request link once submitted. Loaded on the first click of Edit.
 */
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { MAX_NOTE_LENGTH, type EditRequest, type EditResponse, type ErrorResponse, type SourceResponse } from "./api";

export interface EditorInput {
  /** The note's route below the deployment base. */
  readonly page: string;
  /** The plugin's URL path, deployment base included, without a trailing slash. */
  readonly endpoint: string;
  /** Focus returns here when the panel closes. */
  readonly opener: HTMLElement;
  /** Show the Turnstile challenge with this site key, and send its token with the edit. */
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

const PANEL = `
<div class="svartz-submissions-panel">
  <header class="svartz-submissions-header">
    <h2 id="svartz-submissions-title">Edit page</h2>
    <button type="button" class="sv-icon-button" data-close aria-label="Close editor">${CLOSE_ICON}</button>
  </header>
  <form class="svartz-submissions-form" novalidate>
    <div class="svartz-submissions-source">
      <p class="svartz-submissions-status" role="status">Loading the page source…</p>
    </div>
    <div class="svartz-submissions-note">
      <label class="sv-label" for="svartz-submissions-note">What changed</label>
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

/** JSON from the plugin's server, or an `Error` whose message the reader can act on. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("Couldn't reach the site. Check your connection and try again.");
  }
  const body = await response.json().catch(() => undefined) as T | Partial<ErrorResponse> | undefined;
  if (!response.ok) {
    const message = (body as Partial<ErrorResponse> | undefined)?.message;
    throw new Error(typeof message === "string" ? message : `The site answered ${response.status}. Try again in a moment.`);
  }
  return body as T;
}

function query<E extends Element>(root: ParentNode, selector: string): E {
  const element = root.querySelector<E>(selector);
  if (!element) throw new Error(`[submissions] the edit panel has no ${selector}`);
  return element;
}

/** Open the panel for `page`. Returns a function that closes it without asking, for navigation cleanup. */
export function openEditor({ page, endpoint, opener, turnstileSiteKey }: EditorInput): () => void {
  const dialog = document.createElement("dialog");
  dialog.className = "svartz-submissions";
  dialog.setAttribute("aria-labelledby", "svartz-submissions-title");
  dialog.innerHTML = PANEL;
  const form = query<HTMLFormElement>(dialog, "form");
  const source = query<HTMLElement>(dialog, ".svartz-submissions-source");
  const note = query<HTMLTextAreaElement>(dialog, "textarea");
  const error = query<HTMLElement>(dialog, ".svartz-submissions-error");
  const actions = query<HTMLElement>(dialog, ".svartz-submissions-actions");
  const submit = query<HTMLButtonElement>(dialog, '[type="submit"]');
  const challenge = query<HTMLElement>(dialog, ".svartz-submissions-turnstile");
  let turnstile: { api: Turnstile; id: string } | undefined;

  const editable = new Compartment();
  let view: EditorView | undefined;
  let original = "";
  // The source and note are locked while sending, so the pull request holds exactly what the reader sees.
  let phase: "editing" | "sending" | "sent" = "editing";
  const edited = () => view !== undefined && view.state.sliceDoc() !== original;

  function lock(locked: boolean) {
    view?.dispatch({ effects: editable.reconfigure(EditorView.editable.of(!locked)) });
    note.readOnly = locked;
  }

  const showError = (message: string) => {
    error.textContent = message;
    error.hidden = false;
  };

  function close() {
    view?.destroy();
    if (turnstile) turnstile.api.remove(turnstile.id);
    dialog.close();
    dialog.remove();
    if (opener.isConnected) opener.focus();
  }

  /** Close on request, asking first when an unsubmitted edit would be lost. */
  function dismiss(): boolean {
    if (phase !== "sent" && (edited() || note.value.trim()) && !window.confirm("Discard your edit?")) return false;
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!view || phase !== "editing" || !edited()) return;
    const turnstileToken = turnstile?.api.getResponse(turnstile.id);
    if (turnstileSiteKey && !turnstileToken) return showError(UNVERIFIED);
    phase = "sending";
    lock(true);
    error.hidden = true;
    submit.disabled = true;
    submit.textContent = "Opening pull request…";
    try {
      const pull = await request<EditResponse>(`${endpoint}/edit/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page, markdown: view.state.sliceDoc(), note: note.value, turnstileToken } satisfies EditRequest),
      });
      // The pull request holds this text now and the panel stays locked; further typing would go nowhere.
      phase = "sent";
      challenge.hidden = true;
      showOpened(pull);
    } catch (cause) {
      phase = "editing";
      lock(false);
      // The server spent the token; a retry needs a fresh one.
      if (turnstile) turnstile.api.reset(turnstile.id);
      showError((cause as Error).message);
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

  async function load() {
    try {
      const { markdown } = await request<SourceResponse>(`${endpoint}/source/?page=${encodeURIComponent(page)}`);
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
            EditorView.updateListener.of((update) => {
              if (update.docChanged && phase === "editing") submit.disabled = !edited();
            }),
          ],
        }),
      });
      view.focus();
    } catch (cause) {
      source.replaceChildren();
      showError((cause as Error).message);
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
      showError((cause as Error).message);
    }
  }

  document.body.append(dialog);
  dialog.showModal();
  void load();
  if (turnstileSiteKey) void showChallenge(turnstileSiteKey);
  return close;
}

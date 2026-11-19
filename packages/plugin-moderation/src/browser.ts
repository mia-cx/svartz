/**
 * The Report action. The `moderation` plugin mounts this script on every page of its vault: a note gets **Report** in
 * its page actions (on a user page, `users/<handle>`, it reports the page or the account), and any element marked
 * `data-svartz-report="<kind>:<id>"` opens the same dialog for that target, named by `data-svartz-report-label`.
 * Annotations marks its comment cards this way; other plugins can mark their own views.
 *
 * A signed-out reader gets `@svartz/auth`'s sign-in dialog instead, and comes back to the page.
 */
import { openSignIn } from "@svartz/auth/browser";
import type { BrowserScriptContext } from "@svartz/core";
import { PLUGIN_ID, REASON_MAX_LENGTH, TARGET_KINDS, type BrowserOptions, type ReportRequest, type TargetKind } from "./api";

/** One thing the dialog can report, and how it names it. */
interface Choice {
  readonly kind: TargetKind;
  readonly id: string;
  readonly label: string;
}

const TRIGGER = "[data-svartz-report]";
const SVG_NS = "http://www.w3.org/2000/svg";
const SEND_FAILED = "Couldn't send your report. Try again.";
const TITLES: Readonly<Record<TargetKind, string>> = {
  page: "Report page", commit: "Report commit", submission: "Report submission", annotation: "Report comment", account: "Report account",
};

// Lucide "flag" and "x", as the theme's other actions draw their icons.
const FLAG = ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"];
const CLOSE = ["M18 6 6 18", "m6 6 12 12"];

function icon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true",
  })) svg.setAttribute(name, value);
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string, ...children: (Node | string)[]): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

/** The target an element marked `data-svartz-report` names, or `undefined` when its mark isn't one. */
function marked(trigger: HTMLElement): Choice | undefined {
  const mark = trigger.dataset.svartzReport ?? "";
  const split = mark.indexOf(":");
  const kind = mark.slice(0, split) as TargetKind;
  const id = mark.slice(split + 1);
  if (split < 1 || !id || !TARGET_KINDS.includes(kind)) return undefined;
  return { kind, id, label: trigger.dataset.svartzReportLabel ?? TITLES[kind] };
}

let ids = 0;

/** The dialog, ready to open: it sends to `endpoint`, and removes itself once closed. */
function render(choices: readonly Choice[], endpoint: string): HTMLDialogElement {
  const prefix = `sv-moderation-${++ids}`;
  const title = element("h2", "sv-moderation-title", choices.length === 1 ? TITLES[choices[0]!.kind] : "Report");
  title.id = `${prefix}-title`;
  const close = element("button", "sv-moderation-close", icon(CLOSE));
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  const head = element("div", "sv-moderation-head", title, close);

  // One target names itself; a choice lists each as a radio, the first checked.
  let subject: HTMLElement;
  if (choices.length === 1) {
    subject = element("p", "sv-moderation-subject", choices[0]!.label);
  } else {
    subject = element("fieldset", "sv-moderation-choices", element("legend", "", "What are you reporting?"));
    for (const [index, choice] of choices.entries()) {
      const radio = element("input", "");
      Object.assign(radio, { type: "radio", name: "target", value: String(index), id: `${prefix}-choice-${index}`, checked: index === 0 });
      const label = element("label", "", choice.label);
      label.htmlFor = radio.id;
      subject.append(element("div", "sv-moderation-choice", radio, label));
    }
  }

  const reason = element("textarea", "sv-moderation-reason-input");
  Object.assign(reason, { id: `${prefix}-reason`, name: "reason", rows: 4, maxLength: REASON_MAX_LENGTH, required: true });
  const reasonLabel = element("label", "", "What's wrong?");
  reasonLabel.htmlFor = reason.id;
  const problem = element("p", "sv-moderation-problem");
  problem.id = `${prefix}-problem`;
  problem.setAttribute("role", "alert");
  reason.setAttribute("aria-describedby", problem.id);
  const cancel = element("button", "sv-moderation-button", "Cancel");
  cancel.type = "button";
  const send = element("button", "sv-moderation-button sv-moderation-primary", "Send report");
  send.type = "submit";
  const form = element("form", "sv-moderation-body", head, subject,
    element("div", "sv-moderation-field", reasonLabel, reason), problem, element("div", "sv-moderation-actions", cancel, send));
  // Checked here, so the reason's problem reads out in the dialog's own words.
  form.noValidate = true;

  const dialog = element("dialog", "sv-moderation-dialog", form);
  dialog.setAttribute("aria-labelledby", title.id);
  reason.setAttribute("autofocus", "");
  close.addEventListener("click", () => dialog.close());
  cancel.addEventListener("click", () => dialog.close());
  // The form fills the dialog, so a click landing on the dialog itself came through the backdrop.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  let sending = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    if (!reason.value.trim()) {
      problem.textContent = "Say what's wrong before sending.";
      reason.setAttribute("aria-invalid", "true");
      reason.focus();
      return;
    }
    reason.removeAttribute("aria-invalid");
    const picked = form.querySelector<HTMLInputElement>('input[name="target"]:checked');
    const choice = choices[picked ? Number(picked.value) : 0]!;
    sending = true;
    send.setAttribute("aria-disabled", "true");
    problem.textContent = "";
    try {
      const response = await fetch(`${endpoint}/reports/`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ target: { kind: choice.kind, id: choice.id }, reason: reason.value } satisfies ReportRequest),
      });
      if (response.status === 401) {
        dialog.close();
        openSignIn();
        return;
      }
      if (!response.ok) {
        const answer = await response.json().catch(() => ({})) as { message?: string };
        problem.textContent = answer.message ?? SEND_FAILED;
        return;
      }
      sent(dialog, prefix);
    } catch (cause) {
      console.error("[svartz:moderation] couldn't send a report", cause);
      problem.textContent = SEND_FAILED;
    } finally {
      sending = false;
      send.removeAttribute("aria-disabled");
    }
  });
  return dialog;
}

/** Thank the reader, in place of the form, with Close focused. */
function sent(dialog: HTMLDialogElement, prefix: string): void {
  const title = element("h2", "sv-moderation-title", "Report sent");
  title.id = `${prefix}-sent`;
  const done = element("button", "sv-moderation-button sv-moderation-primary", "Close");
  done.type = "button";
  done.addEventListener("click", () => dialog.close());
  const body = element("div", "sv-moderation-body", title,
    element("p", "", "Thanks. A moderator will look at it."), element("div", "sv-moderation-actions", done));
  body.setAttribute("role", "status");
  dialog.replaceChildren(body);
  dialog.setAttribute("aria-labelledby", title.id);
  done.focus();
}

/**
 * Open the dialog for `choices`, or the sign-in dialog when nobody is signed in. Opening a modal hides every auto
 * popover, such as the comment card the opener sits in; they reopen, outermost first, when the dialog closes, and focus
 * goes back to the opener.
 */
async function openReport(choices: readonly Choice[], opener: HTMLElement, endpoint: string, me: string): Promise<void> {
  if (document.querySelector("dialog.sv-moderation-dialog[open]")) return;
  const signedIn = await fetch(me, { headers: { accept: "application/json" } })
    .then(async (response) => !response.ok || await response.json() !== null)
    // Unsure: let the server decide, which asks a signed-out reader to sign in.
    .catch(() => true);
  if (!signedIn) {
    openSignIn();
    return;
  }
  const popovers: HTMLElement[] = [];
  for (let node = opener.closest<HTMLElement>(":popover-open"); node; node = node.parentElement?.closest<HTMLElement>(":popover-open") ?? null) {
    popovers.unshift(node);
  }
  const dialog = render(choices, endpoint);
  dialog.addEventListener("close", () => {
    dialog.remove();
    for (const popover of popovers) if (popover.isConnected && !popover.matches(":popover-open")) popover.showPopover();
    if (opener.isConnected) opener.focus();
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
}

/**
 * Browser script entry: answer `data-svartz-report` buttons, and add **Report** to a note's page actions. The build
 * doesn't know a host app's `paths.base`, so the routes get the deployment base here, from `context`.
 */
export function mount(_pathname: string, { mountPath, userPages }: BrowserOptions, { base }: BrowserScriptContext = { base: "" }): () => void {
  const home = `${base}${mountPath}`;
  const endpoint = `${home}/_svartz/${PLUGIN_ID}`;
  const me = `${home}/_svartz/auth/me/`;
  const open = (choices: readonly Choice[], opener: HTMLElement) =>
    void openReport(choices, opener, endpoint, me).catch((cause: unknown) => console.error("[svartz:moderation] couldn't open the report dialog", cause));

  const onClick = (event: MouseEvent) => {
    const trigger = event.target instanceof Element ? event.target.closest<HTMLElement>(TRIGGER) : null;
    const choice = trigger && marked(trigger);
    if (!trigger || !choice) return;
    event.preventDefault();
    open([choice], trigger);
  };
  document.addEventListener("click", onClick);

  const note = document.querySelector<HTMLElement>("[data-svartz-note]")?.dataset.svartzNote;
  const region = document.querySelector('[data-svartz-region="page-actions"]');
  let action: HTMLButtonElement | undefined;
  if (note && region) {
    const handle = note.startsWith(`${userPages}/`) ? note.slice(userPages.length + 1) : "";
    // A user page is about its account: report either, the page as "This page" beside the account.
    const account = handle && !handle.includes("/");
    const title = document.querySelector("h1")?.textContent?.trim();
    const choices: Choice[] = [{ kind: "page", id: note, label: account || !title ? "This page" : title }];
    if (account) choices.push({ kind: "account", id: handle, label: `@${handle}'s account` });
    action = element("button", "", icon(FLAG), "Report");
    action.type = "button";
    action.addEventListener("click", () => open(choices, action!));
    region.append(action);
  }

  return () => {
    document.removeEventListener("click", onClick);
    action?.remove();
    // The dialog lives on <body>, outside the page, so client-side navigation alone would leave it open.
    document.querySelector("dialog.sv-moderation-dialog")?.remove();
  };
}

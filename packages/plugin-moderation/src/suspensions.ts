/**
 * The Suspensions panel, at `/-/dashboard/moderation/suspensions/`, for viewers holding `moderation:accounts:write`:
 * every suspension in force, and with `?handle=<handle>` the form that suspends that account, which also shows its
 * suspension in force and lifts it. The Reports panel and the Suspend action on user pages link here with a
 * `returnTo`, which the page offers to go back to. Its forms post to this plugin's `accounts/suspend/` and
 * `accounts/lift/` routes (`server.ts`), which come back here.
 */
import { can, findSuspension, listSuspensions, readAccount, type Account, type Suspension } from "@svartz/auth/server";
import type { DashboardPanel, PageContext, PluginPage } from "@svartz/core";
import { REASON_MAX_LENGTH } from "./api";
import { escape } from "./html";
import { panelPath, sameSitePath } from "./paths";
import { WRITE_ACCOUNTS } from "./permissions";

/** The panel's id below the plugin's, so it lives at `/-/dashboard/moderation/suspensions/`. */
export const SUSPENSIONS_PANEL = "suspensions";
const TITLE = "Suspensions";
/** The Reports panel's id, whose links back here are named as going back to it. */
const REPORTS_PANEL = "reports";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a suspension may last, as the form offers it and the route takes it: a Map, since the choice comes from a
 * form. `ms` is absent for good.
 */
export const DURATIONS: ReadonlyMap<string, { readonly label: string; readonly ms?: number }> = new Map([
  ["day", { label: "1 day", ms: DAY_MS }],
  ["week", { label: "1 week", ms: 7 * DAY_MS }],
  ["month", { label: "1 month", ms: 30 * DAY_MS }],
  ["for-good", { label: "For good" }],
]);

/** Longest handle the page looks up: well past any real one. */
const MAX_HANDLE_LENGTH = 64;

/** The Suspensions page for the account with `handle`, coming back to `returnTo` when the moderator is done. */
export function suspensionPath(context: Pick<PageContext, "base">, handle: string, returnTo?: string): string {
  const query = new URLSearchParams({ handle, ...returnTo !== undefined && { returnTo } });
  return `${panelPath(context, SUSPENSIONS_PANEL)}?${query}`;
}

/** What a form's `status` tells the moderator after it comes back. A Map: `status` comes from the URL. */
const STATUSES: ReadonlyMap<string, { text: (handle: string) => string; error?: true }> = new Map([
  ["suspended", { text: (handle: string) => `@${handle} is suspended.` }],
  ["lifted", { text: (handle: string) => `@${handle}'s suspension is lifted.` }],
  ["not-suspended", { text: (handle: string) => `@${handle} isn't suspended.`, error: true }],
  ["not-found", { text: (handle: string) => `No account has the handle @${handle}.`, error: true }],
  ["admin", { text: (handle: string) => `@${handle} is an admin, so they can't be suspended.`, error: true }],
  ["self", { text: () => "You can't suspend your own account.", error: true }],
  ["reason-invalid", { text: () => `Write a reason of up to ${REASON_MAX_LENGTH.toLocaleString("en-US")} characters.`, error: true }],
  ["duration-invalid", { text: () => "Choose how long the suspension lasts.", error: true }],
]);

const MOMENT = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const time = (iso: string) => `<time datetime="${escape(iso)}">${escape(MOMENT.format(new Date(iso)))} UTC</time>`;

/** "Until <time>" or "For good", as a sentence starts. */
const ends = ({ until }: Suspension) => until ? `Until ${time(until)}` : "For good";

function statusMessage(query: URLSearchParams, handle: string): string {
  const status = STATUSES.get(query.get("status") ?? "");
  if (!status) return "";
  return `<p class="sv-account-status" role="${status.error ? "alert" : "status"}"${status.error ? " data-error" : ""}>${escape(status.text(handle))}</p>`;
}

/** The handle a reader typed: trimmed, lowercase, without a leading `@`. */
const typedHandle = (input: string) => input.trim().replace(/^@/, "").toLowerCase();

/** Every suspension in force, and a box to find an account by handle. */
async function listPage(context: PageContext, query: URLSearchParams, missing?: string): Promise<PluginPage> {
  const here = panelPath(context, SUSPENSIONS_PANEL);
  const suspended = await listSuspensions(context.env);
  const items = suspended.map(({ handle, name, suspension }) => `<li class="sv-moderation-report">
<p class="sv-moderation-target"><a href="${escape(suspensionPath(context, handle))}">@${escape(handle)}</a> <span class="sv-account-muted">${escape(name)}</span></p>
<p class="sv-account-muted">${ends(suspension)}</p>
<div class="sv-moderation-reason"><p class="sv-account-muted">Reason</p><p>${escape(suspension.reason)}</p></div>
</li>`);
  return {
    title: TITLE,
    html: `<div class="sv-account sv-dashboard sv-moderation">
<h1>${TITLE}</h1>
${missing === undefined ? "" : statusMessage(new URLSearchParams({ status: "not-found" }), missing)}
<form class="sv-account-form sv-dashboard-grid sv-moderation-find" method="get" action="${escape(here)}">
<div class="sv-account-field"><label for="sv-moderation-find">Handle</label><input class="sv-account-input" id="sv-moderation-find" name="handle" required maxlength="${MAX_HANDLE_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false" value="${escape(missing ?? query.get("handle") ?? "")}"></div>
<div><button class="sv-account-button" type="submit">Find account</button></div>
</form>
${items.length ? `<ol class="sv-moderation-reports">${items.join("\n")}</ol>` : `<p class="sv-account-muted">No accounts are suspended.</p>`}
</div>`,
  };
}

/** The form that suspends the account with `handle`, with its suspension in force and the form that lifts it. */
async function accountPage(request: Request, context: PageContext, handle: string, viewer: Account): Promise<PluginPage> {
  const url = new URL(request.url);
  const query = url.searchParams;
  const subject = await findSuspension(handle, context.env);
  if (!subject) return listPage(context, query, handle);
  const back = sameSitePath(query.get("returnTo"), url);
  // Where every form here comes back to: this page, still offering the way back.
  const self = suspensionPath(context, subject.handle, back);
  const routes = `${context.base}/accounts`;
  const at = `@${escape(subject.handle)}`;
  const backLabel = back?.startsWith(panelPath(context, REPORTS_PANEL)) ? "Back to reports" : "Back";

  const current = subject.suspension
    ? `<section class="sv-account-status sv-moderation-suspension" data-error aria-labelledby="sv-moderation-current">
<h2 id="sv-moderation-current">Suspended${subject.suspension.until ? ` until ${time(subject.suspension.until)}` : " for good"}</h2>
<p class="sv-account-muted">Reason</p>
<p class="sv-moderation-reason-text">${escape(subject.suspension.reason)}</p>
<form method="post" action="${escape(`${routes}/lift/`)}"><input type="hidden" name="handle" value="${escape(subject.handle)}"><input type="hidden" name="returnTo" value="${escape(self)}"><button class="sv-account-button" type="submit">Lift suspension</button></form>
</section>`
    : "";

  let form: string;
  if (subject.admin) form = `<p>${at} is an admin, so they can't be suspended.</p>`;
  else if (subject.id === viewer.id) form = "<p>You can't suspend your own account.</p>";
  else {
    const choices = [...DURATIONS].map(([value, { label }], index) =>
      `<div class="sv-moderation-choice"><input type="radio" name="duration" value="${value}" id="sv-moderation-duration-${value}"${index === 0 ? " checked" : ""}><label for="sv-moderation-duration-${value}">${label}</label></div>`);
    form = `<form class="sv-account-form" method="post" action="${escape(`${routes}/suspend/`)}">
<input type="hidden" name="handle" value="${escape(subject.handle)}"><input type="hidden" name="returnTo" value="${escape(self)}">
<fieldset class="sv-moderation-choices"><legend>For how long</legend>${choices.join("")}</fieldset>
<div class="sv-account-field sv-moderation-field"><label for="sv-moderation-reason">Reason</label><textarea class="sv-moderation-reason-input" id="sv-moderation-reason" name="reason" rows="4" required maxlength="${REASON_MAX_LENGTH}" aria-describedby="sv-moderation-reason-hint"></textarea><p class="sv-account-hint" id="sv-moderation-reason-hint">${at} sees this reason.</p></div>
<div><button class="sv-account-button" data-primary type="submit">${subject.suspension ? "Replace suspension" : `Suspend ${at}`}</button></div>
</form>`;
  }

  return {
    title: `Suspend @${subject.handle}`,
    html: `<div class="sv-account sv-dashboard sv-moderation">
${back ? `<p class="sv-moderation-back"><a href="${escape(back)}">${backLabel}</a></p>` : ""}
<h1>Suspend ${at}</h1>
<p class="sv-account-muted">${escape(subject.name)}</p>
${statusMessage(query, subject.handle)}
${current}
${form}
</div>`,
  };
}

/** The Suspensions panel, which the dashboard shows to viewers holding `moderation:accounts:write` on the vault. */
export const suspensionsPanel: DashboardPanel = {
  id: SUSPENSIONS_PANEL,
  title: TITLE,
  permission: WRITE_ACCOUNTS,
  async render(request, context) {
    if (context.path !== "") return undefined;
    // The dashboard checked this before rendering; checked again so the panel holds on its own.
    const viewer = await readAccount(request, context.env);
    if (!viewer || !await can(viewer, WRITE_ACCOUNTS, { vault: context.vault.id }, context.env)) return undefined;
    const query = new URL(request.url).searchParams;
    const asked = query.get("handle");
    if (asked === null) return listPage(context, query);
    const handle = typedHandle(asked);
    if (!handle || handle.length > MAX_HANDLE_LENGTH) return undefined;
    return accountPage(request, context, handle, viewer);
  },
};

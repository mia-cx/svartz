/**
 * The Audit log panel, at `/-/dashboard/moderation/audit/`, for viewers holding `moderation:audit:read`: every entry in
 * auth's audit log from every plugin, newest first, a page at a time. `?actor=<handle>` keeps the entries one account
 * made and `?target=<target>` those on one target, as GET parameters so a filtered view can be linked; `?before=<id>`
 * pages. The log is append-only, so the panel only reads, one query a page.
 */
import { can, readAccount, readAuditLog, type AuditRecord } from "@svartz/auth/server";
import type { DashboardPanel, PageContext, PluginPage } from "@svartz/core";
import { escape } from "./html";
import { panelPath } from "./paths";
import { READ_AUDIT } from "./permissions";

/** The panel's id below the plugin's, so it lives at `/-/dashboard/moderation/audit/`. */
export const AUDIT_PANEL = "audit";
const TITLE = "Audit log";

/** Longest filter the panel takes: past any handle or object string. A longer one is a 404, never a query. */
const MAX_FILTER_LENGTH = 512;
/** An entry id from the previous page. */
const CURSOR = /^[1-9]\d{0,15}$/;

const MOMENT = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** What the view is filtered by, and where it starts. */
interface View {
  readonly actor?: string;
  readonly target?: string;
  readonly before?: number;
}

/** `query` as a view, or `undefined` when a parameter can't be one. Empty filters are no filter, as an empty form sends. */
function viewOf(query: URLSearchParams): View | undefined {
  const actor = query.get("actor")?.trim().replace(/^@/, "").toLowerCase() || undefined;
  const target = query.get("target")?.trim() || undefined;
  const before = query.get("before");
  if ((actor?.length ?? 0) > MAX_FILTER_LENGTH || (target?.length ?? 0) > MAX_FILTER_LENGTH) return undefined;
  if (before !== null && !CURSOR.test(before)) return undefined;
  return { ...actor && { actor }, ...target && { target }, ...before !== null && { before: Number(before) } };
}

/** The panel's address for `view`. */
function href(context: PageContext, { actor, target, before }: View): string {
  const query = new URLSearchParams({ ...actor && { actor }, ...target && { target }, ...before !== undefined && { before: String(before) } });
  const search = query.toString();
  return `${panelPath(context, AUDIT_PANEL)}${search ? `?${search}` : ""}`;
}

/** A detail value as text: strings as they are, anything else as JSON. */
const shown = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value) ?? String(value);

function entryItem(entry: AuditRecord, context: PageContext, view: View): string {
  const detail = Object.entries(entry.detail);
  const details = detail.length
    ? `<dl class="sv-moderation-detail">${detail.map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${escape(shown(value))}</dd></div>`).join("")}</dl>`
    : "";
  // Who and what link to the log filtered by them, keeping the other filter.
  const who = `<a href="${escape(href(context, { target: view.target, actor: entry.actor }))}">@${escape(entry.actor)}</a>`;
  const what = `<a href="${escape(href(context, { actor: view.actor, target: entry.target }))}"><code>${escape(entry.target)}</code></a>`;
  return `<li class="sv-moderation-report">
<p class="sv-moderation-meta"><code class="sv-moderation-action">${escape(entry.action)}</code> <span class="sv-account-muted"><time datetime="${escape(entry.at)}">${escape(MOMENT.format(new Date(entry.at)))} UTC</time></span></p>
<p class="sv-moderation-target">${who} on ${what}</p>
${details}
</li>`;
}

async function logPage(context: PageContext, view: View): Promise<PluginPage> {
  const { entries, next } = await readAuditLog(context.env, view);
  const filtered = view.actor !== undefined || view.target !== undefined;
  const pages = [
    view.before !== undefined ? `<a href="${escape(href(context, { actor: view.actor, target: view.target }))}">Newest entries</a>` : "",
    next !== undefined ? `<a href="${escape(href(context, { actor: view.actor, target: view.target, before: next }))}">Older entries</a>` : "",
  ].filter(Boolean);
  const empty = filtered ? "No entries match." : "Nothing is recorded yet.";
  return {
    title: TITLE,
    html: `<div class="sv-account sv-dashboard sv-moderation">
<h1>${TITLE}</h1>
<form class="sv-account-form sv-dashboard-grid sv-moderation-filters" method="get" action="${escape(panelPath(context, AUDIT_PANEL))}">
<div class="sv-account-field"><label for="sv-moderation-actor">Who</label><input class="sv-account-input" id="sv-moderation-actor" name="actor" value="${escape(view.actor ?? "")}" maxlength="${MAX_FILTER_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="sv-moderation-actor-hint"><p class="sv-account-hint" id="sv-moderation-actor-hint">A handle, such as ada.</p></div>
<div class="sv-account-field"><label for="sv-moderation-target">On what</label><input class="sv-account-input" id="sv-moderation-target" name="target" value="${escape(view.target ?? "")}" maxlength="${MAX_FILTER_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="sv-moderation-target-hint"><p class="sv-account-hint" id="sv-moderation-target-hint">Exactly as listed, such as account:ada.</p></div>
<div class="sv-moderation-filter-actions"><button class="sv-account-button" type="submit">Filter</button>${filtered ? `<a class="sv-account-button" href="${escape(panelPath(context, AUDIT_PANEL))}">Clear filters</a>` : ""}</div>
</form>
${entries.length ? `<ol class="sv-moderation-reports">${entries.map((entry) => entryItem(entry, context, view)).join("\n")}</ol>` : `<p class="sv-account-muted">${empty}</p>`}
${pages.length ? `<nav class="sv-moderation-pages" aria-label="Audit log pages">${pages.join("")}</nav>` : ""}
</div>`,
  };
}

/** The Audit log panel, which the dashboard shows to viewers holding `moderation:audit:read` on the vault. */
export const auditPanel: DashboardPanel = {
  id: AUDIT_PANEL,
  title: TITLE,
  permission: READ_AUDIT,
  async render(request, context) {
    if (context.path !== "") return undefined;
    // The dashboard checked this before rendering; checked again so the panel holds on its own.
    if (!await can(await readAccount(request, context.env), READ_AUDIT, { vault: context.vault.id }, context.env)) return undefined;
    const view = viewOf(new URL(request.url).searchParams);
    return view && logPage(context, view);
  },
};

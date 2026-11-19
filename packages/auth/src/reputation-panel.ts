/**
 * Auth's Reputation and Kudos panels, and the `reputation/` routes their forms post to:
 *
 * - `POST reputation/points/` sets every weight and the daily limit, each a number within its bounds.
 * - `POST reputation/threshold/` sets the `score` at which accounts get stored role `role`;
 *   `POST reputation/threshold/remove/` removes `role`'s threshold.
 * - `POST reputation/kudos/` gives account `handle` kudos, with a `reason`.
 *
 * Points and thresholds need `auth:grants:write`, since a threshold gives roles as a grant does; kudos need
 * `auth:kudos:write`. Each route answers 403 to a request from another origin, or from anyone without its permission
 * on the vault, whatever the panel showed them; then redirects back to its panel with `?status=<code>`.
 */
import type { DashboardPanel, ServerContext } from "@svartz/core";
import { GRANTS_READ, GRANTS_WRITE, KUDOS_WRITE } from "./auth-permissions";
import { dashboardPath } from "./dashboard";
import { can } from "./grants";
import { typedHandle } from "./handle";
import { listRoles, personByHandle, roleExists } from "./people";
import { giveKudos, listThresholds, readSettings, removeThreshold, saveSettings, setThreshold, THRESHOLD_MAX, type ReputationSettings } from "./reputation";
import { kudosPage, KUDOS_TITLE, REASON_MAX_LENGTH, reputationPage, REPUTATION_TITLE, SETTING_FIELDS, type ReputationStatus } from "./reputation-page";
import { ADMIN_ROLE, readAccount, readCurrentSession } from "./session";
import { accountsDatabase } from "./store";

const REPUTATION_PANEL = "reputation";
const KUDOS_PANEL = "kudos";

const panelPath = (context: ServerContext, panel: string) => `${dashboardPath(context)}auth/${panel}/`;
const routeBase = (context: ServerContext) => `${context.base}/reputation`;

/** The Reputation panel: points and thresholds, which anyone who may see grants may see. */
export const reputationPanel: DashboardPanel = {
  id: REPUTATION_PANEL,
  title: REPUTATION_TITLE,
  permission: GRANTS_READ,
  async render(request, context) {
    if (context.path !== "") return undefined;
    // The dashboard showed this panel because it found accounts.
    const db = (await accountsDatabase(context.env))!;
    const viewer = await readAccount(request, context.env);
    const [canWrite, settings, thresholds, roles] = await Promise.all([
      can(viewer, GRANTS_WRITE, { vault: context.vault.id }, context.env),
      readSettings(db),
      listThresholds(db),
      listRoles(db),
    ]);
    const base = routeBase(context);
    return reputationPage({
      canWrite, settings, thresholds, roles: roles.map(({ name }) => name), query: new URL(request.url).searchParams,
      actions: { points: `${base}/points/`, threshold: `${base}/threshold/`, removeThreshold: `${base}/threshold/remove/` },
    });
  },
};

/** The Kudos panel, for moderators who may give kudos. */
export const kudosPanel: DashboardPanel = {
  id: KUDOS_PANEL,
  title: KUDOS_TITLE,
  permission: KUDOS_WRITE,
  async render(request, context) {
    if (context.path !== "") return undefined;
    const db = (await accountsDatabase(context.env))!;
    const { kudos } = await readSettings(db);
    return kudosPage({ points: kudos, query: new URL(request.url).searchParams, action: `${routeBase(context)}/kudos/` });
  },
};

const failure = (status: number, error: string, message: string, headers: Record<string, string> = {}) =>
  Response.json({ error, message }, { status, headers: { "cache-control": "no-store", ...headers } });

/** Back to `panel` after a form, with `status` and the fields it concerns. */
function back(context: ServerContext, url: URL, panel: string, status: ReputationStatus, fields: Record<string, string> = {}): Response {
  const target = new URL(panelPath(context, panel), url.origin);
  target.searchParams.set("status", status);
  for (const [key, value] of Object.entries(fields)) target.searchParams.set(key, value);
  return new Response(null, { status: 303, headers: { location: `${target.pathname}${target.search}`, "cache-control": "no-store" } });
}

/** A finite number within `bounds`, to two decimals, from a form field; `undefined` for anything else. */
function bounded(text: string, { min, max }: { readonly min: number; readonly max: number }): number | undefined {
  if (text.trim() === "") return undefined;
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max) return undefined;
  return Math.round(value * 100) / 100;
}

/** A kudos reason: trimmed, 1 to {@link REASON_MAX_LENGTH} characters, on one line. */
function reasonOf(text: string): string | undefined {
  const reason = text.trim();
  return reason && [...reason].length <= REASON_MAX_LENGTH && !/\p{Cc}/u.test(reason) ? reason : undefined;
}

const ROUTE = /^\/reputation\/(points|threshold|threshold\/remove|kudos)\/$/;

/** Answer a `reputation/` route, or `undefined` when `path` (below `/_svartz/auth`) names none. */
export async function reputationRoute(request: Request, path: string, context: ServerContext): Promise<Response | undefined> {
  const action = ROUTE.exec(path)?.[1];
  if (!action) return undefined;
  if (request.method !== "POST") return failure(405, "method_not_allowed", "Use POST.", { allow: "POST" });
  const url = new URL(request.url);
  // Browsers name the page's origin on every POST: anything else is forged, or from a client that can't be checked.
  if (request.headers.get("origin") !== url.origin) return failure(403, "cross_origin", "Change reputation on this site.");
  const permission = action === "kudos" ? KUDOS_WRITE : GRANTS_WRITE;
  const db = await accountsDatabase(context.env);
  const session = db && await readCurrentSession(request, context.env);
  if (!db || !session || !await can(session.account, permission, { vault: context.vault.id }, context.env)) {
    return failure(403, "forbidden", action === "kudos" ? "You can't give kudos here." : "You can't change reputation here.");
  }
  const actor = { id: session.account.id, handle: session.account.handle };
  const form = await request.formData().catch(() => undefined);
  const field = (name: string) => String(form?.get(name) ?? "").trim();

  if (action === "points") {
    const typed = Object.fromEntries(SETTING_FIELDS.map(({ field: name }) => [name, field(name)]));
    const parsed = SETTING_FIELDS.map(({ name, field: input, bounds }) => ({ name, input, value: bounded(typed[input]!, bounds) }));
    const refused = parsed.find(({ value }) => value === undefined);
    if (refused) return back(context, url, REPUTATION_PANEL, "points-invalid", { ...typed, invalid: refused.input });
    // Every setting parsed to a number in bounds just above.
    await saveSettings(db, actor, Object.fromEntries(parsed.map(({ name, value }) => [name, value])) as ReputationSettings);
    return back(context, url, REPUTATION_PANEL, "points-saved");
  }

  if (action === "threshold" || action === "threshold/remove") {
    const role = field("role").toLowerCase();
    if (role === ADMIN_ROLE || !await roleExists(db, role)) return back(context, url, REPUTATION_PANEL, "role-unknown", { role, score: field("score") });
    if (action === "threshold/remove") {
      await removeThreshold(db, actor, role);
      return back(context, url, REPUTATION_PANEL, "threshold-removed", { role });
    }
    const score = bounded(field("score"), { min: 0, max: THRESHOLD_MAX });
    if (score === undefined || score === 0) return back(context, url, REPUTATION_PANEL, "threshold-invalid", { role, score: field("score") });
    await setThreshold(db, actor, { role, score });
    return back(context, url, REPUTATION_PANEL, "threshold-saved", { role });
  }

  const handle = typedHandle(field("handle"));
  const typed = { handle, reason: field("reason") };
  const refuse = (status: ReputationStatus) => back(context, url, KUDOS_PANEL, status, typed);
  const reason = reasonOf(typed.reason);
  if (!reason) return refuse("reason-invalid");
  const person = await personByHandle(db, handle);
  if (!person) return refuse("account-unknown");
  if (person.id === actor.id) return refuse("kudos-self");
  const given = await giveKudos(db, actor, person, reason);
  if (given !== "given") return refuse(given === "already" ? "kudos-already" : "kudos-limit");
  return back(context, url, KUDOS_PANEL, "kudos-given", { handle: person.handle });
}

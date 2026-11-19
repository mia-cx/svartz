/**
 * The `groups/` routes, each group's page, the account page's Groups section, and the moderators' Groups panel.
 *
 * Routes, under `<mount>/_svartz/auth/`, each a form POST that redirects back with `?status=<code>`:
 * - `POST groups/` creates group `name`, titled `display-name`, owned by the signed-in account.
 * - `POST groups/<name>/invite/` invites account `handle`; owners only.
 * - `POST groups/<name>/uninvite/` withdraws `handle`'s invitation: an owner withdraws anyone's, the invited declines theirs.
 * - `POST groups/<name>/accept/` accepts the signed-in account's own invitation.
 * - `POST groups/<name>/remove/` takes `handle` out: an owner removes anyone, a member leaves. Never the last owner.
 * - `POST groups/<name>/promote/` makes member `handle` an owner; owners only.
 * - `POST groups/link/` links `group` to the object `scope` and `path` name, and `POST groups/unlink/` unlinks it from
 *   `object`: only for holders of `auth:group-links:write` on the vault, and audited.
 *
 * Every route acts as the signed-in account and nobody else, and answers 403 to a request from another origin. A group's
 * page and its member routes answer 404 to anyone outside it, so they never show who belongs to a group.
 */
import { decodeRoutePath, type DashboardPanel, type PageContext, type PageResult, type ServerContext } from "@svartz/core";
import { displayName } from "./account";
import { GROUP_LINKS_WRITE } from "./auth-permissions";
import { dashboardPath } from "./dashboard";
import { can, mayOn } from "./grants";
import {
  accept, createGroup, groupDetail, groupExists, groupsOf, invite, isGroupName, link, listGroups, promote, removeFromGroup,
  standing, uninvite, unlink,
} from "./groups";
import { accountGroupsSection, groupPage, groupsPanelPage, GROUPS_TITLE, type GroupStatus } from "./groups-page";
import { typedHandle } from "./handle";
import { chainOf, pickedObject, pickerFields } from "./objects";
import { personByHandle } from "./people";
import { SITE } from "./permissions";
import { readCurrentSession } from "./session";
import { accountsDatabase, type Database } from "./store";

/** The panel's id below auth's, so it lives at `/-/dashboard/auth/groups/`. */
const PANEL = "groups";

/** The vault's site root, from any of its plugins' contexts: `<base><mount>`. */
const root = (context: Pick<ServerContext, "base">) => context.base.replace(/\/_svartz\/[^/]+$/, "");
const accountPath = (context: ServerContext) => `${root(context)}/-/account/`;
const groupPath = (context: ServerContext, name: string) => `${root(context)}/-/groups/${encodeURIComponent(name)}/`;
const panelPath = (context: ServerContext) => `${dashboardPath(context)}auth/${PANEL}/`;

const failure = (status: number, error: string, message: string, headers: Record<string, string> = {}) =>
  Response.json({ error, message }, { status, headers: { "cache-control": "no-store", ...headers } });
const notFound = () => failure(404, "not_found", "There's no such group.");

/** A 303 to `path` with `status` and the fields it concerns, at `section`. */
function back(url: URL, path: string, status: GroupStatus, fields: Record<string, string>, section: string): Response {
  const target = new URL(path, url.origin);
  target.searchParams.set("status", status);
  for (const [key, value] of Object.entries(fields)) target.searchParams.set(key, value);
  return new Response(null, { status: 303, headers: { location: `${target.pathname}${target.search}#${section}`, "cache-control": "no-store" } });
}

const ROUTE = /^\/groups\/(?:(link|unlink)\/|([^/]+)\/(invite|uninvite|accept|remove|promote)\/)?$/;

/** Answer a `groups/` route, or `undefined` when `path` (below `/_svartz/auth`) names none. */
export async function groupsRoute(request: Request, path: string, context: ServerContext, vaults: readonly string[]): Promise<Response | undefined> {
  const match = ROUTE.exec(path);
  if (!match) return undefined;
  if (request.method !== "POST") return failure(405, "method_not_allowed", "Use POST.", { allow: "POST" });
  const url = new URL(request.url);
  // Browsers name the page's origin on every POST: anything else is forged, or from a client that can't be checked.
  if (request.headers.get("origin") !== url.origin) return failure(403, "cross_origin", "Change groups on this site.");
  const db = await accountsDatabase(context.env);
  if (!db) return failure(503, "misconfigured", "Bind a D1 database as SVARTZ_DB to give readers accounts.");
  const session = await readCurrentSession(request, context.env);
  if (!session) return new Response(null, { status: 303, headers: { location: accountPath(context), "cache-control": "no-store" } });
  const actor = { id: session.account.id, handle: session.account.handle };
  const form = await request.formData().catch(() => undefined);
  const field = (name: string) => String(form?.get(name) ?? "").trim();
  const [, linking, encoded, action] = match;

  if (linking) {
    if (!await can(session.account, GROUP_LINKS_WRITE, { vault: context.vault.id }, context.env)) {
      return failure(403, "forbidden", "You can't link groups here.");
    }
    const name = typedHandle(field("group"));
    const sent = linking === "unlink" ? pickerFields(field("object")) : { scope: field("scope"), path: field("path") };
    const typed = { group: name, scope: sent.scope, path: sent.path };
    const to = (status: GroupStatus, fields: Record<string, string> = { group: name }) => back(url, panelPath(context), status, fields, "sv-dashboard-link");
    if (!await groupExists(db, name)) return to("group-link-unknown", typed);
    const object = pickedObject(sent.scope, sent.path, vaults);
    // Only a vault, a folder or a page: an owner of a group linked to the site would hold every permission everywhere.
    if (!object || object === SITE) return to("group-link-invalid", typed);
    // The link lands on `object`, which may be in another vault than the panel the form came from.
    if (!await mayOn(db, session.account, GROUP_LINKS_WRITE, chainOf(object))) return failure(403, "forbidden", "You can't link groups there.");
    if (linking === "unlink") {
      // A whole object string must name exactly what the picker would.
      if (object !== field("object")) return to("group-link-invalid", typed);
      await unlink(db, actor, name, object);
      return to("group-unlinked");
    }
    return to(await link(db, actor, name, object) ? "group-linked" : "group-link-held");
  }

  if (!encoded) return create(url, context, db, actor, field("name"), field("display-name"));
  const name = decodeRoutePath(encoded);
  if (name === undefined || !isGroupName(name)) return notFound();
  const mine = await standing(db, name, actor.id);
  const page = groupPath(context, name);
  const toGroup = (status: GroupStatus, handle?: string) => back(url, page, status, handle === undefined ? {} : { handle }, "sv-group-members");
  const toAccount = (status: GroupStatus) => back(url, accountPath(context), status, { group: name }, "sv-account-groups");

  if (action === "accept") return await accept(db, actor, name) ? toGroup("group-joined") : toAccount("group-invitation-gone");

  const handle = typedHandle(field("handle"));
  const person = await personByHandle(db, handle);
  const self = person?.id === actor.id;
  if (action === "uninvite" && self) return toAccount(await uninvite(db, actor, name, person) ? "group-declined" : "group-invitation-gone");
  // Everything else is for the group's own members, and only leaving is for members who don't own it.
  if (!mine) return notFound();
  if (mine !== "owner" && !(action === "remove" && self)) return failure(403, "forbidden", "Only the group's owners can do that.");

  if (action === "invite") {
    if (!person) return toGroup("group-invite-unknown", handle);
    if (await invite(db, actor, name, person)) return toGroup("group-invited", person.handle);
    return toGroup(await standing(db, name, person.id) ? "group-invite-member" : "group-invite-pending", person.handle);
  }
  if (!person) return notFound();
  if (action === "uninvite") {
    await uninvite(db, actor, name, person);
    return toGroup("group-withdrawn", person.handle);
  }
  if (action === "promote") {
    await promote(db, actor, name, person);
    return await standing(db, name, person.id) === "owner" ? toGroup("group-promoted", person.handle) : notFound();
  }
  if (await removeFromGroup(db, actor, name, person)) return self ? toAccount("group-left") : toGroup("group-removed", person.handle);
  return await standing(db, name, person.id) === "owner" ? toGroup("group-last-owner") : notFound();
}

async function create(url: URL, context: ServerContext, db: Database, actor: { id: string; handle: string }, typedName: string, typedDisplay: string): Promise<Response> {
  const name = typedHandle(typedName);
  const refuse = (status: GroupStatus) => back(url, accountPath(context), status, { name, "display-name": typedDisplay, group: name }, "sv-account-groups");
  const title = displayName(typedDisplay);
  if (!title) return refuse("group-display-name-invalid");
  if (!isGroupName(name)) return refuse("group-name-invalid");
  if (await createGroup(db, actor, { name, displayName: title }) === "taken") return refuse("group-name-taken");
  return back(url, groupPath(context, name), "group-created", {}, "sv-group-members");
}

/** The account page's Groups section for the signed-in account. */
export async function accountGroups(db: Database, account: { id: string; handle: string }, context: ServerContext, query: URLSearchParams): Promise<string> {
  const { groups, invitations } = await groupsOf(db, account.id);
  const action = (name: string, step: string) => `${context.base}/groups/${encodeURIComponent(name)}/${step}/`;
  return accountGroupsSection({
    groups, invitations, page: (name) => groupPath(context, name),
    actions: { create: `${context.base}/groups/`, accept: (name) => action(name, "accept"), decline: (name) => action(name, "uninvite") },
  }, account.handle, query);
}

/** Render `groups/<name>/` for its members; `undefined`, the 404, for everyone else and every other path. */
export async function groupsPage(request: Request, context: PageContext): Promise<PageResult | undefined> {
  const name = /^groups\/([^/]+)\/$/.exec(context.path)?.[1];
  const db = await accountsDatabase(context.env);
  if (name === undefined || !db || !isGroupName(name)) return undefined;
  const session = await readCurrentSession(request, context.env);
  const mine = session && await standing(db, name, session.account.id);
  const group = mine && await groupDetail(db, name);
  if (!session || !group) return undefined;
  const action = (step: string) => `${context.base}/groups/${encodeURIComponent(name)}/${step}/`;
  return groupPage({
    group, handle: session.account.handle, owner: mine === "owner", account: accountPath(context),
    query: new URL(request.url).searchParams,
    actions: { invite: action("invite"), uninvite: action("uninvite"), remove: action("remove"), promote: action("promote") },
  });
}

/** The moderators' Groups panel: link groups to objects, with every group's owners and links. */
export function groupsPanel({ vaults, paths }: { vaults: (context: ServerContext) => readonly string[]; paths: readonly string[] }): DashboardPanel {
  return {
    id: PANEL,
    title: GROUPS_TITLE,
    permission: GROUP_LINKS_WRITE,
    async render(request, context) {
      if (context.path !== "") return undefined;
      // The dashboard showed this panel because it found accounts; it checked the viewer's permission just now.
      const db = (await accountsDatabase(context.env))!;
      return groupsPanelPage({
        groups: await listGroups(db), vaults: vaults(context), paths, query: new URL(request.url).searchParams,
        actions: { link: `${context.base}/groups/link/`, unlink: `${context.base}/groups/unlink/` },
      });
    },
  };
}

/**
 * Auth's dashboard panel, People & permissions, and the `people/` routes its forms post to:
 *
 * - `POST people/grant/` sets an account's, a role's or a group's grant: `actor-type`, `actor`, `permission`, `value`, and the
 *   object as `scope` and `path`, or whole as `object`.
 * - `POST people/role/` creates role `name`.
 * - `POST people/member/` gives account `handle` role `role`; `POST people/member/remove/` takes it away.
 *
 * Each route answers 403 to a request from another origin, or from anyone without `auth:grants:write` on the vault,
 * whatever the panel showed them; then redirects back to the panel with `?status=<code>`.
 */
import type { DashboardPanel, ServerContext } from "@svartz/core";
import { GRANTS_READ, GRANTS_WRITE } from "./auth-permissions";
import { dashboardPath } from "./dashboard";
import { can, explain, isDeclared, mayOn, permissionCatalogue } from "./grants";
import { groupExists, listGroups } from "./groups";
import { typedHandle } from "./handle";
import { chainOf, pickedObject, pickerFields } from "./objects";
import { addMember, createRole, isRoleName, listGrants, listRoles, personByHandle, removeMember, roleExists, searchPeople, setGrant } from "./people";
import { peoplePage, PEOPLE_TITLE, type Check, type PeopleStatus } from "./people-page";
import { SITE } from "./permissions";
import { ADMIN_ROLE, readAccount, readCurrentSession } from "./session";
import { accountsDatabase } from "./store";

/** The panel's id below auth's, so it lives at `/-/dashboard/auth/people/`. */
const PANEL = "people";

/** What the panel needs beyond the request: the vaults that share accounts and this vault's folders and pages. */
export interface PeopleOptions {
  readonly vaults: (context: ServerContext) => readonly string[];
  readonly paths: readonly string[];
}

const panelPath = (context: ServerContext) => `${dashboardPath(context)}auth/${PANEL}/`;

/** The account the check asks about, from the panel's query; a problem to show instead when it names none. */
async function check(query: URLSearchParams, context: ServerContext, vaults: readonly string[]): Promise<Check | undefined> {
  const handle = query.get("check");
  if (handle === null) return undefined;
  const db = (await accountsDatabase(context.env))!;
  const permission = query.get("check-permission") ?? "";
  const object = pickedObject(query.get("check-scope") ?? "", query.get("check-path") ?? "", vaults);
  if (!isDeclared(permission)) return { problem: "Choose a permission from the list." };
  if (!object) return { problem: "Enter a folder ending in /, like garden/, or a page, like garden/roses, or leave it empty." };
  const person = await personByHandle(db, typedHandle(handle));
  if (!person) return { problem: `No account has the handle @${typedHandle(handle)}.` };
  const declaration = permissionCatalogue().find(({ slug }) => slug === permission)!;
  return { person, permission: declaration, object, answer: await explain(db, person, permission, chainOf(object)) };
}

/** Auth's People & permissions panel. */
export function peoplePanel({ vaults, paths }: PeopleOptions): DashboardPanel {
  return {
    id: PANEL,
    title: PEOPLE_TITLE,
    permission: GRANTS_READ,
    async render(request, context) {
      if (context.path !== "") return undefined;
      // The dashboard showed this panel because it found accounts; it checked the viewer's permission just now.
      const db = (await accountsDatabase(context.env))!;
      const viewer = await readAccount(request, context.env);
      const query = new URL(request.url).searchParams;
      const search = query.get("people")?.trim().replace(/^@/, "");
      const base = `${context.base}/people`;
      const [canWrite, grants, roles, groups, people, checked] = await Promise.all([
        can(viewer, GRANTS_WRITE, { vault: context.vault.id }, context.env),
        listGrants(db),
        listRoles(db),
        listGroups(db),
        search ? searchPeople(db, search).then((results) => ({ query: search, results })) : undefined,
        check(query, context, vaults(context)),
      ]);
      return peoplePage({
        canWrite, catalogue: permissionCatalogue(), grants, roles, groups: groups.map(({ name }) => name), people, check: checked, vaults: vaults(context), paths,
        query, here: panelPath(context),
        actions: { grant: `${base}/grant/`, createRole: `${base}/role/`, addMember: `${base}/member/`, removeMember: `${base}/member/remove/` },
      });
    },
  };
}

const failure = (status: number, error: string, message: string, headers: Record<string, string> = {}) =>
  Response.json({ error, message }, { status, headers: { "cache-control": "no-store", ...headers } });

/** Back to the panel after a form, with `status` and the fields it concerns, at the section it changed. */
function back(context: ServerContext, url: URL, status: PeopleStatus, fields: Record<string, string>, section: string): Response {
  const target = new URL(panelPath(context), url.origin);
  target.searchParams.set("status", status);
  for (const [key, value] of Object.entries(fields)) target.searchParams.set(key, value);
  return new Response(null, { status: 303, headers: { location: `${target.pathname}${target.search}#sv-dashboard-${section}`, "cache-control": "no-store" } });
}

const ROUTE = /^\/people\/(grant|role|member|member\/remove)\/$/;

/**
 * Answer a `people/` route, or `undefined` when `path` (below `/_svartz/auth`) names none. `vaults` are the ids that
 * share these accounts.
 */
export async function peopleRoute(request: Request, path: string, context: ServerContext, vaults: readonly string[]): Promise<Response | undefined> {
  const action = ROUTE.exec(path)?.[1];
  if (!action) return undefined;
  if (request.method !== "POST") return failure(405, "method_not_allowed", "Use POST.", { allow: "POST" });
  const url = new URL(request.url);
  // Browsers name the page's origin on every POST: anything else is forged, or from a client that can't be checked.
  if (request.headers.get("origin") !== url.origin) return failure(403, "cross_origin", "Change permissions on this site.");
  const db = await accountsDatabase(context.env);
  const session = db && await readCurrentSession(request, context.env);
  if (!db || !session || !await can(session.account, GRANTS_WRITE, { vault: context.vault.id }, context.env)) {
    return failure(403, "forbidden", "You can't change permissions and roles here.");
  }
  const actor = { id: session.account.id, handle: session.account.handle };
  const form = await request.formData().catch(() => undefined);
  const field = (name: string) => String(form?.get(name) ?? "").trim();

  if (action === "grant") {
    const sentType = field("actor-type");
    const actorType = sentType === "role" || sentType === "group" ? sentType : "account";
    const named = actorType === "account" ? typedHandle(field("actor")) : field("actor").toLowerCase();
    const permission = field("permission");
    const value = field("value");
    const sent = form?.has("object") ? pickerFields(field("object")) : { scope: field("scope"), path: field("path") };
    const typed = { "actor-type": actorType, actor: named, permission, scope: sent.scope, path: sent.path, value };
    const refuse = (status: PeopleStatus) => back(context, url, status, typed, "grants");
    if (value !== "allow" && value !== "deny" && value !== "unset") return failure(400, "invalid_value", "Set a grant to allow, deny or unset.");
    if (!isDeclared(permission)) return refuse("permission-unknown");
    const object = pickedObject(sent.scope, sent.path, vaults);
    // A whole object string must name exactly what the picker would: no other vault, no dot segments.
    if (!object || (form?.has("object") && object !== field("object"))) return refuse("object-invalid");
    // A grant lands on `object`. Holding the permission on this vault, or on a folder a group owns, is no right to
    // grant on the whole site or in another vault.
    if (!await mayOn(db, session.account, GRANTS_WRITE, chainOf(object))) return failure(403, "forbidden", "You can't change permissions there.");
    if (actorType === "role") {
      if (named === ADMIN_ROLE) return refuse("admin-role");
      if (!await roleExists(db, named)) return refuse("role-unknown");
      await setGrant(db, actor, { actorType, actorId: named, actor: named, object, permission, value });
    } else if (actorType === "group") {
      if (!await groupExists(db, named)) return refuse("group-unknown");
      await setGrant(db, actor, { actorType, actorId: named, actor: named, object, permission, value });
    } else {
      const person = await personByHandle(db, named);
      if (!person) return refuse("account-unknown");
      if (person.roles.includes(ADMIN_ROLE)) return back(context, url, "admin-account", { ...typed, actor: person.handle }, "grants");
      await setGrant(db, actor, { actorType, actorId: person.id, actor: person.handle, object, permission, value });
    }
    return back(context, url, "grant-saved", {}, "grants");
  }

  // Roles are site-wide: who holds one holds its grants everywhere, so only whoever may grant on the whole site
  // creates roles or changes who is in them.
  if (!await mayOn(db, session.account, GRANTS_WRITE, [SITE])) return failure(403, "forbidden", "You can't change roles here.");

  if (action === "role") {
    const name = field("name").toLowerCase();
    if (!isRoleName(name)) return back(context, url, "role-invalid", { name }, "roles");
    return back(context, url, await createRole(db, actor, name) === "created" ? "role-created" : "role-exists", { name }, "roles");
  }

  const role = field("role");
  const handle = typedHandle(field("handle"));
  if (!await roleExists(db, role)) return failure(404, "not_found", "There's no such role.");
  const person = await personByHandle(db, handle);
  if (!person) return back(context, url, "member-unknown", { role, handle }, "roles");
  const fields = { role, handle: person.handle };
  if (action === "member") return back(context, url, await addMember(db, actor, role, person) ? "member-added" : "member-held", fields, "roles");
  await removeMember(db, actor, role, person);
  return back(context, url, "member-removed", fields, "roles");
}

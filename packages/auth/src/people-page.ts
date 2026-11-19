/**
 * The People & permissions panel: the body the dashboard renders at `/-/dashboard/auth/people/`. Plain HTML forms post
 * to the `auth` plugin's `people/` routes, which redirect back here with `?status=<code>`; the access check and the
 * people search are GET forms on the panel itself. The page works before any script loads.
 */
import type { PermissionDeclaration, PluginPage } from "@svartz/core";
import type { Explanation } from "./grants";
import { HANDLE_MAX_LENGTH } from "./handle";
import { escape } from "./html";
import { describeObject } from "./objects";
import type { ListedGrant, Person, Role } from "./people";
import { ROLE_NAME_MAX_LENGTH } from "./people";
import { SITE, type DecidedBy, type Grant } from "./permissions";

export const PEOPLE_TITLE = "People & permissions";

type Section = "grants" | "roles";

/** What a form's `status` tells the reader. `who` is the handle or role the form named; `role` the role it changed. */
const STATUSES: Readonly<Record<string, { section: Section; error: boolean; field?: string; text: (who: string, role: string) => string }>> = {
  "grant-saved": { section: "grants", error: false, text: () => "Grant saved." },
  "account-unknown": { section: "grants", error: true, field: "actor", text: (who) => `No account has the handle @${who}.` },
  "role-unknown": { section: "grants", error: true, field: "actor", text: (who) => `There's no role named ${who}. Create it under Roles first.` },
  "admin-account": { section: "grants", error: true, field: "actor", text: (who) => `@${who} is an admin and may do everything. Admins are set in the site's config.` },
  "admin-role": { section: "grants", error: true, field: "actor", text: () => "The admin role may do everything and is set in the site's config." },
  "permission-unknown": { section: "grants", error: true, field: "permission", text: () => "Choose a permission from the list." },
  "object-invalid": {
    section: "grants", error: true, field: "path",
    text: () => "Enter a folder ending in /, like garden/, or a page, like garden/roses. Leave it empty for all of the vault, or of the site.",
  },
  "role-created": { section: "roles", error: false, text: (_, role) => `Role ${role} created.` },
  "role-exists": { section: "roles", error: true, field: "name", text: (_, role) => `There's already a role named ${role}.` },
  "role-invalid": {
    section: "roles", error: true, field: "name",
    text: () => `Name the role with up to ${ROLE_NAME_MAX_LENGTH} lowercase letters, numbers and hyphens, starting and ending with a letter or number. It can't be admin.`,
  },
  "member-added": { section: "roles", error: false, text: (who, role) => `@${who} now holds ${role}.` },
  "member-held": { section: "roles", error: false, text: (who, role) => `@${who} already holds ${role}.` },
  "member-removed": { section: "roles", error: false, text: (who, role) => `@${who} no longer holds ${role}.` },
  "member-unknown": { section: "roles", error: true, field: "handle", text: (who) => `No account has the handle @${who}.` },
};

/** The `status` codes a `people/` route answers with. */
export type PeopleStatus = keyof typeof STATUSES;

/** The answer to "can this account do this here?", or why there is none. */
export type Check =
  | { readonly person: Person; readonly permission: PermissionDeclaration; readonly object: string; readonly answer: Explanation }
  | { readonly problem: string };

/** Everything the panel shows, and where its forms go. */
export interface PeopleView {
  /** Whether the viewer may change grants and roles; without it the panel only lists them. */
  readonly canWrite: boolean;
  readonly catalogue: readonly PermissionDeclaration[];
  readonly grants: readonly ListedGrant[];
  readonly roles: readonly Role[];
  /** The ids of the vaults that share these accounts, which the object picker offers. */
  readonly vaults: readonly string[];
  /** Folders (ending in `/`) and pages of this vault, which the picker suggests. */
  readonly paths: readonly string[];
  /** The people search, once the viewer searched. */
  readonly people?: { readonly query: string; readonly results: readonly Person[] };
  readonly check?: Check;
  /** The panel's query: a form's `status` and what it sent, or the check's and search's fields. */
  readonly query: URLSearchParams;
  /** The panel's own path, which the GET forms submit to. */
  readonly here: string;
  readonly actions: { readonly grant: string; readonly createRole: string; readonly addMember: string; readonly removeMember: string };
}

const VALUE_LABELS: Readonly<Record<string, string>> = { allow: "Allowed", deny: "Denied", unset: "Unset" };
const STATIC_LABELS: Readonly<Record<string, string>> = { guest: "everyone", "signed-in": "everyone signed in" };

/** Who a grant names, in words: `@octocat`, `role editors`, `everyone signed in`. */
function actorLabel({ actorType, actor }: Pick<ListedGrant, "actorType" | "actor">): string {
  if (actorType === "account") return `@${actor}`;
  if (actorType === "static") return STATIC_LABELS[actor] ?? actor;
  return `${actorType} ${actor}`;
}

const nameOf = (catalogue: readonly PermissionDeclaration[], slug: string) => catalogue.find((entry) => entry.slug === slug)?.name ?? slug;

function message(section: Section, query: URLSearchParams): { html: string; id: string; field?: string } | undefined {
  const status = STATUSES[query.get("status") ?? ""];
  if (status?.section !== section) return undefined;
  const id = `sv-dashboard-${section}-status`;
  const text = status.text(query.get(section === "grants" ? "actor" : "handle") ?? "", query.get(section === "roles" ? "role" : "") ?? query.get("name") ?? "");
  return {
    id,
    field: status.error ? status.field : undefined,
    html: `<p class="sv-account-status" id="${id}" role="${status.error ? "alert" : "status"}"${status.error ? " data-error" : ""}>${escape(text)}</p>`,
  };
}

/** `aria-invalid` and `aria-describedby` for a field, when the form came back refused for it. */
const invalid = (status: { id: string; field?: string } | undefined, field: string, hint?: string) => {
  const ids = [status?.field === field ? status.id : undefined, hint].filter(Boolean).join(" ");
  return `${ids ? ` aria-describedby="${ids}"` : ""}${status?.field === field ? ' aria-invalid="true"' : ""}`;
};

const option = (value: string, label: string, selected: string | null) =>
  `<option value="${escape(value)}"${value === selected ? " selected" : ""}>${escape(label)}</option>`;

/** The permission select, grouped by the plugin that declares each. */
function permissionSelect(id: string, name: string, catalogue: readonly PermissionDeclaration[], selected: string | null, extra = ""): string {
  const plugins = [...new Set(catalogue.map(({ slug }) => slug.split(":", 1)[0]!))];
  const groups = plugins.map((plugin) => `<optgroup label="${escape(plugin)}">${catalogue.filter(({ slug }) => slug.startsWith(`${plugin}:`))
    .map(({ slug, name: label }) => option(slug, label, selected)).join("")}</optgroup>`);
  return `<select class="sv-account-input" id="${id}" name="${name}" required${extra}>${groups.join("")}</select>`;
}

/** The object picker: where (the site or a vault) and, within a vault, a folder or page. */
function objectPicker(prefix: string, names: { scope: string; path: string }, view: PeopleView, values: { scope: string | null; path: string | null }, extra = ""): string {
  const scopes = [option(SITE, "Whole site", values.scope), ...view.vaults.map((vault) => option(`vault:${vault}`, `Vault ${vault}`, values.scope))];
  return `<div class="sv-account-field">
    <label for="${prefix}-scope">Where</label>
    <select class="sv-account-input" id="${prefix}-scope" name="${names.scope}">${scopes.join("")}</select>
  </div>
  <div class="sv-account-field">
    <label for="${prefix}-path">Folder or page</label>
    <input class="sv-account-input" id="${prefix}-path" name="${names.path}" value="${escape(values.path ?? "")}" list="sv-dashboard-paths" autocomplete="off" autocapitalize="none" spellcheck="false"${extra || ` aria-describedby="${prefix}-path-hint"`}>
    <p class="sv-account-hint" id="${prefix}-path-hint">Leave empty for all of it. End a folder with /, like garden/.</p>
  </div>`;
}

function grantsSection(view: PeopleView): string {
  const { canWrite, catalogue, grants, query, actions } = view;
  const status = message("grants", query);
  const refused = status?.field !== undefined;
  const typed = (key: string) => refused ? query.get(key) : null;
  const form = canWrite ? `<form class="sv-account-form sv-dashboard-grid" method="post" action="${escape(actions.grant)}">
  <div class="sv-account-field">
    <label for="sv-dashboard-grant-type">Grant to</label>
    <select class="sv-account-input" id="sv-dashboard-grant-type" name="actor-type">${option("account", "An account", typed("actor-type"))}${option("role", "A role", typed("actor-type"))}</select>
  </div>
  <div class="sv-account-field">
    <label for="sv-dashboard-grant-actor">Handle or role name</label>
    <input class="sv-account-input" id="sv-dashboard-grant-actor" name="actor" value="${escape(typed("actor") ?? "")}" required maxlength="${HANDLE_MAX_LENGTH + 1}" list="sv-dashboard-roles" autocomplete="off" autocapitalize="none" spellcheck="false"${invalid(status, "actor")}>
  </div>
  <div class="sv-account-field">
    <label for="sv-dashboard-grant-permission">Permission</label>
    ${permissionSelect("sv-dashboard-grant-permission", "permission", catalogue, typed("permission"), invalid(status, "permission"))}
  </div>
  <div class="sv-account-field">
    <label for="sv-dashboard-grant-value">Set to</label>
    <select class="sv-account-input" id="sv-dashboard-grant-value" name="value">${option("allow", "Allow", typed("value"))}${option("deny", "Deny", typed("value"))}${option("unset", "Unset", typed("value"))}</select>
  </div>
  ${objectPicker("sv-dashboard-grant", { scope: "scope", path: "path" }, view, { scope: typed("scope"), path: typed("path") }, status?.field === "path" ? invalid(status, "path", "sv-dashboard-grant-path-hint") : "")}
  <div class="sv-dashboard-submit"><button class="sv-account-button" data-primary type="submit">Save grant</button></div>
</form>` : "";
  const rows = grants.map((grant) => {
    const who = actorLabel(grant);
    const where = describeObject(grant.object);
    const unset = canWrite && grant.value !== "unset" && (grant.actorType === "account" || grant.actorType === "role")
      ? `<form method="post" action="${escape(actions.grant)}">${[["actor-type", grant.actorType], ["actor", grant.actor], ["permission", grant.permission], ["object", grant.object], ["value", "unset"]]
        .map(([name, value]) => `<input type="hidden" name="${name}" value="${escape(value!)}">`).join("")}<button class="sv-account-button" type="submit" aria-label="Unset ${escape(nameOf(catalogue, grant.permission))} for ${escape(who)} on ${escape(where)}">Unset</button></form>`
      : "";
    return `<li class="sv-account-row"><span class="sv-account-what"><span class="sv-account-name">${escape(who)} · ${escape(nameOf(catalogue, grant.permission))}</span><span class="sv-account-muted">${escape(where)}</span></span><span class="sv-account-tag"${grant.value === "deny" ? " data-deny" : ""}>${VALUE_LABELS[grant.value]}</span>${unset}</li>`;
  });
  return `<section class="sv-account-section" aria-labelledby="sv-dashboard-grants">
<h2 id="sv-dashboard-grants">Grants</h2>
${status?.html ?? ""}
${form}
${rows.length ? `<ul class="sv-account-list sv-dashboard-list">${rows.join("")}</ul>` : `<p class="sv-account-muted">No grants yet.</p>`}
</section>`;
}

function rolesSection({ canWrite, roles, query, actions }: PeopleView): string {
  const status = message("roles", query);
  const create = canWrite ? `<form class="sv-account-form" method="post" action="${escape(actions.createRole)}">
  <div class="sv-account-field">
    <label for="sv-dashboard-role-name">New role</label>
    <input class="sv-account-input" id="sv-dashboard-role-name" name="name" value="${escape(status?.field === "name" ? query.get("name") ?? "" : "")}" required maxlength="${ROLE_NAME_MAX_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false"${invalid(status, "name", "sv-dashboard-role-hint")}>
    <p class="sv-account-hint" id="sv-dashboard-role-hint">Lowercase letters, numbers and hyphens.</p>
  </div>
  <div><button class="sv-account-button" data-primary type="submit">Create role</button></div>
</form>` : "";
  const blocks = roles.map(({ name, members }, index) => {
    const id = `sv-dashboard-role-${index}`;
    const refusedHere = status?.field === "handle" && query.get("role") === name;
    const rows = members.map((member) => {
      const remove = canWrite
        ? `<form method="post" action="${escape(actions.removeMember)}"><input type="hidden" name="role" value="${escape(name)}"><input type="hidden" name="handle" value="${escape(member.handle)}"><button class="sv-account-button" type="submit" aria-label="Remove @${escape(member.handle)} from ${escape(name)}">Remove</button></form>`
        : "";
      return `<li class="sv-account-row"><span class="sv-account-what"><span class="sv-account-name">@${escape(member.handle)}</span><span class="sv-account-muted">${escape(member.name)}</span></span>${remove}</li>`;
    });
    const add = canWrite ? `<form class="sv-dashboard-inline" method="post" action="${escape(actions.addMember)}">
  <input type="hidden" name="role" value="${escape(name)}">
  <div class="sv-account-field">
    <label for="${id}-handle">Add an account to ${escape(name)}</label>
    <div class="sv-account-input sv-account-handle"><span aria-hidden="true">@</span><input id="${id}-handle" name="handle" value="${escape(refusedHere ? query.get("handle") ?? "" : "")}" required maxlength="${HANDLE_MAX_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false"${refusedHere ? invalid(status, "handle") : ""}></div>
  </div>
  <button class="sv-account-button" type="submit">Add</button>
</form>` : "";
    return `<section class="sv-dashboard-role" aria-labelledby="${id}">
<h3 id="${id}">${escape(name)}</h3>
${refusedHere ? status!.html : ""}
${rows.length ? `<ul class="sv-account-list">${rows.join("")}</ul>` : `<p class="sv-account-muted">Nobody holds this role yet.</p>`}
${add}
</section>`;
  });
  // A refused add shows beside the role it concerns; every other answer shows at the top.
  const top = status && !(status.field === "handle" && roles.some(({ name }) => name === query.get("role"))) ? status.html : "";
  return `<section class="sv-account-section" aria-labelledby="sv-dashboard-roles">
<h2 id="sv-dashboard-roles">Roles</h2>
${top}
${create}
${blocks.length ? blocks.join("\n") : `<p class="sv-account-muted">No roles yet.</p>`}
</section>`;
}

/** Why a check came out as it did, in words. */
function reason(decidedBy: DecidedBy, byDefault: boolean, person: Person): string {
  switch (decidedBy.kind) {
    case "admin": return `@${person.handle} is an admin, and admins may do everything.`;
    case "user-page": return `This is @${person.handle}'s own user page.`;
    case "group-owner": return `@${person.handle} owns group ${decidedBy.group}, which is linked to ${describeObject(decidedBy.object)}.`;
    case "nothing": return "No grant gives it, here or anywhere above.";
    case "grant": {
      const grant: Grant = decidedBy.grant;
      const verb = grant.value === "deny" ? "denies" : "allows";
      const who = actorLabel({ actorType: grant.actorType, actor: grant.actorType === "account" ? person.handle : grant.actorId });
      return byDefault
        ? `The permission's default ${verb} ${who} on ${describeObject(grant.object)}.`
        : `A grant ${verb} ${who} on ${describeObject(grant.object)}.`;
    }
  }
}

function checkSection(view: PeopleView): string {
  const { catalogue, check, query, here } = view;
  const result = !check ? "" : "problem" in check
    ? `<p class="sv-account-status" id="sv-dashboard-check-status" role="alert" data-error>${escape(check.problem)}</p>`
    : `<div class="sv-account-status sv-dashboard-answer" id="sv-dashboard-check-status" role="status"><p><strong>${check.answer.value === "allow" ? "Yes" : "No"}.</strong> @${escape(check.person.handle)} ${check.answer.value === "allow" ? "may" : "may not"}: ${escape(check.permission.name)}, on ${escape(describeObject(check.object))}.</p><p>${escape(reason(check.answer.decidedBy, check.answer.byDefault, check.person))}</p></div>`;
  return `<section class="sv-account-section" aria-labelledby="sv-dashboard-check">
<h2 id="sv-dashboard-check">Check access</h2>
${result}
<form class="sv-account-form sv-dashboard-grid" method="get" action="${escape(here)}#sv-dashboard-check">
  <div class="sv-account-field">
    <label for="sv-dashboard-check-handle">Account</label>
    <div class="sv-account-input sv-account-handle"><span aria-hidden="true">@</span><input id="sv-dashboard-check-handle" name="check" value="${escape(query.get("check") ?? "")}" required maxlength="${HANDLE_MAX_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
  </div>
  <div class="sv-account-field">
    <label for="sv-dashboard-check-permission">Permission</label>
    ${permissionSelect("sv-dashboard-check-permission", "check-permission", catalogue, query.get("check-permission"))}
  </div>
  ${objectPicker("sv-dashboard-check", { scope: "check-scope", path: "check-path" }, view, { scope: query.get("check-scope"), path: query.get("check-path") })}
  <div class="sv-dashboard-submit"><button class="sv-account-button" type="submit">Check</button></div>
</form>
</section>`;
}

function peopleSection({ people, here }: PeopleView): string {
  const rows = people?.results.map(({ handle, name, roles }) =>
    `<li class="sv-account-row"><span class="sv-account-what"><span class="sv-account-name">@${escape(handle)}</span><span class="sv-account-muted">${escape(name)}</span></span>${roles.length ? `<span class="sv-account-tag">${escape(roles.join(", "))}</span>` : ""}</li>`);
  const results = !people ? "" : rows!.length
    ? `<ul class="sv-account-list" aria-label="People matching ${escape(people.query)}">${rows!.join("")}</ul>`
    : `<p class="sv-account-muted" role="status">Nobody matches ${escape(people.query)}.</p>`;
  return `<section class="sv-account-section" aria-labelledby="sv-dashboard-people">
<h2 id="sv-dashboard-people">People</h2>
<form class="sv-dashboard-inline" method="get" action="${escape(here)}#sv-dashboard-people" role="search">
  <div class="sv-account-field">
    <label for="sv-dashboard-people-query">Handle or name</label>
    <input class="sv-account-input" id="sv-dashboard-people-query" name="people" type="search" value="${escape(people?.query ?? "")}" required maxlength="100" autocomplete="off" spellcheck="false">
  </div>
  <button class="sv-account-button" type="submit">Search</button>
</form>
${results}
</section>`;
}

function catalogueSection({ catalogue }: PeopleView): string {
  const rows = catalogue.map(({ slug, name, description, defaults = {} }) => {
    const given = Object.entries(defaults).map(([actor, value]) => `${value === "allow" ? "Allows" : "Denies"} ${STATIC_LABELS[actor]} by default.`);
    return `<li class="sv-dashboard-permission"><p><span class="sv-account-name">${escape(name)}</span> <code>${escape(slug)}</code></p><p>${escape(description)}</p>${given.length ? `<p class="sv-account-muted">${escape(given.join(" "))}</p>` : ""}</li>`;
  });
  return `<section class="sv-account-section" aria-labelledby="sv-dashboard-permissions">
<h2 id="sv-dashboard-permissions">Permissions</h2>
<ul class="sv-account-list">${rows.join("")}</ul>
</section>`;
}

/** The panel: grants, roles, the access check, the people search, and the permission catalogue. */
export function peoplePage(view: PeopleView): PluginPage {
  const sections: Array<[string, string]> = [
    ["sv-dashboard-grants", "Grants"], ["sv-dashboard-roles", "Roles"], ["sv-dashboard-check", "Check access"],
    ["sv-dashboard-people", "People"], ["sv-dashboard-permissions", "Permissions"],
  ];
  return {
    title: PEOPLE_TITLE,
    html: `<div class="sv-account sv-dashboard">
<h1>${escape(PEOPLE_TITLE)}</h1>
<nav class="sv-dashboard-sections" aria-label="Sections"><ul>${sections.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join("")}</ul></nav>
<datalist id="sv-dashboard-paths">${view.paths.map((path) => `<option value="${escape(path)}"></option>`).join("")}</datalist>
<datalist id="sv-dashboard-roles">${view.roles.map(({ name }) => `<option value="${escape(name)}"></option>`).join("")}</datalist>
${grantsSection(view)}
${rolesSection(view)}
${checkSection(view)}
${peopleSection(view)}
${catalogueSection(view)}
</div>`,
  };
}

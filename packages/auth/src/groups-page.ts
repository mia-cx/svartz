/**
 * Groups as people see them: the Groups section of `/-/account/`, each group's own page at `/-/groups/<name>/`, and the
 * moderators' Groups panel at `/-/dashboard/auth/groups/`. Plain HTML forms post to the `auth` plugin's `groups/`
 * routes, which redirect back with `?status=<code>`, so every page works before any script loads.
 */
import type { PluginPage } from "@svartz/core";
import { NAME_MAX_LENGTH } from "./account";
import type { Group, GroupDetail, ListedGroup } from "./groups";
import { HANDLE_MAX_LENGTH, HANDLE_PROBLEM } from "./handle";
import { escape } from "./html";
import { describeObject } from "./objects";
import { objectPicker } from "./people-page";

/** What a `status` tells the reader. `who` is the handle the form named, `group` the group's name or display name. */
type Status = { readonly error: boolean; readonly field?: string; readonly text: (who: string, group: string) => string };

const ACCOUNT_STATUSES: Readonly<Record<string, Status>> = {
  "group-name-invalid": { error: true, field: "name", text: () => `${HANDLE_PROBLEM} It can't be admin, guest or signed-in.` },
  "group-name-taken": { error: true, field: "name", text: (_, group) => `There's already a group named ${group}.` },
  "group-display-name-invalid": { error: true, field: "display-name", text: () => `Enter a display name of up to ${NAME_MAX_LENGTH} characters.` },
  "group-declined": { error: false, text: () => "Invitation declined." },
  "group-left": { error: false, text: (_, group) => `You left ${group}.` },
  "group-invitation-gone": { error: true, text: () => "That invitation is no longer open." },
};

const GROUP_STATUSES: Readonly<Record<string, Status>> = {
  "group-created": { error: false, text: () => "Group created." },
  "group-joined": { error: false, text: (_, group) => `You joined ${group}.` },
  "group-invited": { error: false, text: (who) => `@${who} is invited.` },
  "group-invite-unknown": { error: true, field: "handle", text: (who) => `No account has the handle @${who}.` },
  "group-invite-member": { error: true, field: "handle", text: (who) => `@${who} is already in this group.` },
  "group-invite-pending": { error: true, field: "handle", text: (who) => `@${who} is already invited.` },
  "group-withdrawn": { error: false, text: (who) => `@${who}'s invitation is withdrawn.` },
  "group-removed": { error: false, text: (who) => `@${who} is no longer in this group.` },
  "group-promoted": { error: false, text: (who) => `@${who} is now an owner.` },
  "group-last-owner": { error: true, text: () => "A group needs an owner. Make someone else an owner first." },
};

const PANEL_STATUSES: Readonly<Record<string, Status>> = {
  "group-linked": { error: false, text: (_, group) => `${group} is linked.` },
  "group-link-held": { error: false, text: (_, group) => `${group} is already linked there.` },
  "group-unlinked": { error: false, text: (_, group) => `${group} is unlinked.` },
  "group-link-unknown": { error: true, field: "group", text: (_, group) => `There's no group named ${group}.` },
  "group-link-invalid": {
    error: true, field: "path",
    text: () => "Enter a folder ending in /, like garden/, or a page, like garden/roses. Leave it empty for the whole vault.",
  },
};

/** Every `status` code a `groups/` route answers with. */
export type GroupStatus = keyof typeof ACCOUNT_STATUSES | keyof typeof GROUP_STATUSES | keyof typeof PANEL_STATUSES;

/** The status line for `query` from `statuses`, if it carries one of them. */
function message(statuses: Readonly<Record<string, Status>>, id: string, query: URLSearchParams, group: string) {
  const status = statuses[query.get("status") ?? ""];
  if (!status) return undefined;
  const text = status.text(query.get("handle") ?? "", group);
  return {
    id,
    field: status.error ? status.field : undefined,
    html: `<p class="sv-account-status" id="${id}" role="${status.error ? "alert" : "status"}"${status.error ? " data-error" : ""}>${escape(text)}</p>`,
  };
}

/** `aria-invalid` and `aria-describedby` for a field, when the form came back refused for it. */
function described(status: { id: string; field?: string } | undefined, field: string, hint?: string): string {
  const ids = [status?.field === field ? status.id : undefined, hint].filter(Boolean).join(" ");
  return `${ids ? ` aria-describedby="${ids}"` : ""}${status?.field === field ? ' aria-invalid="true"' : ""}`;
}

/** A form of one button, with hidden fields. */
function button(action: string, label: string, fields: Record<string, string> = {}, aria?: string, primary = false): string {
  const hidden = Object.entries(fields).map(([name, value]) => `<input type="hidden" name="${name}" value="${escape(value)}">`).join("");
  return `<form method="post" action="${escape(action)}">${hidden}<button class="sv-account-button"${primary ? " data-primary" : ""} type="submit"${aria ? ` aria-label="${escape(aria)}"` : ""}>${escape(label)}</button></form>`;
}

/** The account page's Groups section: its invitations, its groups, and a form to create one. */
export interface AccountGroups {
  readonly groups: readonly (Group & { readonly owner: boolean })[];
  readonly invitations: readonly (Group & { readonly invitedBy: string })[];
  /** The group page's path for a group name. */
  readonly page: (name: string) => string;
  readonly actions: {
    readonly create: string;
    readonly accept: (name: string) => string;
    readonly decline: (name: string) => string;
  };
}

/** The Groups section of `/-/account/`. `handle` is the signed-in account's, which declining an invitation names. */
export function accountGroupsSection({ groups, invitations, page, actions }: AccountGroups, handle: string, query: URLSearchParams): string {
  const status = message(ACCOUNT_STATUSES, "sv-account-groups-status", query, query.get("group") ?? "");
  const typed = (key: string) => status?.field ? query.get(key) ?? "" : "";
  const invited = invitations.map(({ name, displayName, invitedBy }) => `<li class="sv-account-row"><span class="sv-account-what"><span class="sv-account-name">${escape(displayName)}</span><span class="sv-account-muted">@${escape(invitedBy)} invited you</span></span><span class="sv-account-actions">${button(actions.accept(name), "Accept", {}, `Accept the invitation to ${displayName}`, true)}${button(actions.decline(name), "Decline", { handle }, `Decline the invitation to ${displayName}`)}</span></li>`);
  const held = groups.map(({ name, displayName, owner }) => `<li class="sv-account-row"><span class="sv-account-what"><a class="sv-account-name" href="${escape(page(name))}">${escape(displayName)}</a><span class="sv-account-muted">${escape(name)}</span></span><span class="sv-account-tag">${owner ? "Owner" : "Member"}</span></li>`);
  return `<section class="sv-account-section" aria-labelledby="sv-account-groups">
<h2 id="sv-account-groups">Groups</h2>
${status?.html ?? ""}
${invited.length ? `<ul class="sv-account-list" aria-label="Invitations">${invited.join("")}</ul>` : ""}
${held.length ? `<ul class="sv-account-list" aria-label="Your groups">${held.join("")}</ul>` : ""}
<form class="sv-account-form" method="post" action="${escape(actions.create)}">
  <div class="sv-account-field">
    <label for="sv-account-group-display-name">Group display name</label>
    <input class="sv-account-input" id="sv-account-group-display-name" name="display-name" value="${escape(typed("display-name"))}" required maxlength="${NAME_MAX_LENGTH}" autocomplete="off"${described(status, "display-name")}>
  </div>
  <div class="sv-account-field">
    <label for="sv-account-group-name">Group name</label>
    <input class="sv-account-input" id="sv-account-group-name" name="name" value="${escape(typed("name"))}" required maxlength="${HANDLE_MAX_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false"${described(status, "name", "sv-account-group-name-hint")}>
    <p class="sv-account-hint" id="sv-account-group-name-hint">Lowercase letters, numbers, hyphens and underscores. A group keeps its name for good.</p>
  </div>
  <div><button class="sv-account-button" type="submit">Create group</button></div>
</form>
</section>`;
}

/** Everything a group's page shows the member viewing it, and where its forms go. */
export interface GroupView {
  readonly group: GroupDetail;
  /** The viewing member's handle. */
  readonly handle: string;
  readonly owner: boolean;
  /** The account page, which the page links back to. */
  readonly account: string;
  readonly query: URLSearchParams;
  readonly actions: { readonly invite: string; readonly uninvite: string; readonly remove: string; readonly promote: string };
}

/** `/-/groups/<name>/`, for its members: who is in it, who is invited, and where it is linked. Owners manage it here. */
export function groupPage({ group, handle, owner, account, query, actions }: GroupView): PluginPage {
  const status = message(GROUP_STATUSES, "sv-group-status", query, group.displayName);
  const owners = group.members.filter((member) => member.owner).length;
  const rows = group.members.map((member) => {
    const self = member.handle === handle;
    const who = `@${member.handle}`;
    const controls = self
      ? !member.owner || owners > 1 ? button(actions.remove, "Leave", { handle: member.handle }, `Leave ${group.displayName}`) : ""
      : owner
        ? `${member.owner ? "" : button(actions.promote, "Make owner", { handle: member.handle }, `Make ${who} an owner`)}${button(actions.remove, "Remove", { handle: member.handle }, `Remove ${who}`)}`
        : "";
    return `<li class="sv-account-row"><span class="sv-account-what"><span class="sv-account-name">${escape(who)}</span><span class="sv-account-muted">${escape(member.name)}</span></span>${member.owner ? `<span class="sv-account-tag">Owner</span>` : ""}${controls ? `<span class="sv-account-actions">${controls}</span>` : ""}</li>`;
  });
  const inviteForm = owner ? `<form class="sv-dashboard-inline" method="post" action="${escape(actions.invite)}">
  <div class="sv-account-field">
    <label for="sv-group-invite">Invite an account</label>
    <div class="sv-account-input sv-account-handle"><span aria-hidden="true">@</span><input id="sv-group-invite" name="handle" value="${escape(status?.field === "handle" ? query.get("handle") ?? "" : "")}" required maxlength="${HANDLE_MAX_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false"${described(status, "handle")}></div>
  </div>
  <button class="sv-account-button" type="submit">Invite</button>
</form>` : "";
  const invited = owner && group.invitations.length > 0 ? `<section class="sv-account-section" aria-labelledby="sv-group-invitations">
<h2 id="sv-group-invitations">Invitations</h2>
<ul class="sv-account-list">${group.invitations.map((person) => `<li class="sv-account-row"><span class="sv-account-what"><span class="sv-account-name">@${escape(person.handle)}</span><span class="sv-account-muted">${escape(person.name)}</span></span>${button(actions.uninvite, "Withdraw", { handle: person.handle }, `Withdraw @${person.handle}'s invitation`)}</li>`).join("")}</ul>
</section>` : "";
  const links = group.links.map((object) => `<li class="sv-account-row"><span class="sv-account-what">${escape(describeObject(object))}</span></li>`);
  return {
    title: group.displayName,
    html: `<div class="sv-account sv-dashboard">
<nav class="sv-dashboard-crumbs" aria-label="Breadcrumb"><a href="${escape(account)}">Account</a></nav>
<h1>${escape(group.displayName)}</h1>
<p class="sv-account-who"><span class="sv-account-muted">${escape(group.name)} · ${owner ? "You own this group" : "You're a member"}</span></p>
<section class="sv-account-section" aria-labelledby="sv-group-members">
<h2 id="sv-group-members">Members</h2>
${status?.html ?? ""}
${inviteForm}
<ul class="sv-account-list">${rows.join("")}</ul>
</section>
${invited}
<section class="sv-account-section" aria-labelledby="sv-group-links">
<h2 id="sv-group-links">Linked to</h2>
${links.length ? `<ul class="sv-account-list">${links.join("")}</ul>` : `<p class="sv-account-muted">Not linked to any pages yet.</p>`}
</section>
</div>`,
  };
}

export const GROUPS_TITLE = "Groups";

/** Everything the moderators' Groups panel shows, and where its forms go. */
export interface GroupsPanelView {
  readonly groups: readonly ListedGroup[];
  /** The vaults a group may be linked in. */
  readonly vaults: readonly string[];
  /** Folders (ending in `/`) and pages of this vault, which the picker suggests. */
  readonly paths: readonly string[];
  readonly query: URLSearchParams;
  readonly actions: { readonly link: string; readonly unlink: string };
}

/** The Groups panel: link a group to a vault, folder or page, and see every group's owners and links. */
export function groupsPanelPage({ groups, vaults, paths, query, actions }: GroupsPanelView): PluginPage {
  const status = message(PANEL_STATUSES, "sv-dashboard-groups-status", query, query.get("group") ?? "");
  const typed = (key: string) => status?.field ? query.get(key) : null;
  const blocks = groups.map(({ name, displayName, owners, links }, index) => {
    const id = `sv-dashboard-group-${index}`;
    const rows = links.map((object) => `<li class="sv-account-row"><span class="sv-account-what">${escape(describeObject(object))}</span>${button(actions.unlink, "Unlink", { group: name, object },`Unlink ${name} from ${describeObject(object)}`)}</li>`);
    return `<section class="sv-dashboard-role" aria-labelledby="${id}">
<h3 id="${id}">${escape(displayName)} <span class="sv-account-muted">${escape(name)}</span></h3>
<p class="sv-account-muted">Owned by ${escape(owners.map((owner) => `@${owner}`).join(", "))}</p>
${rows.length ? `<ul class="sv-account-list sv-dashboard-list">${rows.join("")}</ul>` : `<p class="sv-account-muted">Not linked anywhere.</p>`}
</section>`;
  });
  return {
    title: GROUPS_TITLE,
    html: `<div class="sv-account sv-dashboard">
<h1>${GROUPS_TITLE}</h1>
<datalist id="sv-dashboard-paths">${paths.map((path) => `<option value="${escape(path)}"></option>`).join("")}</datalist>
<datalist id="sv-dashboard-group-names">${groups.map(({ name }) => `<option value="${escape(name)}"></option>`).join("")}</datalist>
<section class="sv-account-section" aria-labelledby="sv-dashboard-link">
<h2 id="sv-dashboard-link">Link a group</h2>
${status?.html ?? ""}
<form class="sv-account-form sv-dashboard-grid" method="post" action="${escape(actions.link)}">
  <div class="sv-account-field">
    <label for="sv-dashboard-link-group">Group name</label>
    <input class="sv-account-input" id="sv-dashboard-link-group" name="group" value="${escape(typed("group") ?? "")}" required maxlength="${HANDLE_MAX_LENGTH}" list="sv-dashboard-group-names" autocomplete="off" autocapitalize="none" spellcheck="false"${described(status, "group")}>
  </div>
  ${objectPicker("sv-dashboard-link", { scope: "scope", path: "path" }, { vaults, site: false }, { scope: typed("scope"), path: typed("path") }, status?.field === "path" ? described(status, "path", "sv-dashboard-link-path-hint") : "")}
  <div class="sv-dashboard-submit"><button class="sv-account-button" data-primary type="submit">Link group</button></div>
</form>
</section>
<section class="sv-account-section" aria-labelledby="sv-dashboard-groups">
<h2 id="sv-dashboard-groups">All groups</h2>
${blocks.length ? blocks.join("\n") : `<p class="sv-account-muted">No groups yet.</p>`}
</section>
</div>`,
  };
}

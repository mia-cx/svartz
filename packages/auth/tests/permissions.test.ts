import { describe, expect, it } from "vitest";
import { objectChain, resolve, type Decision, type Grant, type GrantValue, type Principals } from "../src/permissions";

const DELETE = "annotations:comments:delete";
const ROSES = "page:notes/garden/roses";
const GARDEN = "folder:notes/garden/";
const VAULT = "vault:notes";
const CHAIN = [ROSES, GARDEN, VAULT, "site"];

const grant = (actorType: Grant["actorType"], actorId: string, object: string, value: GrantValue, permission = DELETE): Grant =>
  ({ actorType, actorId, object, permission, value });

const GUEST: Principals = { roles: [], groups: [] };
const ADA: Principals = { account: { id: "acct-ada", handle: "ada" }, roles: [], groups: [] };
const as = (extra: Partial<Principals>): Principals => ({ ...ADA, ...extra });

const allowedBy = (decider: Grant): Decision => ({ value: "allow", decidedBy: { kind: "grant", grant: decider } });
const deniedBy = (decider: Grant): Decision => ({ value: "deny", decidedBy: { kind: "grant", grant: decider } });
const NOTHING: Decision = { value: "unset", decidedBy: { kind: "nothing" } };

describe("objectChain", () => {
  it.each([
    ["the site", {}, ["site"]],
    ["a vault", { vault: "notes" }, [VAULT, "site"]],
    ["a top-level page", { vault: "notes", page: "garden" }, ["page:notes/garden", VAULT, "site"]],
    ["a nested page, through each enclosing folder", { vault: "notes", page: "garden/roses/tea" },
      ["page:notes/garden/roses/tea", "folder:notes/garden/roses/", GARDEN, VAULT, "site"]],
    ["a page written with stray slashes, as its slug", { vault: "notes", page: "/garden//roses/" }, CHAIN],
    ["an empty page, as the vault", { vault: "notes", page: "" }, [VAULT, "site"]],
  ])("runs from %s out to the site", (_case, target, chain) => {
    expect(objectChain(target)).toEqual(chain);
  });
});

describe("resolve", () => {
  const siteAllow = grant("account", "acct-ada", "site", "allow");
  const pageDeny = grant("account", "acct-ada", ROSES, "deny");
  const vaultDeny = grant("account", "acct-ada", VAULT, "deny");
  const folderAllow = grant("account", "acct-ada", GARDEN, "allow");
  const pageGuestDeny = grant("static", "guest", ROSES, "deny");
  const pageBobAllow = grant("account", "acct-bob", ROSES, "allow");
  const pageAdaUnset = grant("account", "acct-ada", ROSES, "unset");
  const siteDeny = grant("account", "acct-ada", "site", "deny");
  const groupDeny = grant("group", "gardeners", ROSES, "deny");
  const accountAllow = grant("account", "acct-ada", ROSES, "allow");
  const roleAllow = grant("role", "editor", ROSES, "allow");
  const signedInDeny = grant("static", "signed-in", ROSES, "deny");
  const signedInAllow = grant("static", "signed-in", ROSES, "allow");
  const guestDeny = grant("static", "guest", ROSES, "deny");
  const guestAllow = grant("static", "guest", ROSES, "allow");
  const mutedDeny = grant("role", "muted", ROSES, "deny");
  const rosesGroupAllow = grant("group", "rosarians", ROSES, "allow");
  const otherPermission = grant("account", "acct-ada", ROSES, "allow", "annotations:comments:write");
  const gardenersMember = { group: "gardeners", owner: false, linked: [GARDEN] };
  const gardenersOwner = { group: "gardeners", owner: true, linked: [GARDEN] };

  it.each<[string, readonly Grant[], Principals, readonly string[], Decision]>([
    // Object chain specificity
    ["answers unset when nothing is granted", [], ADA, CHAIN, NOTHING],
    ["falls back to the site when nothing nearer is set", [siteAllow], ADA, CHAIN, allowedBy(siteAllow)],
    ["lets the page beat the site", [siteAllow, pageDeny], ADA, CHAIN, deniedBy(pageDeny)],
    ["lets a folder beat its vault", [vaultDeny, folderAllow], ADA, CHAIN, allowedBy(folderAllow)],
    ["lets a nearer object decide even through a broader actor", [siteAllow, pageGuestDeny], ADA, CHAIN, deniedBy(pageGuestDeny)],
    ["skips an object whose grants are all someone else's", [pageBobAllow, vaultDeny], ADA, CHAIN, deniedBy(vaultDeny)],
    ["skips an object whose grant is unset", [pageAdaUnset, siteDeny], ADA, CHAIN, deniedBy(siteDeny)],
    ["ignores grants of other permissions", [otherPermission], ADA, CHAIN, NOTHING],
    ["checks a vault against the vault and site only", [pageDeny, vaultDeny, siteAllow], ADA, [VAULT, "site"], deniedBy(vaultDeny)],
    // Actor tiers within the deciding object
    ["lets an account beat its group", [groupDeny, accountAllow], as({ groups: [gardenersMember] }), CHAIN, allowedBy(accountAllow)],
    ["lets a group beat a role", [roleAllow, groupDeny], as({ roles: ["editor"], groups: [gardenersMember] }), CHAIN, deniedBy(groupDeny)],
    ["lets a role beat signed-in", [signedInDeny, roleAllow], as({ roles: ["editor"] }), CHAIN, allowedBy(roleAllow)],
    ["lets signed-in beat guest", [guestDeny, signedInAllow], ADA, CHAIN, allowedBy(signedInAllow)],
    // Deny within a tier
    ["lets a deny beat an allow between roles", [roleAllow, mutedDeny], as({ roles: ["editor", "muted"] }), CHAIN, deniedBy(mutedDeny)],
    ["lets a deny beat an allow between groups", [rosesGroupAllow, groupDeny],
      as({ groups: [gardenersMember, { group: "rosarians", owner: false, linked: [] }] }), CHAIN, deniedBy(groupDeny)],
    // Static actors
    ["gives a guest the guest grant", [guestAllow], GUEST, CHAIN, allowedBy(guestAllow)],
    ["gives a guest nothing from signed-in", [signedInAllow], GUEST, CHAIN, NOTHING],
    ["gives a signed-in account the guest grant too", [guestAllow], ADA, CHAIN, allowedBy(guestAllow)],
    // Group membership and roles
    ["gives a member their group's grant", [rosesGroupAllow], as({ groups: [{ group: "rosarians", owner: false, linked: [] }] }), CHAIN, allowedBy(rosesGroupAllow)],
    ["gives no one a group's grant outside it", [rosesGroupAllow], as({ groups: [gardenersMember] }), CHAIN, NOTHING],
    ["gives no one a role's grant without the role", [roleAllow], ADA, CHAIN, NOTHING],
    // The admin role
    ["allows the admin role everything, before any grant", [pageDeny], as({ roles: ["admin"] }), CHAIN, { value: "allow", decidedBy: { kind: "admin" } }],
    // Owner overrides
    ["allows an account on its own user page over a deny",
      [grant("account", "acct-ada", "page:notes/users/ada", "deny")], ADA, objectChain({ vault: "notes", page: "users/ada" }),
      { value: "allow", decidedBy: { kind: "user-page", object: "page:notes/users/ada" } }],
    ["gives no override on someone else's user page", [], ADA, objectChain({ vault: "notes", page: "users/bob" }), NOTHING],
    ["gives a guest no user page", [], GUEST, objectChain({ vault: "notes", page: "users/ada" }), NOTHING],
    ["allows a group's owner below an object linked to the group, over a deny", [pageDeny], as({ groups: [gardenersOwner] }), CHAIN,
      { value: "allow", decidedBy: { kind: "group-owner", group: "gardeners", object: GARDEN } }],
    ["allows a group's owner on the linked object itself", [pageDeny], as({ groups: [{ group: "rosarians", owner: true, linked: [ROSES] }] }), CHAIN,
      { value: "allow", decidedBy: { kind: "group-owner", group: "rosarians", object: ROSES } }],
    ["names the nearest link when an owner's groups are linked at several levels", [],
      as({ groups: [{ group: "notetakers", owner: true, linked: [VAULT] }, gardenersOwner] }), CHAIN,
      { value: "allow", decidedBy: { kind: "group-owner", group: "gardeners", object: GARDEN } }],
    ["gives a group's mere member no override", [pageDeny], as({ groups: [gardenersMember] }), CHAIN, deniedBy(pageDeny)],
    ["gives no override through a linked group the account only belongs to, though it owns another", [pageDeny],
      as({ groups: [gardenersMember, { group: "rosarians", owner: true, linked: [] }] }), CHAIN, deniedBy(pageDeny)],
    ["gives a group's owner no override outside its linked objects", [],
      as({ groups: [{ group: "gardeners", owner: true, linked: ["folder:notes/alliances/"] }] }), CHAIN, NOTHING],
  ])("%s", (_case, grants, who, chain, decision) => {
    expect(resolve(grants, who, chain, DELETE)).toEqual(decision);
  });
});

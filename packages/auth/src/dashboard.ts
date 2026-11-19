/**
 * `/-/dashboard/`: every panel the vault's server plugins contribute that the viewer may open, by plugin, and each
 * panel at `/-/dashboard/<plugin>/<panel>/`. Core lists the panels; auth, which owns permissions, decides who sees
 * them. A panel shows only to a viewer who holds its permission on the vault (a grant on the site covers every vault),
 * and the same check runs before every render. A viewer with no panel gets the 404.
 */
import type { DashboardSection, PageContext, PageResult, PluginPage, ServerContext } from "@svartz/core";
import { canEachPermission } from "./grants";
import { escape } from "./html";
import type { Account } from "./session";

/** The page name auth claims for the dashboard. */
export const DASHBOARD_PAGE = "dashboard";

/** The path of the vault's dashboard, from a context of any plugin on it: `<base><mount>/-/dashboard/`. */
export const dashboardPath = (context: Pick<ServerContext, "base">): string =>
  `${context.base.replace(/\/_svartz\/[^/]+$/, "")}/-/${DASHBOARD_PAGE}/`;

/** The vault's dashboard sections, with only the panels `viewer` may open, and without sections left empty. */
export async function openableSections(viewer: Account | null, context: ServerContext): Promise<DashboardSection[]> {
  const sections = await context.dashboard();
  // One check for every panel: a view's cost doesn't grow with the panels its plugins add.
  const permissions = [...new Set(sections.flatMap(({ panels }) => panels.map(({ permission }) => permission)))];
  const allowed = await canEachPermission(viewer, permissions, { vault: context.vault.id }, context.env);
  const held = new Set(permissions.filter((_, index) => allowed[index]));
  return sections
    .map((section) => ({ ...section, panels: section.panels.filter(({ permission }) => held.has(permission)) }))
    .filter(({ panels }) => panels.length > 0);
}

function indexPage(sections: readonly DashboardSection[], root: string): PluginPage {
  const groups = sections.map(({ plugin, title, panels }) => `<section class="sv-account-section" aria-labelledby="sv-dashboard-${escape(plugin)}">
<h2 id="sv-dashboard-${escape(plugin)}">${escape(title)}</h2>
<ul class="sv-dashboard-panels">${panels.map(({ id, title: panel }) => `<li><a href="${escape(`${root}${plugin}/${id}/`)}">${escape(panel)}</a></li>`).join("")}</ul>
</section>`);
  return { title: "Dashboard", html: `<div class="sv-account sv-dashboard">\n<h1>Dashboard</h1>\n${groups.join("\n")}\n</div>` };
}

/** A panel's page, below a link back to the dashboard. */
function framed(result: PageResult | undefined, root: string): PageResult | undefined {
  if (!result || "redirect" in result) return result;
  return { title: result.title, html: `<nav class="sv-dashboard-crumbs" aria-label="Breadcrumb"><a href="${escape(root)}">Dashboard</a></nav>\n${result.html}` };
}

/** Render `context.path` below `dashboard/` for `viewer`: the index, a panel, or `undefined` for the 404. */
export async function dashboardPage(request: Request, context: PageContext, viewer: Account | null): Promise<PageResult | undefined> {
  const [, plugin, panel, ...rest] = context.path.slice(0, -1).split("/");
  const sections = await openableSections(viewer, context);
  const root = dashboardPath(context);
  if (plugin === undefined) return sections.length > 0 ? indexPage(sections, root) : undefined;
  const found = sections.find((section) => section.plugin === plugin)?.panels.find(({ id }) => id === panel);
  if (!found) return undefined;
  return framed(await found.render(request, rest.length > 0 ? `${rest.join("/")}/` : ""), root);
}

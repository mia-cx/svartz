/**
 * The permission catalogue: every permission the plugins on a site declare, collected and checked at build time so a
 * malformed declaration fails the build instead of a check at runtime.
 */
import type { PermissionDeclaration, ResolvedConfig, SvartzPlugin } from "@svartz/core";
import { STATIC_ACTORS } from "./permissions";

/** `<plugin id>:<feature>:<action>`. */
const SLUG = /^([a-z0-9][a-z0-9-]*):[a-z0-9][a-z0-9-]*:(?:read|write|delete)$/;

function fail(message: string): never {
  throw new Error(`[svartz:auth] ${message}`);
}

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** `declaration` with only the fields the catalogue keeps, or the build failure that names what's wrong. */
function checked(declaration: PermissionDeclaration, plugin: string): PermissionDeclaration {
  const slug = SLUG.exec(typeof declaration?.slug === "string" ? declaration.slug : "");
  if (!slug) {
    fail(`plugin "${plugin}" declares permission ${JSON.stringify(declaration?.slug)}; use "namespace:feature:action" with action read, write or delete`);
  }
  if (slug[1] !== plugin) fail(`plugin "${plugin}" declares "${declaration.slug}"; a plugin declares only permissions starting "${plugin}:"`);
  if (!isText(declaration.name)) fail(`permission "${declaration.slug}" needs a name`);
  if (!isText(declaration.description)) fail(`permission "${declaration.slug}" needs a description`);
  const given: Record<string, unknown> = declaration.defaults ?? {};
  const stranger = Object.keys(given).find((actor) => !(STATIC_ACTORS as readonly string[]).includes(actor));
  if (stranger) fail(`permission "${declaration.slug}" sets a default for "${stranger}"; defaults go to ${STATIC_ACTORS.join(" and ")}`);
  // In a fixed order, so two vaults declaring the same defaults compare equal.
  const defaults: Record<string, "allow" | "deny"> = {};
  for (const actor of STATIC_ACTORS) {
    const value = given[actor];
    if (value === undefined) continue;
    if (value !== "allow" && value !== "deny") fail(`permission "${declaration.slug}" defaults ${actor} to ${JSON.stringify(value)}; use "allow" or "deny"`);
    defaults[actor] = value;
  }
  const { slug: id, name, description } = declaration;
  return { slug: id, name, description, ...Object.keys(defaults).length > 0 && { defaults } };
}

/**
 * Every permission the enabled plugins of `vaults` declare, once each. The same permission declared on two vaults must
 * be declared alike, since vaults that share accounts share grants.
 */
export function collectPermissions(vaults: readonly Pick<ResolvedConfig, "id" | "plugins">[]): PermissionDeclaration[] {
  const catalogue = new Map<string, { declaration: PermissionDeclaration; vault: string }>();
  for (const vault of vaults) {
    for (const plugin of vault.plugins as readonly SvartzPlugin[]) {
      if (plugin.disabled) continue;
      const declared = new Set<string>();
      for (const declaration of plugin.permissions ?? []) {
        const entry = checked(declaration, plugin.id);
        if (declared.has(entry.slug)) fail(`plugin "${plugin.id}" declares "${entry.slug}" twice`);
        declared.add(entry.slug);
        const known = catalogue.get(entry.slug);
        if (!known) catalogue.set(entry.slug, { declaration: entry, vault: vault.id });
        else if (JSON.stringify(known.declaration) !== JSON.stringify(entry)) {
          fail(`vault "${vault.id}" declares "${entry.slug}" differently than vault "${known.vault}"; vaults that share accounts must declare it alike`);
        }
      }
    }
  }
  return [...catalogue.values()].map(({ declaration }) => declaration);
}

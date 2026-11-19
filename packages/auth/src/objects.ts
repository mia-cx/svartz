/**
 * Grant objects as the dashboard's picker names them: a scope (`site` or `vault:<id>`) and, within a vault, a path to a
 * folder (`garden/`) or a page (`garden/roses`). Everything a form sends is checked here before it becomes an object.
 */
import { SITE } from "./permissions";

/** One path segment of a folder or page: no dot segments, separators, or control characters. */
const SEGMENT = /^(?!\.\.?$)[^/\\\p{Cc}]+$/u;

/**
 * The object the picker names, or `undefined` when it names none: an unknown vault, a path on the whole site, or a path
 * with an empty, `.` or `..` segment. `vaults` are the ids the site shares accounts across.
 */
export function pickedObject(scope: string, path: string, vaults: readonly string[]): string | undefined {
  const trimmed = path.trim().replace(/^\/+/, "");
  if (scope === SITE) return trimmed === "" ? SITE : undefined;
  const vault = scope.startsWith("vault:") ? scope.slice("vault:".length) : undefined;
  if (vault === undefined || !vaults.includes(vault)) return undefined;
  if (trimmed === "") return scope;
  const folder = trimmed.endsWith("/");
  const segments = (folder ? trimmed.slice(0, -1) : trimmed).split("/");
  if (!segments.every((segment) => SEGMENT.test(segment))) return undefined;
  return `${folder ? "folder" : "page"}:${vault}/${segments.join("/")}${folder ? "/" : ""}`;
}

/** The picker's two fields for `object`, so a form can show it again. */
export function pickerFields(object: string): { scope: string; path: string } {
  const [kind, rest = ""] = object.split(/:(.*)/s);
  if (kind === "vault") return { scope: object, path: "" };
  if (kind !== "folder" && kind !== "page") return { scope: SITE, path: "" };
  const slash = rest.indexOf("/");
  return { scope: `vault:${rest.slice(0, slash)}`, path: rest.slice(slash + 1) };
}

/** The objects a check on `object` consults, most specific first, ending in the site. */
export function chainOf(object: string): string[] {
  const { scope, path } = pickerFields(object);
  if (scope === SITE) return [SITE];
  const vault = scope.slice("vault:".length);
  const segments = path.split("/").filter(Boolean);
  const folders = (object.startsWith("page:") ? segments.slice(0, -1) : segments)
    .map((_, index, all) => `folder:${vault}/${all.slice(0, index + 1).join("/")}/`).reverse();
  return [...object.startsWith("page:") ? [object] : [], ...folders, scope, SITE];
}

/** `object` in words: "the whole site", "vault notes", "folder notes/garden/", "page notes/garden/roses". */
export function describeObject(object: string): string {
  if (object === SITE) return "the whole site";
  const [kind, rest = ""] = object.split(/:(.*)/s);
  return `${kind} ${rest}`;
}

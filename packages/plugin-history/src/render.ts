/**
 * A revision's Markdown as the site renders a note's body: the build's own Markdown steps, the ones the editor's
 * Split preview runs, then the build's sanitizing rules, since a revision is untrusted text and the page puts this
 * HTML straight into the document.
 */
import type { ElementContent, Root, RootContent } from "hast";
import { fromHtml } from "hast-util-from-html";
import { isUnsafeElement, safeAttributes, VOID_TAGS } from "@svartz/plugins/content";
import { renderPreview, type PreviewOptions } from "@svartz/plugins/preview";
import { extractFrontmatter } from "@svartz/plugins/routes";
import { escape } from "./html";

/** `node` as HTML, without what the build drops from a note: scripts and styles, handlers, script URLs, comments. */
function serialize(node: Root | RootContent | ElementContent): string {
  switch (node.type) {
    case "root":
      return node.children.map(serialize).join("");
    case "text":
      return escape(node.value);
    case "element": {
      if (isUnsafeElement(node)) return "";
      const attributes = Object.entries(safeAttributes(node))
        .filter(([name, value]) => value !== false && /^[a-z][a-z0-9:_.-]*$/i.test(name))
        .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escape(value)}"`))
        .join("");
      if (VOID_TAGS.has(node.tagName)) return `<${node.tagName}${attributes}>`;
      // A template's content is a fragment of its own, which the build never shows either.
      const children = node.tagName === "template" ? "" : node.children.map(serialize).join("");
      return `<${node.tagName}${attributes}>${children}</${node.tagName}>`;
    }
    default:
      return "";
  }
}

/** `markdown` rendered as the note at `options.path`, ready to put in a page. */
export async function renderRevision(markdown: string, options: PreviewOptions): Promise<string> {
  return serialize(fromHtml(await renderPreview(markdown, options), { fragment: true }));
}

/**
 * Whether the build would have published a note with `markdown`'s frontmatter, unprotected: not a draft, not private,
 * in no password group. A revision it would have hidden stays hidden, though the page is public now. Frontmatter the
 * build couldn't read counts as hidden.
 */
export function wasPublic(markdown: string): boolean {
  try {
    const { frontmatter = {} } = extractFrontmatter(markdown);
    return frontmatter.draft !== true && frontmatter.private !== true && frontmatter.password_group === undefined;
  } catch {
    return false;
  }
}

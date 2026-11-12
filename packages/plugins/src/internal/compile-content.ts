import type { Element, ElementContent, Root, RootContent } from "hast";
import { toHtml } from "hast-util-to-html";
import { activeContentSlot, containsCode, contentProps, isUnsafeElement, safeAttributes, VOID_TAGS } from "../content";

const MARKER = "SVARTZ_CONTENT_CHILDREN_8bdb1f";

function escapeSvelte(html: string): string {
  return html.replaceAll("{", "&#123;").replaceAll("}", "&#125;");
}

function serializeNode(node: RootContent | ElementContent, insideCode = false): string {
  if (node.type !== "element") {
    return node.type === "text" ? escapeSvelte(toHtml(node)) : "";
  }
  if (isUnsafeElement(node)) return "";

  const safeElement: Element = { ...node, properties: safeAttributes(node) };
  const activeSlot = activeContentSlot(node, insideCode);
  const serializedChildren = node.children.map((child) => serializeNode(child, containsCode(node, insideCode))).join("");
  // A code block's <pre> stays literal inside the slot: Svelte keeps whitespace only inside a real <pre>.
  const children = activeSlot === "codeBlock" && node.tagName === "pre"
    ? wrapLiteral(safeElement, serializedChildren)
    : serializedChildren;
  if (activeSlot) {
    const open = `<contentComponents.${activeSlot} {...${JSON.stringify(contentProps(node, activeSlot))}}`;
    return VOID_TAGS.has(node.tagName)
      ? `${open} />`
      : `${open}>${children}</contentComponents.${activeSlot}>`;
  }

  if (VOID_TAGS.has(node.tagName)) return escapeSvelte(toHtml(safeElement));
  return wrapLiteral(safeElement, children);
}

// rehype-pretty-code makes a code block's <pre> focusable so keyboards can scroll it.
// That is correct for a scroll region, but Svelte flags every one.
const FOCUSABLE_PRE_IGNORE = "<!-- svelte-ignore a11y_no_noninteractive_tabindex -->";

/** The element's own tags as literal markup around already-serialized children. */
function wrapLiteral(element: Element, children: string): string {
  const shell = toHtml({ ...element, children: [{ type: "text", value: MARKER }] });
  const markerAt = shell.indexOf(MARKER);
  if (markerAt < 0) return escapeSvelte(toHtml(element));
  const ignore = element.tagName === "pre" && element.properties.tabindex !== undefined ? FOCUSABLE_PRE_IGNORE : "";
  return ignore + escapeSvelte(shell.slice(0, markerAt)) + children + escapeSvelte(shell.slice(markerAt + MARKER.length));
}

/** Compile parsed, inert Markdown into Svelte markup with overridable content slots. */
export function compileContent(tree: Root): string {
  return tree.children.map((child) => serializeNode(child)).join("");
}

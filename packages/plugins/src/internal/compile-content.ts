import type { Element, ElementContent, Root, RootContent } from "hast";
import { toHtml } from "hast-util-to-html";

type ContentSlot = "callout" | "codeBlock" | "image" | "link" | "embed";
const MARKER = "SVARTZ_CONTENT_CHILDREN_8bdb1f";
const UNSAFE_TAGS = new Set(["script", "style", "object", "embed", "base", "link", "meta"]);
const VOID_TAGS = new Set(["area", "base", "br", "col", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function escapeSvelte(html: string): string {
  return html.replaceAll("{", "&#123;").replaceAll("}", "&#125;");
}

function attributeName(name: string): string {
  if (name === "className") return "class";
  if (name === "htmlFor") return "for";
  if (name === "tabIndex") return "tabindex";
  for (const prefix of ["aria", "data"]) {
    if (name.startsWith(prefix) && name.length > prefix.length && /[A-Z]/.test(name[prefix.length]!)) {
      const suffix = name.slice(prefix.length).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      return `${prefix}-${suffix.replace(/^-/, "")}`;
    }
  }
  return name;
}

function attributes(element: Element): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (const [name, raw] of Object.entries(element.properties)) {
    const key = attributeName(name);
    if (/^on/i.test(key) || key === "srcDoc" || key === "srcdoc" || raw === null || raw === undefined) {
      continue;
    }
    const value = Array.isArray(raw) ? raw.join(" ") : raw;
    if (
      ["href", "src", "action", "formAction", "xLinkHref"].includes(key) &&
      /^\s*(?:javascript|data:text\/html):/i.test(String(value))
    ) continue;
    result[key] = typeof value === "boolean" ? value : String(value);
  }
  return result;
}

function textContent(node: Root | RootContent | ElementContent): string {
  if (node.type === "text") return node.value;
  if ("children" in node) return node.children.map(textContent).join("");
  return "";
}

function findCalloutMarker(element: Element): Element | undefined {
  for (const child of element.children) {
    if (child.type !== "element") continue;
    if (child.tagName === "span" && child.properties.dataCallout) return child;
    const nested = findCalloutMarker(child);
    if (nested) return nested;
  }
  return undefined;
}

function findElement(element: Element, tagName: string): Element | undefined {
  for (const child of element.children) {
    if (child.type !== "element") continue;
    if (child.tagName === tagName) return child;
    const nested = findElement(child, tagName);
    if (nested) return nested;
  }
  return undefined;
}

function codeLanguage(element: Element): string | undefined {
  for (const candidate of [element, findElement(element, "code"), findElement(element, "pre")]) {
    if (!candidate) continue;
    const language = candidate.properties.dataLanguage ?? candidate.properties["data-language"];
    if (typeof language === "string" && language) return language;
    const classes = candidate.properties.className;
    const match = (Array.isArray(classes) ? classes : [classes])
      .find((name) => typeof name === "string" && name.startsWith("language-"));
    if (typeof match === "string") return match.slice("language-".length);
  }
  return;
}

function contentSlot(element: Element): ContentSlot | undefined {
  if (element.tagName === "blockquote" && findCalloutMarker(element)) return "callout";
  if (element.tagName === "figure" && element.properties.dataRehypePrettyCodeFigure !== undefined) return "codeBlock";
  if (element.tagName === "pre") return "codeBlock";
  if (element.tagName === "img") return "image";
  if (element.tagName === "a") return "link";
  if (element.tagName === "div" && String(element.properties.className).includes("svartz-embed")) return "embed";
  if (["audio", "video", "iframe"].includes(element.tagName)) return "embed";
  return undefined;
}

function serializeNode(node: RootContent | ElementContent, insideCode = false): string {
  if (node.type !== "element") {
    return node.type === "text" ? escapeSvelte(toHtml(node)) : "";
  }
  if (UNSAFE_TAGS.has(node.tagName) || node.tagName.startsWith("svelte:")) return "";

  const safeElement: Element = { ...node, properties: attributes(node) };
  const slot = contentSlot(node);
  const codeFigure = slot === "codeBlock" && node.tagName === "figure";
  const children = node.children.map((child) => serializeNode(child, insideCode || codeFigure)).join("");
  const activeSlot = insideCode && slot === "codeBlock" ? undefined : slot;
  if (activeSlot) {
    const attrs = attributes(node);
    const marker = activeSlot === "callout" ? findCalloutMarker(node) : undefined;
    const props = {
      tag: node.tagName,
      attributes: attrs,
      text: textContent(node),
      href: attrs.href,
      src: attrs.src,
      alt: attrs.alt,
      language: activeSlot === "codeBlock" ? codeLanguage(node) : undefined,
      calloutType: marker ? String(marker.properties.dataCallout) : undefined,
      title: marker ? textContent(findElement(node, "strong") ?? node) : undefined,
      fold: marker?.properties.dataCalloutFold ? String(marker.properties.dataCalloutFold) : undefined,
      target: node.properties.dataEmbed ? String(node.properties.dataEmbed) : undefined,
    };
    const open = `<contentComponents.${activeSlot} {...${JSON.stringify(props)}}`;
    return VOID_TAGS.has(node.tagName)
      ? `${open} />`
      : `${open}>${children}</contentComponents.${activeSlot}>`;
  }

  if (VOID_TAGS.has(node.tagName)) return escapeSvelte(toHtml(safeElement));
  const shell = toHtml({ ...safeElement, children: [{ type: "text", value: MARKER }] });
  const markerAt = shell.indexOf(MARKER);
  if (markerAt < 0) return escapeSvelte(toHtml(safeElement));
  return escapeSvelte(shell.slice(0, markerAt)) + children + escapeSvelte(shell.slice(markerAt + MARKER.length));
}

/** Compile parsed, inert Markdown into Svelte markup with overridable content slots. */
export function compileContent(tree: Root): string {
  return tree.children.map((child) => serializeNode(child)).join("");
}

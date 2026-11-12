/**
 * Which content slot (callout, code block, image, link, embed) renders each element of a note's HTML tree, the props
 * that slot's component receives, and the attributes that survive sanitizing. The build compiles notes with it
 * (`compileContent`), and `@svartz/ui` renders a preview in the browser with it, so both treat a tree the same way.
 */
import type { Element, ElementContent, Root, RootContent } from "hast";

export type ContentSlot = "callout" | "codeBlock" | "image" | "link" | "embed";

/** Elements dropped with their content: they would run code or restyle the page. */
const UNSAFE_TAGS = new Set(["script", "style", "object", "embed", "base", "link", "meta"]);
export const VOID_TAGS = new Set(["area", "base", "br", "col", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/** Whether `element` is dropped, children and all. */
export const isUnsafeElement = (element: Element) => UNSAFE_TAGS.has(element.tagName) || element.tagName.startsWith("svelte:");

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

/** `element`'s HTML attributes without event handlers, `srcdoc`, or script and HTML-document URLs. */
export function safeAttributes(element: Element): Record<string, string | boolean> {
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

// rehype-pretty-code sets the kebab-case key directly, after rehype-raw has run.
const isCodeFigure = (element: Element) =>
  element.properties["data-rehype-pretty-code-figure"] !== undefined ||
  element.properties.dataRehypePrettyCodeFigure !== undefined;

/** The slot that renders `element`, or `undefined` for plain markup. */
export function contentSlot(element: Element): ContentSlot | undefined {
  if (element.tagName === "blockquote" && findCalloutMarker(element)) return "callout";
  if (element.tagName === "figure" && isCodeFigure(element)) return "codeBlock";
  if (element.tagName === "pre") return "codeBlock";
  if (element.tagName === "img") return "image";
  if (element.tagName === "a") return "link";
  const classes = element.properties.className;
  if (element.tagName === "div" && (Array.isArray(classes) ? classes.includes("svartz-embed") : classes === "svartz-embed")) return "embed";
  if (["audio", "video", "iframe"].includes(element.tagName)) return "embed";
  return undefined;
}

const stringValue = (value: string | boolean | undefined) => (typeof value === "string" ? value : undefined);

/** The props `slot`'s component gets for `element`, besides its children. */
export function contentProps(element: Element, slot: ContentSlot) {
  const attributes = safeAttributes(element);
  const marker = slot === "callout" ? findCalloutMarker(element) : undefined;
  return {
    tag: element.tagName,
    attributes,
    text: textContent(element),
    href: stringValue(attributes.href),
    src: stringValue(attributes.src),
    alt: stringValue(attributes.alt),
    language: slot === "codeBlock" ? codeLanguage(element) : undefined,
    calloutType: marker ? String(marker.properties.dataCallout) : undefined,
    title: marker ? textContent(findElement(element, "strong") ?? element) : undefined,
    fold: marker?.properties.dataCalloutFold ? String(marker.properties.dataCalloutFold) : undefined,
    target: element.properties.dataEmbed ? String(element.properties.dataEmbed) : undefined,
  };
}

/**
 * The slot that renders `element` inside a tree, where `insideCode` says an ancestor is a code block's figure: the
 * figure's own `<pre>` belongs to it, not to a slot of its own.
 */
export function activeContentSlot(element: Element, insideCode: boolean): ContentSlot | undefined {
  const slot = contentSlot(element);
  return insideCode && slot === "codeBlock" ? undefined : slot;
}

/** Whether `element`'s descendants are inside a code block, given whether `element` is. */
export const containsCode = (element: Element, insideCode: boolean) =>
  insideCode || (element.tagName === "figure" && contentSlot(element) === "codeBlock");

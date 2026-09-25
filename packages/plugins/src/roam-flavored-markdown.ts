/** Optional Roam syntax, based on the supported subset in Quartz 4.5.2. */
import { definePlugin, getCompilerContributions } from "@svartz/core";
import { findAndReplace, type FindAndReplaceList } from "mdast-util-find-and-replace";
import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { extractRawLinks } from "./internal/parse";

export interface RoamOptions {
  orComponent: boolean;
  TODOComponent: boolean;
  DONEComponent: boolean;
  videoComponent: boolean;
  audioComponent: boolean;
  pdfComponent: boolean;
  blockquoteComponent: boolean;
}

const defaults: RoamOptions = {
  orComponent: true, TODOComponent: true, DONEComponent: true,
  videoComponent: true, audioComponent: true, pdfComponent: true, blockquoteComponent: true,
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function safeMediaUrl(value: string): string | undefined {
  const url = value.trim();
  if (!url || /[\u0000-\u001f]/.test(url)) return;
  try {
    const parsed = new URL(url, "https://svartz.invalid");
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : undefined;
  } catch {
    return;
  }
}

function mediaHtml(type: "video" | "audio" | "pdf", rawUrl: string): string | undefined {
  const url = safeMediaUrl(rawUrl);
  if (!url) return;
  if (type === "pdf") return `<iframe src="${escapeHtml(url)}" title="Embedded PDF"></iframe>`;
  if (type === "audio") return `<audio controls src="${escapeHtml(url)}"></audio>`;

  const parsed = new URL(url, "https://svartz.invalid");
  const host = parsed.hostname.toLowerCase();
  if (["youtube.com", "www.youtube.com", "youtu.be"].includes(host)) {
    const id = host === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
    if (id && /^[\w-]+$/.test(id)) {
      return `<iframe src="https://www.youtube.com/embed/${id}" title="Embedded video" allow="fullscreen"></iframe>`;
    }
  }
  return `<video controls src="${escapeHtml(url)}"></video>`;
}

function expandParsedTasks(node: Extract<Root["children"][number], { type: "paragraph" }>, options: RoamOptions): void {
  for (let index = 0; index < node.children.length - 2; index += 1) {
    const before = node.children[index];
    const reference = node.children[index + 1];
    const after = node.children[index + 2];
    if (before?.type !== "text" || reference?.type !== "linkReference" || after?.type !== "text") continue;
    if (!before.value.endsWith("{{[") || !after.value.startsWith("]}}")) continue;
    const done = reference.identifier.toUpperCase() === "DONE";
    if (!done && reference.identifier.toUpperCase() !== "TODO") continue;
    if (!(done ? options.DONEComponent : options.TODOComponent)) continue;
    const prefix = before.value.slice(0, -3);
    const suffix = after.value.slice(3);
    node.children.splice(index, 3,
      ...(prefix ? [{ type: "text" as const, value: prefix }] : []),
      { type: "html", value: `<input type="checkbox" aria-label="${done ? "Done" : "To do"}"${done ? " checked" : ""} disabled>` },
      ...(suffix ? [{ type: "text" as const, value: suffix }] : []),
    );
  }
}

function remarkRoam(options: RoamOptions) {
  return (tree: Root, file: { value?: unknown; contents?: unknown }) => {
    const markdown = String(file.contents ?? file.value ?? "");
    visit(tree, "strong", (node, index, parent) => {
      const offset = node.position?.start.offset;
      if (offset === undefined || index === undefined || !parent) return;
      // Roam treats underscore pairs as italics; asterisk pairs retain Markdown bold.
      if (markdown.slice(offset, offset + 2) === "__") {
        parent.children[index] = { type: "emphasis", children: node.children };
      }
    });

    visit(tree, "paragraph", (node, index, parent) => {
      if (index === undefined || !parent) return;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      const source = start === undefined || end === undefined ? "" : markdown.slice(start, end).trim();
      const quote = options.blockquoteComponent && /^\[\[>\]\]\s*(.+)$/.exec(source);
      if (quote) {
        parent.children[index] = { type: "blockquote", children: [{ type: "paragraph", children: [{ type: "text", value: quote[1]! }] }] };
        return;
      }
      const media = /^\{\{\[\[(audio|video|pdf)\]\]:\s*(.+)\}\}$/i.exec(source);
      if (!media) {
        expandParsedTasks(node, options);
        return;
      }
      const type = media[1]!.toLowerCase() as "audio" | "video" | "pdf";
      if (!options[`${type}Component`]) return;
      const html = mediaHtml(type, media[2]!);
      if (html) parent.children[index] = { type: "html", value: html };
    });

    const replacements: FindAndReplaceList = [
      [/\^\^(.+?)\^\^/g, (_match, value: string) => ({ type: "html", value: `<span class="text-highlight">${escapeHtml(value)}</span>` })],
    ];
    if (options.orComponent) replacements.push([/\{\{or:([^{}]+)\}\}/g, (_match: string, choices: string) => ({
      type: "html", value: `<select aria-label="Choose an option">${choices.split("|").map((choice) => `<option value="${escapeHtml(choice)}">${escapeHtml(choice)}</option>`).join("")}</select>`,
    })]);
    if (options.TODOComponent) replacements.push([/\{\{(?:\[\[)?TODO(?:\]\])?\}\}/g, () => ({ type: "html", value: '<input type="checkbox" aria-label="To do" disabled>' })]);
    if (options.DONEComponent) replacements.push([/\{\{(?:\[\[)?DONE(?:\]\])?\}\}/g, () => ({ type: "html", value: '<input type="checkbox" aria-label="Done" checked disabled>' })]);
    findAndReplace(tree, replacements, { ignore: ["link", "linkReference", "html"] });
  };
}

/** Add Roam prose syntax after the normal GFM parser. */
export const roamFlavoredMarkdown = (userOptions: Partial<RoamOptions> = {}) => definePlugin(() => ({
  id: "core:roam-flavored-markdown",
  parseFrontmatter: {
    run(ctx) {
      ctx.meta.set("svartz:roamMedia", true);
      for (const file of ctx.files) {
        if (![".md", ".mdx", ".svx"].includes(file.extension ?? "")) continue;
        file.rawLinks = extractRawLinks(file.content, true);
      }
    },
    options: { fatal: true, enforce: "post" },
  },
  transformGfm: {
    run(ctx) {
      const options = { ...defaults, ...userOptions };
      getCompilerContributions(ctx).remarkPlugins.push(() => remarkRoam(options));
    },
    options: { fatal: true, enforce: "post" },
  },
}))();

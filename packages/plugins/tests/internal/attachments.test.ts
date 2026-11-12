import type { ProcessedFile } from "@svartz/core";
import { describe, expect, it } from "vitest";
import { createAssetResolver } from "../../src/internal/asset-references";
import { attachmentResolver } from "../../src/internal/attachments";

const file = (path: string): ProcessedFile => ({ path, extension: path.slice(path.lastIndexOf(".")), slug: "", content: "" });

const ATTACHMENTS = ["Assets/chart.png", "People/photo.png", "Assets/photo.png", "Assets/My Logo.svg", "logo.png"];

describe("attachment resolution", () => {
  // The build's resolver and the preview's resolve every link alike, by the rules the build has always used.
  it.each([
    ["a unique name from any folder", "People/Guide.md", "chart.png", "Assets/chart.png"],
    ["the note's folder before a shared name", "People/Guide.md", "photo.png", "People/photo.png"],
    ["a shared name outside the note's folder", "Guide.md", "photo.png", undefined],
    ["a vault path", "People/Guide.md", "Assets/photo.png", "Assets/photo.png"],
    ["a parent folder, decoded", "People/Guide.md", "../Assets/My%20Logo.svg", "Assets/My Logo.svg"],
    ["any case, dropping query and fragment", "People/Guide.md", "ASSETS/CHART.PNG?v=2#top", "Assets/chart.png"],
    ["a root path as the vault path first", "Assets/Guide.md", "/logo.png", "logo.png"],
    ["Windows separators", "Guide.md", "Assets\\chart.png", "Assets/chart.png"],
    ["no external URL", "Guide.md", "https://example.com/chart.png", undefined],
    ["no file the vault lacks", "Guide.md", "missing.png", undefined],
  ])("finds %s", (_case, note, target, expected) => {
    expect(createAssetResolver(ATTACHMENTS.map(file))(file(note), target)).toBe(expected);
    expect(attachmentResolver(ATTACHMENTS)(note, target)).toBe(expected);
  });
});

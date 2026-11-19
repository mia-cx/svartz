import { pathRoute } from "@svartz/plugins/routes";
import { describe, expect, it } from "vitest";
// `@svartz/auth` can't depend on the route builder, so the two meet here, where both are dependencies.
import { handleFrom, isHandle } from "../../auth/src/handle";

const FOLDERS = ["users", "wiki/people"];
/** Spellings the route builder rewrites in a file name (folder notes, `_index`, hyphen runs), and their neighbours. */
const HANDLES = [
  "ada", "index", "ada_index", "a_index", "my_index", "index-2", "ada-index", "adaindex", "indexes", "index_ada", "my_index_page",
  "a--b", "a---b", "a-b", "a_b", "a__b", "a_-b", "a-_b", "_index", "index_", "0", `${"a".repeat(33)}_index`,
];
/** Provider usernames and display names the handle chooser starts from. */
const NAMES = ["Index", "INDEX", "Ada_Index", "ada__index", "Ada _Index", "A--B", "index.md", "_index", "Grace Hopper", ""];

/** The handles in `handles` whose user page in `folder` gets another address than `<folder>/<handle>`. */
const misplaced = (handles: readonly string[], folder: string) =>
  handles.filter((handle) => pathRoute(`${folder}/${handle}.md`) !== `${folder}/${handle}`);

describe("handles and user page addresses", () => {
  // Proves every handle auth accepts names exactly its user page's address, so the owner override and the account
  // page find the page its owner writes, and no handle names another's page.
  it.each(FOLDERS)("gives every accepted handle the address %s/<handle>", (folder) => {
    expect(misplaced(HANDLES.filter(isHandle), folder)).toEqual([]);
  });

  // Proves the handle chooser and old-cookie upgrades, which take a handle without asking, only start from such handles.
  it.each(FOLDERS)("suggests only handles that name their own page in %s", (folder) => {
    const suggested = NAMES.map(handleFrom);

    expect(suggested.filter((handle) => !isHandle(handle))).toEqual([]);
    expect(misplaced(suggested, folder)).toEqual([]);
  });
});

/** Shared MiniSearch schema for artifact generation and browser search. */
export const SEARCH_INDEX_OPTIONS = {
  fields: ["title", "description", "content", "tags", "aliases"],
  storeFields: ["slug", "href", "title", "description", "tags"],
  idField: "id",
};

/**
 * `@svartz/plugins/routes`: how `core:allocate-routes` derives a note's route, for code that must predict one,
 * such as a server refusing a new note that would take an existing page's URL. Pure, so server bundles may import it.
 *
 * `extractFrontmatter` is the parser `core:parse-frontmatter` reads a note's frontmatter with, so a server reads the
 * slug and aliases of Markdown it is about to write as the build will.
 */
export { extractFrontmatter } from "./internal/parse";
export { alternateNames, alternateRoutes, isNote, pathRoute, requestedSlug, routeHref } from "./internal/routes";

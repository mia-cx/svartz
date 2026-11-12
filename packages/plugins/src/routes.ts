/**
 * `@svartz/plugins/routes`: how `core:allocate-routes` derives a note's route, for code that must predict one,
 * such as a server refusing a new note that would take an existing page's URL. Pure, so server bundles may import it.
 */
export { alternateNames, isNote, pathRoute, requestedSlug, routeHref } from "./internal/routes";

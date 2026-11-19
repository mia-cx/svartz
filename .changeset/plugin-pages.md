---
"@svartz/core": minor
"@svartz/vite": minor
"@svartz/ui": minor
"svartz": minor
---

Server plugins can render pages inside the theme's shell. A plugin claims page names with `server: { module, pages: ["greet"] }`, and its factory returns `{ handle, page }`: `page` answers each request under `<mount>/-/greet/` with a title and HTML, which the theme's default layout renders as its body, beside the explorer and under the header and search. Plugin pages render on every request and are never cached or prerendered; notes stay prerendered, and `/_svartz/<id>/` stays raw HTTP. A static vault with a plugin page fails the build, naming the vault and the plugin.

The standalone shell renders plugin pages through a new `src/routes/[...mount=svartzMount]/-/[...page=svartzPage]/` route. Its param matchers, `isPluginPageMount` and `isPluginPageName` from `virtual:svartz/host`, send it only the page names claimed by the plugins of the vault at that mount, so a note in a folder named `-` stays a prerendered note, also under a name only another vault claims. A vault that publishes a note under a claimed name fails the build, naming the note. `npx svartz init` adds the route and its matchers (`src/params.ts` on SvelteKit 3, `src/params/` on SvelteKit 2) to host apps with a server adapter. A host app's build fails when a vault claims pages and no route renders them; run `npx svartz init`, or copy the route from the host vaults guide. The route renders `SvartzPluginPage` from `@svartz/ui/runtime` with what `svartzPage` from `virtual:svartz/server` answers.

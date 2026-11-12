// Preloaded with `node --import` so the CLI runs as a published install does: Svartz's peer dependencies
// resolve from the host app in the current directory, not from the workspace's own toolchain.
import { registerHooks } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const host = pathToFileURL(join(process.cwd(), "package.json")).href;
const peer = /^(?:vite|svelte|@sveltejs\/vite-plugin-svelte)(?:\/|$)/;

registerHooks({
  resolve: (specifier, context, next) => next(specifier, peer.test(specifier) ? { ...context, parentURL: host } : context),
});

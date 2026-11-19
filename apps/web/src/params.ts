import { defineParams } from '@sveltejs/kit/params';

// SvelteKit also imports this file in plain Node, only to check it defines the matchers below. There, without Vite,
// `import.meta.env` is undefined and the virtual module can't resolve, so it isn't loaded.
const host = import.meta.env ? await import('virtual:svartz/host') : undefined;

// Plugin pages answer `<mount>/-/<name>/` only where a plugin of the vault at <mount> claims <name>; every other path stays a note.
export const params = defineParams({
	svartzMount: (param) => (host?.isPluginPageMount(param) ? param : undefined),
	svartzPage: (param) => (host?.isPluginPageName(param) ? param : undefined)
});

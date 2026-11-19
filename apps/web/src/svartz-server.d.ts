/** The CLI aliases this to the vault's generated server registry. */
declare module 'virtual:svartz/server' {
	export const svartzHandle: import('@sveltejs/kit/hooks').Handle;
	/** `PageResult` from `@svartz/core`: the plugin page at `event.url`, if a plugin renders one there. */
	export function svartzPage(
		event: import('@sveltejs/kit').RequestEvent
	): Promise<{ title: string; html: string } | { redirect: string } | undefined>;
}

/**
 * Serve a page's Markdown copy to LLM agents. Add the hook in `src/hooks.server.ts`:
 *
 * ```ts
 * export { markdownForAgents as handle } from '@svartz/ui/agent-markdown';
 * ```
 *
 * Compose it with other hooks through SvelteKit's `sequence`. The hook runs only
 * where SvelteKit handles the request: a static host serves prerendered HTML
 * without it, so agents there find the copy through `<link rel="alternate">`.
 */
import type { Handle } from '@sveltejs/kit';

/** User agents of AI crawlers and assistants that fetch pages for a model. */
const AGENT_USER_AGENT =
	/\b(?:GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|MistralAI-User|DuckAssistBot|cohere-ai|meta-externalagent|CCBot)\b/i;

function quality(accept: string, type: string): number {
	for (const part of accept.split(',')) {
		const [media, ...params] = part.trim().toLowerCase().split(';');
		if (media?.trim() !== type) continue;
		const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
		return q ? Number(q.slice(2)) || 0 : 1;
	}
	return 0;
}

/** True for an AI agent's user agent, or an Accept header that ranks Markdown at least as high as HTML. */
export function wantsMarkdown(request: Request): boolean {
	if (AGENT_USER_AGENT.test(request.headers.get('user-agent') ?? '')) return true;
	const accept = request.headers.get('accept') ?? '';
	const markdown = quality(accept, 'text/markdown');
	return markdown > 0 && markdown >= quality(accept, 'text/html');
}

/** Copies Svartz may have written for a page URL: `/a/` has `/a.md`, and a vault home has `/<mount>/index.md`. */
function copyPaths(pathname: string): string[] {
	const path = pathname.replace(/\/+$/, '');
	return path ? [`${path}.md`, `${path}/index.md`] : ['/index.md'];
}

export const markdownForAgents: Handle = async ({ event, resolve }) => {
	const { request, url } = event;
	// A path with an extension is a file, including the copies this hook fetches.
	if (!['GET', 'HEAD'].includes(request.method) || /\.[^/]+$/.test(url.pathname) || !wantsMarkdown(request)) {
		return resolve(event);
	}
	for (const path of copyPaths(url.pathname)) {
		const copy = await event.fetch(path);
		if (!copy.ok) continue;
		return new Response(request.method === 'HEAD' ? null : copy.body, {
			headers: {
				'content-type': 'text/markdown; charset=utf-8',
				'content-location': path,
				vary: 'Accept, User-Agent'
			}
		});
	}
	return resolve(event);
};

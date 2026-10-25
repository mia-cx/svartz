import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { markdownForAgents, wantsMarkdown } from './agent-markdown';

const copies: Record<string, string> = {
	'/docs/guides/setup.md': '# Setup\n',
	'/docs/index.md': '# Docs\n'
};

async function request(path: string, headers: Record<string, string>, method = 'GET') {
	const url = new URL(path, 'https://example.com');
	const event = {
		request: new Request(url, { method, headers }),
		url,
		fetch: async (target: string) =>
			target in copies ? new Response(copies[target]) : new Response('Not found', { status: 404 })
	} as unknown as RequestEvent;
	return markdownForAgents({ event, resolve: async () => new Response('<html>page</html>') });
}

describe('Markdown for agents', () => {
	it('serves the copy to an AI agent and the page to a browser', async () => {
		const agent = await request('/docs/guides/setup/', { 'user-agent': 'Mozilla/5.0 (compatible; ClaudeBot/1.0)' });
		expect(agent.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
		expect(agent.headers.get('vary')).toBe('Accept, User-Agent');
		expect(await agent.text()).toBe('# Setup\n');

		const browser = await request('/docs/guides/setup/', {
			'user-agent': 'Mozilla/5.0 Firefox/140.0',
			accept: 'text/html,application/xhtml+xml,*/*;q=0.8'
		});
		expect(await browser.text()).toBe('<html>page</html>');
	});

	it('finds a vault home copy and falls back to the page when no copy exists', async () => {
		const home = await request('/docs/', { accept: 'text/markdown' });
		expect(await home.text()).toBe('# Docs\n');
		const tags = await request('/docs/tags/', { accept: 'text/markdown' });
		expect(await tags.text()).toBe('<html>page</html>');
	});

	it('answers HEAD without a body and leaves files alone', async () => {
		const head = await request('/docs/guides/setup/', { accept: 'text/markdown' }, 'HEAD');
		expect(head.headers.get('content-location')).toBe('/docs/guides/setup.md');
		expect(head.body).toBeNull();
		const file = await request('/docs/rss.xml', { accept: 'text/markdown' });
		expect(await file.text()).toBe('<html>page</html>');
	});

	it('follows Accept preference between Markdown and HTML', () => {
		const prefers = (accept: string) => wantsMarkdown(new Request('https://example.com/', { headers: { accept } }));
		expect(prefers('text/markdown, text/html;q=0.9')).toBe(true);
		expect(prefers('text/markdown, text/html')).toBe(true);
		expect(prefers('text/html, text/markdown;q=0.5')).toBe(false);
		expect(prefers('text/markdown;q=0')).toBe(false);
		expect(prefers('*/*')).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SchemaTree from './SchemaTree.svelte';
import { readSchema } from './schema.js';

const renderText = (raw: unknown) => {
	const { body } = render(SchemaTree, { props: { schema: readSchema(raw)!, schemaHref: (name: string) => `/schemas/${name}`, entries: [] } });
	return body.replace(/<!--[^]*?-->/g, '');
};

/** Each alternative's name with the field names listed under it, in order. */
const branches = (html: string) =>
	[...html.matchAll(/<span class="branch[^"]*">([^<]+)<\/span>/g)].map((match) => match[1]);

it("nests a map's value fields under its key, not beside the map's own fields", () => {
	const text = renderText({
		type: 'object',
		properties: {
			pets: { type: 'object', additionalProperties: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } } }
		}
	});

	// pets > [key: string] > id: three levels, so `id` is two nested lists deep.
	expect(text).toMatch(/pets<\/code>.*map of object/s);
	expect(text).toMatch(/pets<\/code>.*nested">.*\[key: string\]<\/code>.*nested">.*id<\/code>/s);
});

// The schema forms below are Logitland's, as its contracts emit them.
describe('unions', () => {
	it('lists each alternative of a top-level union by its discriminator, with its own fields and required marks', () => {
		const text = renderText({
			oneOf: [
				{ type: 'object', properties: { kind: { type: 'string', const: 'none' } }, required: ['kind'] },
				{
					type: 'object',
					properties: {
						kind: { type: 'string', const: 'webhook' },
						url_host: { type: 'string' },
						paused_reason: { type: ['string', 'null'] },
						retry_after: { type: 'integer' }
					},
					required: ['kind', 'url_host', 'paused_reason']
				}
			]
		});
		expect(text).toContain('One of');
		expect(branches(text)).toEqual(['kind: none', 'kind: webhook']);
		const webhook = text.slice(text.indexOf('kind: webhook'));
		expect(webhook).toMatch(/url_host<\/code>.*?string<\/span>.*?Required/s);
		expect(webhook).toMatch(/paused_reason<\/code>.*?string \| null<\/span>.*?Required/s);
		expect(webhook).toMatch(/retry_after<\/code>.*?integer<\/span>.*?Optional/s);
	});

	it("opens an array of event variants into each variant's nested fields", () => {
		const event = (type: string, extra: Record<string, unknown>) => ({
			type: 'object',
			properties: { type: { type: 'string', const: type }, data: { type: 'object', properties: extra, required: Object.keys(extra) } },
			required: ['type', 'data']
		});
		const text = renderText({
			type: 'object',
			properties: {
				events: {
					type: 'array',
					maxItems: 100,
					items: { oneOf: [event('message.created', { content: { type: 'string' } }), event('member.left', { member_id: { type: 'string' } })] }
				}
			}
		});
		expect(text).toMatch(/events<\/code>.*?object\[\]<\/span>/s);
		expect(branches(text)).toEqual(['type: message.created', 'type: member.left']);
		expect(text).toMatch(/type: message\.created.*data<\/code>.*content<\/code>.*type: member\.left.*data<\/code>.*member_id<\/code>/s);
	});

	it('names alternatives by title, else position, and links $ref alternatives instead of expanding them', () => {
		const text = renderText({
			anyOf: [
				{ title: 'Assertion grant', type: 'object', properties: { assertion: { type: 'string' } } },
				{ type: 'object', properties: { claim_token: { type: 'string' } } },
				{ $ref: 'TokenResponse' }
			]
		});
		expect(text).toContain('Any of');
		expect(branches(text)).toEqual(['Assertion grant', 'Option 2']);
		expect(text).toMatch(/<a class="type[^"]*" href="\/schemas\/TokenResponse"[^>]*>TokenResponse<\/a>/);
	});

	it('keeps scalar unions on one line', () => {
		const text = renderText({ type: 'object', properties: { id: { anyOf: [{ type: 'string' }, { type: 'number' }], nullable: true } } });
		expect(text).toContain('string | number | null');
		expect(text).not.toContain('One of');
		expect(text).not.toContain('Any of');
	});
});

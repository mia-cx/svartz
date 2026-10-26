import type { IndexEntry, SvartzTheme, VaultView } from '@svartz/core';
import type { Component, Snippet } from 'svelte';
import { isRecord } from '../theme-settings.js';
import type { SchemaNode } from './schema.js';

type Properties = Readonly<Record<string, unknown>>;

/** A signal hue from the design tokens (`--sv-hue-<name>`), or `neutral` for kinds that aren't calls. */
export type ReferenceHue = 'blue' | 'cyan' | 'teal' | 'green' | 'amber' | 'orange' | 'red' | 'violet' | 'neutral';

/** A fixed-width kind badge: an HTTP method, a GraphQL kind, `TOOL`, `SCHEMA`. */
export interface ReferenceBadge {
	readonly label: string;
	readonly hue: ReferenceHue;
}

/** One tab of a `CodePanel`. */
export interface CodeTab {
	readonly id: string;
	readonly label: string;
	readonly code: string;
	/** Marks what the tab shows, such as a status or an error kind. */
	readonly badge?: ReferenceBadge;
	/** A line above the code that says what it shows. */
	readonly caption?: string;
}

/** How a page lists in the sidebar and on listing pages. */
export interface ReferenceNavItem {
	readonly badge?: ReferenceBadge;
	/** The sidebar label: a path or name, set in monospace. */
	readonly label: string;
	/** Sort order within a group: rank, then key, then order. Schemas rank 0, operations 1. */
	readonly sort: readonly [rank: number, key: string, order: number];
}

/** What every renderer component receives besides its page data. */
export interface ReferenceContext {
	readonly entry: IndexEntry;
	readonly vault: VaultView;
	readonly themeConfig: Readonly<Record<string, unknown>>;
	/** Every schema page's schema, by name, for `$ref`s. */
	readonly schemas: Readonly<Record<string, SchemaNode>>;
	/** A schema page's URL, by schema name. */
	readonly schemaHref: (name: string) => string | undefined;
}

export interface ReferencePageProps<T> {
	readonly data: T;
	readonly context: ReferenceContext;
	/** The page's summary, page actions, and Markdown body, for the renderer to place after its header. */
	readonly children: Snippet;
}

export interface ReferenceExamplesProps<T> {
	readonly data: T;
	readonly context: ReferenceContext;
}

/**
 * Renders one kind of reference page. A page picks its renderer with explicit
 * metadata: `operation.protocol: <id>`, or a `model` block for the `schema`
 * renderer. Pages with neither are guides.
 *
 * ```ts
 * const webhooks = defineRenderer({
 *   id: 'webhook',
 *   read: (properties) => readWebhook(properties.operation),
 *   nav: (hook) => ({ badge: { label: 'HOOK', hue: 'orange' }, label: hook.event, sort: [1, hook.event, 0] }),
 *   page: WebhookPage,
 *   examples: WebhookExamples
 * });
 * ```
 */
export interface ReferenceRenderer<T = unknown> {
	/** The `operation.protocol` value this renderer handles, or `schema`. */
	readonly id: string;
	/** Read the page's metadata. Return `undefined`, or throw with a reason, when it is invalid. */
	readonly read: (properties: Properties) => T | undefined;
	readonly nav: (data: T, entry: IndexEntry) => ReferenceNavItem;
	/** The reference column: the page's header, then `children`, then its reference sections. */
	readonly page: Component<ReferencePageProps<T>>;
	/** The examples column beside the reference on wide screens, below it on narrow ones. */
	readonly examples?: Component<ReferenceExamplesProps<T>>;
}

/** Keeps a renderer's data type flowing from `read` to `nav`, `page`, and `examples`. */
export const defineRenderer = <T>(renderer: ReferenceRenderer<T>): ReferenceRenderer => renderer as ReferenceRenderer;

/** The renderer id that handles `model` pages. */
export const SCHEMA_RENDERER = 'schema';

/** A page and the renderer its metadata selects. Guides have no renderer. */
export interface ReferencePage {
	readonly renderer: ReferenceRenderer;
	readonly data: unknown;
}

export class ReferencePageError extends Error {
	override readonly name = 'ReferencePageError';
}

/**
 * The renderer id a page's metadata names, or `undefined` for a guide. An
 * `operation` without a protocol is REST, as in the API theme's first release.
 */
export function rendererIdOf(properties: Properties): string | undefined {
	const operation = isRecord(properties.operation) ? properties.operation : undefined;
	const model = isRecord(properties.model) ? properties.model : undefined;
	if (operation && model) throw new ReferencePageError('it has both `operation` and `model` metadata. A page documents one thing; keep one.');
	if (model) return SCHEMA_RENDERER;
	if (!operation) return undefined;
	const protocol = operation.protocol ?? 'rest';
	if (typeof protocol !== 'string' || !protocol.trim()) throw new ReferencePageError('its `operation.protocol` must be a string.');
	return protocol.trim();
}

/** A theme's renderers by id, checked so each id has exactly one renderer. */
export type ReferenceRegistry = ReadonlyMap<string, ReferenceRenderer>;

/**
 * Register renderers by id. Listing one renderer twice is fine, so presets can
 * each include the shared schema renderer; two different renderers for one id
 * throw, naming the id, because either choice would silently drop pages.
 */
export function registerRenderers(themeId: string, renderers: readonly ReferenceRenderer[]): ReferenceRegistry {
	const registry = new Map<string, ReferenceRenderer>();
	for (const renderer of renderers) {
		const existing = registry.get(renderer.id);
		if (existing && existing !== renderer) {
			throw new Error(
				`[svartz:reference] Theme "${themeId}" has two renderers for "${renderer.id}". Pass one of them to referenceTheme.`
			);
		}
		registry.set(renderer.id, renderer);
	}
	return registry;
}

/** The renderer and data for a page, or `undefined` for a guide. Throws a `ReferencePageError` naming the page. */
export function referencePage(registry: ReferenceRegistry, entry: Pick<IndexEntry, 'path' | 'slug' | 'properties'>): ReferencePage | undefined {
	const where = entry.path ?? entry.slug;
	const fail = (reason: string, cause?: unknown): never => {
		throw new ReferencePageError(`[svartz:reference] "${where}" can't render: ${reason}`, { cause });
	};
	let id: string | undefined;
	try {
		id = rendererIdOf(entry.properties);
	} catch (error) {
		return fail(error instanceof Error ? error.message : String(error));
	}
	if (id === undefined) return undefined;
	const renderer = registry.get(id);
	if (!renderer) {
		return fail(
			`no renderer handles \`${id === SCHEMA_RENDERER ? 'model' : `operation.protocol: ${id}`}\`. This theme renders ${[...registry.keys()].join(', ') || 'guides only'}.`
		);
	}
	let data: unknown;
	try {
		data = renderer.read(entry.properties);
	} catch (error) {
		return fail(`the ${id} renderer rejected its metadata: ${error instanceof Error ? error.message : String(error)}`, error);
	}
	return data === undefined ? fail(`its metadata isn't a valid ${id} page.`) : { renderer, data };
}

/** Where a reference theme keeps its renderers on the runtime manifest. */
const HOOK = 'reference';

export const referenceHooks = (registry: ReferenceRegistry) => ({ [HOOK]: registry });

/** The renderers a reference theme's runtime manifest carries; empty for other themes. */
export function themeRegistry(theme: Pick<SvartzTheme, 'hooks'> | undefined): ReferenceRegistry {
	const registry = theme?.hooks?.[HOOK];
	return registry instanceof Map ? registry : new Map();
}

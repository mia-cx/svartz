import type { Component, Snippet } from 'svelte';
import DefaultContentElement from './DefaultContentElement.svelte';

/** Props passed to a content override after Markdown plugins finish parsing. */
export interface ContentComponentProps {
	readonly tag: string;
	readonly attributes: Readonly<Record<string, string | boolean>>;
	readonly text: string;
	readonly href?: string;
	readonly src?: string;
	readonly alt?: string;
	readonly language?: string;
	readonly calloutType?: string;
	readonly title?: string;
	readonly fold?: string;
	readonly target?: string;
	readonly children?: Snippet;
}

export type ContentComponentSlot = 'callout' | 'codeBlock' | 'image' | 'link' | 'embed';
export type ContentComponents = Record<ContentComponentSlot, Component<ContentComponentProps>>;
export type ContentComponentOverrides = Partial<ContentComponents>;

/** Host content slots win; theme modules fill gaps; built-ins preserve HTML. */
export function resolveContentComponents(
	host: ContentComponentOverrides,
	theme: Partial<Record<ContentComponentSlot, { default: Component<ContentComponentProps> }>> = {}
): ContentComponents {
	const resolve = (slot: ContentComponentSlot) => host[slot] ?? theme[slot]?.default ?? DefaultContentElement;
	return {
		callout: resolve('callout'),
		codeBlock: resolve('codeBlock'),
		image: resolve('image'),
		link: resolve('link'),
		embed: resolve('embed')
	};
}

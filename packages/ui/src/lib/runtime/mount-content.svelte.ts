import type { ContentView } from '@svartz/core';
import type { RootContent } from 'hast';
import { fromDom } from 'hast-util-from-dom';
import { mount, unmount } from 'svelte';
import ContentTree from './ContentTree.svelte';
import type { ContentComponents } from './content-components.js';

/** A top-level node's markup, which says whether a render changed it. */
const markup = (node: ChildNode) => (node instanceof Element ? node.outerHTML : `${node.nodeName}:${node.textContent}`);

/**
 * Show HTML in `target` as a note body shows it, through `components`. Each `render` replaces what shows. The HTML is
 * parsed in a `<template>`, so its scripts never run and nothing loads before sanitizing.
 *
 * A top-level block whose markup a render didn't change keeps its tree, and so its DOM: an edit to one paragraph of a
 * long page redraws that paragraph.
 */
export function mountContent(target: HTMLElement, components: ContentComponents): ContentView {
	// Raw: a deep proxy would wrap each node anew on every render, so no block would ever be kept.
	let nodes = $state.raw<RootContent[]>([]);
	const tree = mount(ContentTree, {
		target,
		props: {
			get nodes() {
				return nodes;
			},
			components
		}
	});
	let shown = new Map<string, RootContent[]>();
	return {
		render(html) {
			const template = document.createElement('template');
			template.innerHTML = html;
			const next = new Map<string, RootContent[]>();
			nodes = [...template.content.childNodes].map((child) => {
				const key = markup(child);
				const node = shown.get(key)?.shift() ?? (fromDom(child) as RootContent); // A fragment's child is never a root.
				next.set(key, [...(next.get(key) ?? []), node]);
				return node;
			});
			shown = next;
		},
		destroy() {
			void unmount(tree);
		}
	};
}

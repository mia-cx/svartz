/** Browser-only encrypted note loader. The session and imported code stay in memory. */
import {
	ProtectedSession,
	resolveProtectedBridgeImports,
	type ProtectedEnvelope,
	type ProtectedGroupPayload
} from '@svartz/core';
import type { Component } from 'svelte';

export interface ProtectedNoteReference {
	readonly slug: string;
	readonly payloadId: string;
	readonly payloadPath: string;
}

export interface UnlockedNote {
	readonly component: Component;
	readonly payload: ProtectedGroupPayload;
	readonly css: string;
	readonly assets: ReadonlyMap<string, string>;
}

const session = new ProtectedSession();
const modules = new Map<string, Promise<Record<string, unknown>>>();
const assetUrls = new Map<string, Map<string, string>>();

/** Check whether a group was unlocked earlier in this browser page session. */
export function isProtectedGroupUnlocked(id: string): boolean {
	return session.get(id) !== undefined;
}

function createAssetUrls(id: string, payload: ProtectedGroupPayload): ReadonlyMap<string, string> {
	const existing = assetUrls.get(id);
	if (existing) return existing;
	const urls = new Map<string, string>();
	for (const asset of payload.assets) {
		const binary = atob(asset.data);
		const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
		urls.set(asset.path, URL.createObjectURL(new Blob([bytes], { type: asset.mimeType })));
	}
	assetUrls.set(id, urls);
	return urls;
}

async function importGroup(
	id: string,
	payload: ProtectedGroupPayload,
	loadBridgeUrls: (ids: readonly string[]) => Promise<Readonly<Record<string, string>>>
): Promise<Record<string, unknown>> {
	const existing = modules.get(id);
	if (existing) return existing;
	const loading = (async () => {
		const urls = await loadBridgeUrls(payload.bridgeImports);
		const source = resolveProtectedBridgeImports(payload, urls);
		const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
		try {
			return (await import(/* @vite-ignore */ blobUrl)) as Record<string, unknown>;
		} finally {
			URL.revokeObjectURL(blobUrl);
		}
	})();
	modules.set(id, loading);
	try {
		return await loading;
	} catch (error) {
		modules.delete(id);
		throw error;
	}
}

/** Fetch and unlock a sealed group, then return the requested Svelte note. */
export async function unlockProtectedNote(
	reference: ProtectedNoteReference,
	password: string,
	loadBridgeUrls: (ids: readonly string[]) => Promise<Readonly<Record<string, string>>>
): Promise<UnlockedNote> {
	let payload = session.get(reference.payloadId);
	if (!payload) {
		const response = await fetch(reference.payloadPath);
		if (!response.ok) throw new Error(`Protected note payload returned ${response.status}`);
		const envelope = (await response.json()) as ProtectedEnvelope;
		payload = await session.unlock(envelope, password, reference.payloadId);
	}
	const note = payload.notes.find((candidate) => candidate.slug === reference.slug);
	if (!note) throw new Error(`Protected note "${reference.slug}" is missing from its group`);
	try {
		const group = await importGroup(reference.payloadId, payload, loadBridgeUrls);
		const component = group[note.exportName];
		if (typeof component !== 'function')
			throw new Error(`Protected note "${reference.slug}" has no component`);
		return {
			component: component as Component,
			payload,
			css: payload.css,
			assets: createAssetUrls(reference.payloadId, payload)
		};
	} catch (error) {
		lockProtectedGroup(reference.payloadId);
		throw error;
	}
}

/** Forget one group's key, code, and private attachment object URLs. */
export function lockProtectedGroup(id: string): void {
	session.lock(id);
	modules.delete(id);
	for (const url of assetUrls.get(id)?.values() ?? []) URL.revokeObjectURL(url);
	assetUrls.delete(id);
}

/** Point rendered private attachments at their decrypted in-memory blob URLs. */
export function protectedAssets(
	node: HTMLElement,
	assets: ReadonlyMap<string, string>
): { destroy(): void } {
	const attributes = ['src', 'href', 'poster', 'srcset'] as const;
	const resolveAsset = (raw: string): string | undefined => {
		if (/^(?:[a-z]+:|\/\/|#)/i.test(raw)) return;
		let path: string;
		try {
			path = decodeURIComponent(new URL(raw, location.href).pathname);
		} catch {
			return;
		}
		const exact = [...assets]
			.filter(([asset]) => path.endsWith(`/${asset}`))
			.sort(([left], [right]) => right.length - left.length)[0];
		if (exact) return exact[1];
		const basename = path.slice(path.lastIndexOf('/') + 1);
		const byName = [...assets].filter(
			([asset]) => asset.slice(asset.lastIndexOf('/') + 1) === basename
		);
		return byName.length === 1 ? byName[0]?.[1] : undefined;
	};
	const rewrite = (element: Element): void => {
		for (const name of attributes) {
			const raw = element.getAttribute(name);
			if (!raw) continue;
			if (name === 'srcset') {
				const rewritten = raw
					.split(',')
					.map((candidate) => {
						const match = candidate.match(/^(\s*)(\S+)(.*)$/);
						if (!match) return candidate;
						const url = resolveAsset(match[2]!);
						return url ? `${match[1]}${url}${match[3]}` : candidate;
					})
					.join(',');
				if (rewritten !== raw) element.setAttribute(name, rewritten);
				continue;
			}
			const url = resolveAsset(raw);
			if (url) element.setAttribute(name, url);
		}
		for (const child of element.children) rewrite(child);
	};
	const observer = new MutationObserver((changes) => {
		for (const change of changes) {
			if (change.type === 'attributes') rewrite(change.target as Element);
			else for (const added of change.addedNodes) if (added instanceof Element) rewrite(added);
		}
	});
	observer.observe(node, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: [...attributes]
	});
	rewrite(node);
	return { destroy: () => observer.disconnect() };
}

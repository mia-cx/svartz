import { createProtectionSalt, deriveProtectionKey, sealProtectedPayload } from '@svartz/core';
import { afterEach, expect, it, vi } from 'vitest';
import {
	isProtectedGroupUnlocked,
	lockProtectedGroup,
	protectedAssets,
	unlockProtectedNote
} from './protected-client.js';

const id = 'vault:test:group:browserFixture';
const reference = { slug: 'secret', payloadId: id, payloadPath: '/sealed.json' };

afterEach(() => {
	lockProtectedGroup(id);
	vi.unstubAllGlobals();
});

it('imports authenticated note code only after a successful browser unlock', async () => {
	const salt = createProtectionSalt();
	const key = await deriveProtectionKey('correct-password', salt);
	const payload = {
		version: 1,
		notes: [{ slug: 'secret', exportName: 'note0' }],
		entries: [{ slug: 'secret', title: 'Private metadata' }],
		search: [
			{
				id: 'secret',
				slug: 'secret',
				href: '/secret/',
				title: 'Private metadata',
				content: 'unlocked',
				tags: [],
				aliases: []
			}
		],
		graph: { secret: [] },
		js: 'export function note0() { return "unlocked"; }',
		css: '.protected { color: red }',
		assets: [
			{ path: 'photo.png', mimeType: 'image/png', data: 'AAEC' },
			{ path: 'poster.jpg', mimeType: 'image/jpeg', data: 'AAEC' }
		],
		bridgeImports: []
	};
	const envelope = await sealProtectedPayload(
		key,
		salt,
		id,
		new TextEncoder().encode(JSON.stringify(payload))
	);
	const fetchPayload = vi.fn(async () => new Response(JSON.stringify(envelope), { status: 200 }));
	vi.stubGlobal('fetch', fetchPayload);
	const loadBridgeUrls = vi.fn(async () => ({}));

	await expect(unlockProtectedNote(reference, 'wrong-password', loadBridgeUrls)).rejects.toThrow();
	expect(isProtectedGroupUnlocked(id)).toBe(false);
	const unlocked = await unlockProtectedNote(reference, 'correct-password', loadBridgeUrls);
	expect(typeof unlocked.component).toBe('function');
	expect(unlocked.css).toContain('color: red');
	expect(unlocked.assets.get('photo.png')).toMatch(/^blob:/);
	const wrapper = document.createElement('div');
	wrapper.innerHTML =
		'<img src="photo.png" srcset="photo.png 1x, photo.png 2x"><a href="photo.png">Download</a><video poster="poster.jpg"></video>';
	const binding = protectedAssets(wrapper, unlocked.assets);
	expect(wrapper.querySelector('img')?.getAttribute('src')).toBe(unlocked.assets.get('photo.png'));
	expect(wrapper.querySelector('a')?.getAttribute('href')).toBe(unlocked.assets.get('photo.png'));
	expect(wrapper.querySelector('img')?.getAttribute('srcset')).toBe(
		`${unlocked.assets.get('photo.png')} 1x, ${unlocked.assets.get('photo.png')} 2x`
	);
	expect(wrapper.querySelector('video')?.getAttribute('poster')).toBe(
		unlocked.assets.get('poster.jpg')
	);
	binding.destroy();
	expect(isProtectedGroupUnlocked(id)).toBe(true);
	expect((await unlockProtectedNote(reference, '', loadBridgeUrls)).component).toBe(
		unlocked.component
	);
	expect(fetchPayload).toHaveBeenCalledTimes(2);
	expect(loadBridgeUrls).toHaveBeenCalledTimes(1);
	lockProtectedGroup(id);
	expect(isProtectedGroupUnlocked(id)).toBe(false);
});

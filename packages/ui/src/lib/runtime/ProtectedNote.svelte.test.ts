import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { createProtectionSalt, deriveProtectionKey, sealProtectedPayload } from '@svartz/core';
import { afterEach, expect, it, vi } from 'vitest';
import ProtectedNote from './ProtectedNote.svelte';

const id = 'vault:test:group:formFixture';

afterEach(() => vi.unstubAllGlobals());

it('submits the password without navigating and displays a decryption error', async () => {
	const salt = createProtectionSalt();
	const key = await deriveProtectionKey('correct', salt);
	const payload = {
		version: 1,
		notes: [{ slug: 'secret', exportName: 'note0' }],
		entries: [],
		search: [],
		graph: {},
		js: 'export function note0() {}',
		css: '',
		assets: [],
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
	render(ProtectedNote, {
		protection: { slug: 'secret', payloadId: id, payloadPath: '/sealed.json' },
		loadBridgeUrls: async () => ({}),
		onUnlocked: vi.fn(),
		onLocked: vi.fn()
	});
	await page.getByLabelText('Password').fill('wrong');
	await page.getByRole('button', { name: 'Unlock note' }).click();
	expect(fetchPayload).toHaveBeenCalledTimes(1);
	await expect.element(page.getByRole('alert')).toBeVisible();
});

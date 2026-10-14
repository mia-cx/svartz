import { expect, it, vi } from 'vitest';
import { noteStylesheets } from './note-stylesheets.js';

const calls: string[] = [];

vi.mock('virtual:svartz/host', async (importOriginal) => {
	const original = await importOriginal<typeof import('./testing/host.js')>();
	return {
		...original,
		prepareHostVault: async (pathname: string) => {
			calls.push('prepare');
			return original.prepareHostVault(pathname);
		},
		hostStylesheets: (pathname: string) => {
			calls.push('styles');
			return original.hostStylesheets(pathname);
		}
	};
});

it('prepares the vault before reading its stylesheets', async () => {
	calls.length = 0;
	const stylesheets = await noteStylesheets('/work/callouts');
	expect(calls.slice(0, 2)).toEqual(['prepare', 'styles']);
	expect(stylesheets).toEqual([
		'/_app/immutable/assets/shared.css',
		'/_app/immutable/assets/callouts.css'
	]);
});

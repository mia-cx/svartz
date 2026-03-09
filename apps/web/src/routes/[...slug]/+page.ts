import type { EntryGenerator } from './$types';
import { routes } from 'virtual:svartz/artifacts';

export const entries: EntryGenerator = async () =>
	routes.all
		.filter((pathname) => pathname !== '/')
		.map((pathname) => ({
			slug: pathname.replace(/^\/+|\/+$/g, '')
		}));

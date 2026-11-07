import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as handleSvartzServer } from 'virtual:svartz/server';
import { paraglideMiddleware } from '$lib/paraglide/server';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

// Plugin requests under /_svartz/<id>/ answer before page handling; everything else passes through.
export const handle: Handle = sequence(handleSvartzServer, handleParaglide);

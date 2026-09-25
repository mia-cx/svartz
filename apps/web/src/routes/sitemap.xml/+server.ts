import { index, siteConfig } from 'virtual:svartz/artifacts';

export const prerender = true;

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

export function GET(): Response {
	const baseUrl = siteConfig.url?.replace(/\/+$/, '');
	const urls = baseUrl
		? index.entries.map((entry) => {
				const pathname = entry.slug === 'index' ? '/' : `/${entry.slug}/`;
				const location = escapeXml(`${baseUrl}${pathname}`);
				const lastModified = new Date(entry.modifiedAt).toISOString();
				return `  <url><loc>${location}</loc><lastmod>${lastModified}</lastmod></url>`;
			})
		: [];

	return new Response(
		['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>', ''].join('\n'),
		{ headers: { 'content-type': 'application/xml; charset=utf-8' } }
	);
}

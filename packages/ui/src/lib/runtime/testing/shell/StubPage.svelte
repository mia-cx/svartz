<script lang="ts">
	let { entry, route, match, tags = [], folders = [], ..._rest } = $props<{
		entry?: { title?: string };
		route?: { id?: string };
		match?: { params?: Record<string, string | undefined> };
		tags?: Array<{ slug: string }>;
		folders?: Array<{ slug: string }>;
		[key: string]: unknown;
	}>();
</script>

{#if route?.id === 'tag'}
	<h2>Tag: {match?.params?.slug ?? 'unknown'}</h2>
	<p>Available tags: {tags.length}</p>
{:else if route?.id === 'folder'}
	<h2>Folder: {match?.params?.slug ?? 'unknown'}</h2>
	<p>Available folders: {folders.length}</p>
{:else}
	<h2>{entry?.title ?? 'Svartz test page'}</h2>
{/if}

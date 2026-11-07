<!--
	A note's page actions: copy its Markdown to the clipboard or open it, when
	`href` (the note's `markdownHref`) is set, then whatever plugins mount in
	the page-actions region (`[data-svartz-region="page-actions"]`). Themes
	place it in the note header on every note; with no Markdown copy and no
	plugin actions it takes no space.
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import FileText from '@lucide/svelte/icons/file-text';

	let { href }: { href?: string } = $props();

	const RESET_MS = 2000;
	let status = $state<'idle' | 'copied' | 'failed'>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function markdown(source: string): Promise<Blob> {
		const response = await fetch(source);
		if (!response.ok) throw new Error(`${source} answered ${response.status}`);
		return new Blob([await response.text()], { type: 'text/plain' });
	}

	async function copy(source: string) {
		clearTimeout(timer);
		try {
			// A pending ClipboardItem keeps Safari's user-gesture permission while the copy downloads.
			await navigator.clipboard.write([new ClipboardItem({ 'text/plain': markdown(source) })]);
			status = 'copied';
		} catch {
			status = 'failed';
		}
		timer = setTimeout(() => (status = 'idle'), RESET_MS);
	}
</script>

<div class="sv-page-actions" data-sv-preview-omit>
	{#if href}
		<button class="sv-action" type="button" onclick={() => copy(href)}>
			{#if status === 'copied'}<Check aria-hidden="true" />{:else}<Copy aria-hidden="true" />{/if}
			{status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy page'}
		</button>
		<!-- rel="external": a file, not a route, so SvelteKit's router must not take the click. -->
		<a class="sv-action" {href} rel="external" type="text/markdown">
			<FileText aria-hidden="true" />
			View as Markdown
		</a>
		<span class="sv-visually-hidden" role="status">
			{status === 'copied' ? 'Page copied as Markdown' : status === 'failed' ? 'Could not copy the page' : ''}
		</span>
	{/if}
	<!-- Plugins own this element's children; Svelte never renders into it. Its children join the row above. -->
	<span class="region" data-svartz-region="page-actions"></span>
</div>

<style>
	.sv-page-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-2);
		margin-block-start: var(--sv-space-3);
	}

	/* Nothing to show: no Markdown copy and no plugin action. */
	.sv-page-actions:not(:has(.sv-action, :global([data-svartz-region] > *))) {
		display: none;
	}

	.region {
		display: contents;
	}
</style>

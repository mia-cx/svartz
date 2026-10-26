<!--
	A page's Markdown copy for LLMs: copy it to the clipboard, or open it.
	Themes place it in the note header and pass `entry.markdownHref`.
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import FileText from '@lucide/svelte/icons/file-text';

	let { href }: { href: string } = $props();

	const RESET_MS = 2000;
	let status = $state<'idle' | 'copied' | 'failed'>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function markdown(): Promise<Blob> {
		const response = await fetch(href);
		if (!response.ok) throw new Error(`${href} answered ${response.status}`);
		return new Blob([await response.text()], { type: 'text/plain' });
	}

	async function copy() {
		clearTimeout(timer);
		try {
			// A pending ClipboardItem keeps Safari's user-gesture permission while the copy downloads.
			await navigator.clipboard.write([new ClipboardItem({ 'text/plain': markdown() })]);
			status = 'copied';
		} catch {
			status = 'failed';
		}
		timer = setTimeout(() => (status = 'idle'), RESET_MS);
	}
</script>

<div class="sv-page-actions" data-sv-preview-omit>
	<button class="sv-page-action sv-label" type="button" onclick={copy}>
		{#if status === 'copied'}<Check aria-hidden="true" />{:else}<Copy aria-hidden="true" />{/if}
		{status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy page'}
	</button>
	<!-- rel="external": a file, not a route, so SvelteKit's router must not take the click. -->
	<a class="sv-page-action sv-label" {href} rel="external" type="text/markdown">
		<FileText aria-hidden="true" />
		View as Markdown
	</a>
	<span class="sv-visually-hidden" role="status">
		{status === 'copied' ? 'Page copied as Markdown' : status === 'failed' ? 'Could not copy the page' : ''}
	</span>
</div>

<style>
	.sv-page-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-2);
		margin-block-start: var(--sv-space-3);
	}

	.sv-page-action {
		display: inline-flex;
		align-items: center;
		gap: var(--sv-space-1);
		padding: var(--sv-space-1) var(--sv-space-2);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: transparent;
		text-decoration: none;
		cursor: pointer;
		transition:
			border-color var(--sv-duration-fast) var(--sv-ease),
			color var(--sv-duration-fast) var(--sv-ease);
	}

	.sv-page-action:hover {
		border-color: var(--sv-accent);
		color: var(--sv-accent-text);
	}

	.sv-page-action :global(svg) {
		inline-size: 1.1em;
		block-size: 1.1em;
		stroke-width: 1.75;
	}
</style>

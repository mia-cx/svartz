<!-- Minimal's header: the site name, the phone menu button, search, colour mode, and reader mode. -->
<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import { ColorModeToggle, SearchDialog } from '@svartz/ui';
	import type { RegionProps } from '../extension.js';

	let { shell }: RegionProps = $props();
</script>

<div class="masthead">
	<button
		class="sv-icon-button menu"
		type="button"
		aria-expanded={shell.drawer}
		aria-controls="explorer-panel"
		aria-label={shell.drawer ? 'Close the explorer' : 'Open the explorer'}
		onclick={shell.toggleDrawer}
	>
		{#if shell.drawer}<X aria-hidden="true" />{:else}<Menu aria-hidden="true" />{/if}
	</button>
	<a class="sv-wordmark" href={shell.homeHref}>{shell.site.title}</a>
</div>
<div class="tools">
	<SearchDialog documents={shell.vault.search} searchIndex={shell.searchIndex} searchOptions={shell.searchOptions} />
	<ColorModeToggle />
	{#if shell.chrome.readerMode}
		<button class="sv-icon-button reader-toggle" type="button" aria-pressed={shell.reader} aria-label="Reader mode" onclick={shell.toggleReader}>
			<BookOpen aria-hidden="true" />
		</button>
	{/if}
</div>

<style>
	.masthead {
		display: flex;
		align-items: center;
		gap: var(--sv-space-2);
	}

	.masthead .sv-wordmark {
		font-size: var(--sv-step-2);
		text-wrap: balance;
	}

	.menu {
		display: none;
	}

	.tools {
		display: flex;
		align-items: center;
		gap: var(--sv-space-1);
	}

	.tools :global(.sv-search-trigger[data-variant='field']) {
		flex: 1;
		min-inline-size: 0;
	}

	.reader-toggle[aria-pressed='true'] {
		background: var(--sv-surface);
		color: var(--sv-ink);
	}

	@media (max-width: 50rem) {
		.menu {
			display: inline-grid;
		}

		.masthead {
			flex: 1;
			min-inline-size: 0;
		}

		.masthead .sv-wordmark {
			overflow: hidden;
			font-size: var(--sv-step-1);
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.tools :global(.sv-search-trigger[data-variant='field']) {
			flex: none;
			inline-size: 2.25rem;
			padding: 0;
			justify-content: center;
			border-color: transparent;
		}

		.tools :global(.sv-search-trigger-label),
		.tools :global(.sv-search-trigger-keys),
		.reader-toggle {
			display: none;
		}
	}
</style>

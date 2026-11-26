<!-- Above a deprecated version's pages: which version this is, and the way to the latest version of the page. -->
<script lang="ts">
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { VersionLink } from './versions.js';

	let { versions }: { versions: readonly VersionLink[] } = $props();

	const current = $derived(versions.find((version) => version.current));
	const latest = $derived(versions.find((version) => version.status === 'latest'));
</script>

{#if current?.status === 'deprecated' && latest}
	<p class="notice" data-sv-signal style:--sv-hue="var(--sv-hue-amber)">
		<TriangleAlert aria-hidden="true" />
		<span>
			Version {current.id} is deprecated.
			<a href={latest.href}>
				{#if latest.samePage}Read this page in {latest.id}, the latest version{:else}Go to {latest.id}, the latest version{/if}
			</a>
		</span>
	</p>
{/if}

<style>
	.notice {
		display: flex;
		align-items: flex-start;
		gap: var(--sv-space-2);
		margin: 0 0 var(--sv-space-5);
		padding: var(--sv-space-3) var(--sv-space-4);
		border-inline-start: 3px solid var(--sv-signal);
		border-radius: var(--sv-radius-m);
		background: var(--sv-signal-soft);
		color: var(--sv-text);
		font-size: var(--sv-step--1);
	}

	.notice :global(svg) {
		flex: none;
		inline-size: 1.1rem;
		block-size: 1.1rem;
		margin-block-start: 0.15em;
		color: var(--sv-signal);
	}

	.notice a {
		font-weight: 600;
	}
</style>

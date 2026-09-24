<script lang="ts">
	import '$lib/styles/base.css';
	import Moon from '@lucide/svelte/icons/moon';
	import Search from '@lucide/svelte/icons/search';
	import Sun from '@lucide/svelte/icons/sun';

	const neutrals = ['paper', 'surface', 'sunken', 'rule', 'rule-strong', 'muted', 'text', 'ink'];
	const accents = ['accent', 'accent-text', 'accent-soft', 'mark'];
	const hues = ['blue', 'cyan', 'teal', 'green', 'amber', 'orange', 'red', 'violet'];
	const steps = [5, 4, 3, 2, 1, 0, -1, -2];
	const methods = [
		['GET', 'green'],
		['POST', 'blue'],
		['PUT', 'amber'],
		['PATCH', 'violet'],
		['DELETE', 'red']
	];
	const kinds = [
		['class', 'amber'],
		['interface', 'teal'],
		['function', 'violet'],
		['type', 'blue'],
		['enum', 'green']
	];
</script>

<svelte:head><title>Svartz design language</title></svelte:head>

<div class="specimen">
	{#each ['light', 'dark'] as mode (mode)}
		<section class="panel" style:color-scheme={mode} aria-label="{mode} mode">
			<header class="panel-head">
				<span class="sv-wordmark"><span class="sv-mark" aria-hidden="true"></span>Svartz</span>
				<span class="sv-label">{mode}</span>
			</header>

			<h2 class="sv-label">Neutrals</h2>
			<div class="swatches">
				{#each neutrals as token (token)}
					<div class="swatch">
						<span class="chip" style:background="var(--sv-{token})"></span>
						<code>--sv-{token}</code>
					</div>
				{/each}
			</div>

			<h2 class="sv-label">Accent</h2>
			<div class="swatches">
				{#each accents as token (token)}
					<div class="swatch">
						<span class="chip" style:background="var(--sv-{token})"></span>
						<code>--sv-{token}</code>
					</div>
				{/each}
			</div>

			<h2 class="sv-label">Signal hues</h2>
			<div class="row">
				{#each hues as hue (hue)}
					<span class="sv-badge" data-sv-signal style:--sv-hue="var(--sv-hue-{hue})">{hue}</span>
				{/each}
			</div>

			<h2 class="sv-label">Type scale</h2>
			<div class="scale">
				{#each steps as step (step)}
					<p style:font-size="var(--sv-step-{step})">
						<span class="sv-label">{step}</span>
						<span class={step >= 1 ? 'display' : ''}>Published from a vault</span>
					</p>
				{/each}
			</div>

			<h2 class="sv-label">Faces</h2>
			<p class="face" style:font-family="var(--sv-font-title)" style:font-size="var(--sv-step-3)">Google Sans Code sets the titles</p>
			<p class="face" style:font-family="var(--sv-font-h2)" style:font-size="var(--sv-step-2)">Monaspace Argon sets second-level headings</p>
			<p class="face" style:font-family="var(--sv-font-minor)">Fira Code sets the minor headings</p>
			<p class="face" style:font-family="var(--sv-font-text)">Monaspace Xenon carries the note body, at leading 1.65.</p>
			<p class="face">Archivo runs the interface: navigation, search, lists.</p>
			<p class="face" style:font-family="var(--sv-font-mono)">const vault = await publish();</p>

			<h2 class="sv-label">Primitives</h2>
			<div class="row">
				<a class="sv-tag" href="#specimen">obsidian</a>
				<a class="sv-tag" href="#specimen">publishing</a>
				<span class="sv-kbd">⌘</span><span class="sv-kbd">K</span>
				<button class="sv-icon-button" type="button" aria-label="Search"><Search /></button>
				<button class="sv-icon-button" type="button" aria-label="Light mode"><Sun /></button>
				<button class="sv-icon-button" type="button" aria-label="Dark mode"><Moon /></button>
			</div>
			<div class="row">
				{#each methods as [method, hue] (method)}
					<span class="sv-badge" data-sv-signal style:--sv-hue="var(--sv-hue-{hue})">{method}</span>
				{/each}
			</div>
			<div class="row">
				{#each kinds as [kind, hue] (kind)}
					<span class="sv-badge" data-sv-signal style:--sv-hue="var(--sv-hue-{hue})">{kind}</span>
				{/each}
			</div>
			<p class="sv-label">Updated Sep 24, 2026 · 6 min read</p>
		</section>
	{/each}
</div>

<style>
	.specimen {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
		min-height: 100%;
	}

	.panel {
		display: grid;
		align-content: start;
		gap: var(--sv-space-3);
		padding: var(--sv-space-6);
		background: var(--sv-paper);
		color: var(--sv-text);
		font-family: var(--sv-font-text);
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: var(--sv-space-4);
		border-bottom: var(--sv-rule-width) solid var(--sv-rule);
	}

	h2 {
		margin: var(--sv-space-4) 0 0;
	}

	.swatches {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: var(--sv-space-2);
	}

	.swatch {
		display: flex;
		align-items: center;
		gap: var(--sv-space-2);
	}

	.chip {
		inline-size: 1.75rem;
		block-size: 1.75rem;
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-s);
	}

	code {
		font-family: var(--sv-font-mono);
		font-size: 0.75rem;
		color: var(--sv-muted);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sv-space-2);
	}

	.scale p {
		display: flex;
		align-items: baseline;
		gap: var(--sv-space-3);
		margin: 0;
		line-height: var(--sv-leading-tight);
		color: var(--sv-ink);
	}

	.scale .sv-label {
		inline-size: 1.5rem;
	}

	.display {
		font-family: var(--sv-font-title);
		font-weight: 600;
		letter-spacing: -0.03em;
	}

	.face {
		margin: 0;
		color: var(--sv-ink);
	}
</style>

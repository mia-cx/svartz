<!-- A schema page: "The Pet object", its prose, then every field. -->
<script lang="ts">
	import ReferenceSection from './ReferenceSection.svelte';
	import SchemaTree from './SchemaTree.svelte';
	import type { ReferencePageProps } from './renderers.js';
	import type { SchemaNode } from './schema.js';

	let { data, context, children }: ReferencePageProps<{ name: string; schema: SchemaNode }> = $props();
</script>

<header class="head">
	<p class="sv-label">Schema</p>
	<h1>The <code>{data.name}</code> object</h1>
	{@render children()}
</header>

<ReferenceSection id="attributes" title="Attributes">
	<SchemaTree schema={data.schema} schemaHref={context.schemaHref} entries={context.vault.entries} />
</ReferenceSection>

<style>
	.head .sv-label {
		margin: 0 0 var(--sv-space-1);
	}

	h1 {
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-4);
		font-weight: 700;
		line-height: 1.1;
	}

	h1 code {
		font-family: var(--sv-font-mono);
		overflow-wrap: anywhere;
	}
</style>

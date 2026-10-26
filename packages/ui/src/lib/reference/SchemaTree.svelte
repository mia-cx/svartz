<!--
	A schema as a field list: each field's name, type, whether it's required,
	its limits, default, allowed values, and description. Nested objects fold
	open; `$ref`s link to their schema page instead of expanding, so cycles stay
	finite. Parameters and arguments render through the same tree.
-->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import DescText from '../DescText.svelte';
	import SchemaTree from './SchemaTree.svelte';
	import { schemaLabel, type SchemaNode, type SchemaProperty } from './schema.js';

	let {
		schema,
		schemaHref,
		entries,
		depth = 0
	}: {
		schema: SchemaNode;
		schemaHref: (name: string) => string | undefined;
		/** Resolves `[[wikilinks]]` in descriptions. */
		entries: readonly IndexEntry[];
		depth?: number;
	} = $props();

	const OPEN_DEPTH = 1;
	const fieldsOf = (node: SchemaNode): readonly SchemaProperty[] | undefined =>
		node.properties ?? (node.type === 'array' ? node.items?.properties : undefined) ?? node.values?.properties;
	// Allowed values list on their own line, so the type stays short.
	const typeOf = (node: SchemaNode) => (node.enum?.length ? (node.type ?? 'enum') + (node.nullable ? ' | null' : '') : schemaLabel(node));
	const literal = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));
</script>

{#snippet typeLabel(node: SchemaNode)}
	{@const target = node.ref ?? (node.type === 'array' ? node.items?.ref : undefined)}
	{@const href = target ? schemaHref(target) : undefined}
	{#if href}<a class="type" {href} data-sv-internal>{typeOf(node)}</a>{:else}<span class="type">{typeOf(node)}</span>{/if}
{/snippet}

{#snippet details(node: SchemaNode)}
	{#if node.description}<p class="description"><DescText value={node.description} {entries} /></p>{/if}
	{#if node.enum?.length || node.default !== undefined || node.constraints?.length}
		<dl class="facts">
			{#if node.enum?.length}
				<div><dt>One of</dt><dd>{#each node.enum as value, index (index)}<code>{literal(value)}</code>{/each}</dd></div>
			{/if}
			{#if node.default !== undefined}<div><dt>Default</dt><dd><code>{literal(node.default)}</code></dd></div>{/if}
			{#if node.constraints?.length}<div><dt>Limits</dt><dd>{node.constraints.join(', ')}</dd></div>{/if}
		</dl>
	{/if}
{/snippet}

{#snippet field(property: SchemaProperty)}
	<code class="name">{property.name}</code>
	{@render typeLabel(property.schema)}
	<span class={property.required ? 'required' : 'optional'}>{property.required ? 'Required' : 'Optional'}</span>
{/snippet}

{#if fieldsOf(schema)}
	<ul class="tree" class:nested={depth > 0}>
		{#each fieldsOf(schema) ?? [] as property (property.name)}
			{@const nested = fieldsOf(property.schema)}
			<li>
				{#if nested && !property.schema.ref}
					<details open={depth < OPEN_DEPTH}>
						<summary>{@render field(property)}</summary>
						{@render details(property.schema)}
						<SchemaTree schema={property.schema} {schemaHref} {entries} depth={depth + 1} />
					</details>
				{:else}
					<div class="row">{@render field(property)}</div>
					{@render details(property.schema)}
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<div class="single">
		<p>{@render typeLabel(schema)}</p>
		{@render details(schema)}
	</div>
{/if}

<style>
	.tree {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--sv-step--1);
	}

	.tree.nested {
		margin: var(--sv-space-2) 0 0 var(--sv-space-2);
		padding-inline-start: var(--sv-space-4);
		border-inline-start: var(--sv-rule-width) solid var(--sv-rule);
	}

	li {
		padding-block: var(--sv-space-2);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.nested li:last-child {
		border-block-end: 0;
	}

	.row,
	summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--sv-space-1) var(--sv-space-2);
	}

	summary {
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary::before {
		content: '▸';
		color: var(--sv-muted);
		transition: rotate var(--sv-duration) var(--sv-ease);
	}

	details[open] > summary::before {
		rotate: 90deg;
	}

	.name {
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.type {
		color: var(--sv-muted);
		font-family: var(--sv-font-mono);
		font-size: 0.92em;
		overflow-wrap: anywhere;
	}

	a.type {
		color: var(--sv-accent-text);
		text-decoration: underline;
		text-decoration-color: var(--sv-accent-soft);
		text-underline-offset: 0.2em;
	}

	.required,
	.optional {
		font-size: var(--sv-label-size);
		font-weight: 700;
		text-transform: uppercase;
	}

	.required {
		color: var(--sv-accent-text);
	}

	.optional {
		color: var(--sv-muted);
		font-weight: 600;
	}

	.description {
		margin: var(--sv-space-1) 0 0;
		color: var(--sv-text);
	}

	.facts {
		display: grid;
		gap: var(--sv-space-1);
		margin: var(--sv-space-1) 0 0;
		color: var(--sv-text);
	}

	.facts div {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--sv-space-1) var(--sv-space-2);
	}

	dt {
		color: var(--sv-muted);
		font-size: var(--sv-label-size);
		font-weight: 600;
		text-transform: uppercase;
	}

	dd {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-1);
		margin: 0;
	}

	dd code {
		padding: 0 0.35em;
		border-radius: var(--sv-radius-s);
		background: var(--sv-surface);
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-size: 0.92em;
		overflow-wrap: anywhere;
	}

	.single p {
		margin: 0;
	}
</style>

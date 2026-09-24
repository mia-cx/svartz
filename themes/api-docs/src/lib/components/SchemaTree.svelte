<!--
	A schema as a property tree. Nested objects and arrays of objects fold open;
	`$ref`s link to their model page instead of expanding, so cycles stay finite.
-->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import { DescText } from '@svartz/ui';
	import SchemaTree from './SchemaTree.svelte';
	import { schemaLabel, type SchemaNode } from '../api.js';

	let {
		schema,
		modelHref,
		entries,
		depth = 0
	}: {
		schema: SchemaNode;
		modelHref: (name: string) => string | undefined;
		/** Resolves `[[wikilinks]]` in descriptions. */
		entries: readonly IndexEntry[];
		depth?: number;
	} = $props();

	const OPEN_DEPTH = 1;
	const children = (node: SchemaNode) => node.properties ?? (node.type === 'array' ? node.items?.properties : undefined);
</script>

{#snippet typeLabel(node: SchemaNode)}
	{@const target = node.ref ?? (node.type === 'array' ? node.items?.ref : undefined)}
	{@const href = target ? modelHref(target) : undefined}
	{#if href}<a class="type" href={href} data-sv-internal>{schemaLabel(node)}</a>{:else}<span class="type">{schemaLabel(node)}</span>{/if}
{/snippet}

{#if schema.properties || (schema.type === 'array' && schema.items?.properties)}
	<ul class="tree" class:nested={depth > 0}>
		{#each children(schema) ?? [] as property (property.name)}
			{@const nested = children(property.schema)}
			<li>
				{#if nested}
					<details open={depth < OPEN_DEPTH}>
						<summary>
							<code class="name">{property.name}</code>
							{@render typeLabel(property.schema)}
							{#if property.required}<span class="required">required</span>{/if}
						</summary>
						{#if property.schema.description}<p class="description"><DescText value={property.schema.description} {entries} /></p>{/if}
						<SchemaTree schema={property.schema} {modelHref} {entries} depth={depth + 1} />
					</details>
				{:else}
					<div class="row">
						<code class="name">{property.name}</code>
						{@render typeLabel(property.schema)}
						{#if property.required}<span class="required">required</span>{/if}
					</div>
					{#if property.schema.description}<p class="description"><DescText value={property.schema.description} {entries} /></p>{/if}
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="single">{@render typeLabel(schema)}{#if schema.description}{' '}— <DescText value={schema.description} {entries} />{/if}</p>
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
		gap: var(--sv-space-2);
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
	}

	.type {
		color: var(--sv-muted);
		font-family: var(--sv-font-mono);
		font-size: 0.92em;
	}

	a.type {
		color: var(--sv-accent-text);
		text-decoration: underline;
		text-decoration-color: var(--sv-accent-soft);
		text-underline-offset: 0.2em;
	}

	.required {
		color: var(--sv-accent-text);
		font-size: var(--sv-label-size);
		font-stretch: var(--sv-label-stretch);
		font-weight: 700;
		letter-spacing: var(--sv-label-tracking);
		text-transform: uppercase;
	}

	.description {
		margin: var(--sv-space-1) 0 0;
		color: var(--sv-text);
	}

	.single {
		margin: 0;
	}
</style>

<!--
	A schema as a field list: each field's name, type, whether it's required,
	its limits, default, allowed values, and description. Nested objects fold
	open; `$ref`s link to their schema page instead of expanding, so cycles stay
	finite. A `oneOf`/`anyOf` lists each alternative under its title or
	discriminator value, with its own fields. Parameters and arguments render
	through the same tree.
-->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import DescText from '../DescText.svelte';
	import SchemaTree from './SchemaTree.svelte';
	import { alternativesOf, discriminatorOf, schemaLabel, type SchemaNode, type SchemaProperty } from './schema.js';

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
	// An array lists its items' fields, so `Pet[]` and `Pet[][]` open like `Pet`.
	const bodyOf = (node: SchemaNode): SchemaNode =>
		node.type === 'array' && node.items && !node.items.ref ? bodyOf(node.items) : node;
	// A map lists one `[key: string]` field for its values, so their fields stay a level down.
	const fieldsOf = (node: SchemaNode): readonly SchemaProperty[] | undefined =>
		node.properties ?? (node.values ? [{ name: '[key: string]', required: false, schema: node.values }] : undefined);
	// Scalar unions read in one line (`string | number`); alternatives with fields or links list below.
	const branchesOf = (node: SchemaNode) => {
		const alternatives = alternativesOf(node);
		return alternatives?.some((alternative) => alternative.ref || opens(alternative)) ? alternatives : undefined;
	};
	const opens = (node: SchemaNode): boolean => Boolean(fieldsOf(bodyOf(node)) || branchesOf(bodyOf(node)));
	// Allowed values list on their own line, so the type stays short.
	const typeOf = (node: SchemaNode) => (node.enum?.length ? (node.type ?? 'enum') + (node.nullable ? ' | null' : '') : schemaLabel(node));
	const literal = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

	const body = $derived(bodyOf(schema));
	const fields = $derived(fieldsOf(body));
	const branches = $derived(branchesOf(body));
	const discriminator = $derived(discriminatorOf(body));
	/** An alternative's name: its `title`, else its discriminator value, else its position. A `$ref` names itself. */
	const branchName = (node: SchemaNode, index: number) => {
		if (node.title) return node.title;
		const pinned = discriminator && node.properties?.find((property) => property.name === discriminator)?.schema.enum?.[0];
		if (pinned !== undefined) return `${discriminator}: ${literal(pinned)}`;
		return node.ref ? undefined : `Option ${index + 1}`;
	};
</script>

{#snippet typeLabel(node: SchemaNode)}
	{@const target = node.ref ?? (node.type === 'array' ? node.items?.ref : undefined)}
	{@const href = target ? schemaHref(target) : undefined}
	{#if href}<a class="type" {href} data-sv-internal>{typeOf(node)}</a>{:else}<span class="type">{typeOf(node)}</span>{/if}
{/snippet}

{#snippet details(node: SchemaNode)}
	{#if node.description}<p class="description"><DescText value={node.description} {entries} /></p>{/if}
	{#if node.enum?.length || node.default !== undefined || node.constraints?.length || node.pattern}
		<dl class="facts">
			{#if node.enum?.length}
				<div><dt>One of</dt><dd>{#each node.enum as value, index (index)}<code>{literal(value)}</code>{/each}</dd></div>
			{/if}
			{#if node.default !== undefined}<div><dt>Default</dt><dd><code>{literal(node.default)}</code></dd></div>{/if}
			{#if node.constraints?.length}<div><dt>Limits</dt><dd>{node.constraints.join(', ')}</dd></div>{/if}
			{#if node.pattern}<div><dt>Pattern</dt><dd><code>{node.pattern}</code></dd></div>{/if}
		</dl>
	{/if}
{/snippet}

{#snippet field(property: SchemaProperty)}
	<code class="name">{property.name}</code>
	{@render typeLabel(property.schema)}
	<span class={property.required ? 'required' : 'optional'}>{property.required ? 'Required' : 'Optional'}</span>
{/snippet}

{#snippet branch(node: SchemaNode, index: number)}
	{@const name = branchName(node, index)}
	{#if name}<span class="branch">{name}</span>{/if}
	{@render typeLabel(node)}
{/snippet}

{#if fields || branches}
	{#if fields}
		<ul class="tree" class:nested={depth > 0}>
			{#each fields as property (property.name)}
				<li>
					{#if opens(property.schema) && !property.schema.ref}
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
	{/if}
	{#if branches}
		<div class="union" class:nested={depth > 0}>
			<!-- A root schema or array items have no field row above to carry these. -->
			{#if depth === 0 || body !== schema}{@render details(body)}{/if}
			<p class="union-label">{body.oneOf ? 'One of the following' : 'Any of the following'}{body.nullable ? ', or null' : ''}</p>
			<ul class="tree">
				{#each branches as node, index (index)}
					<li>
						{#if opens(node) && !node.ref}
							<details open={depth < OPEN_DEPTH}>
								<summary>{@render branch(node, index)}</summary>
								{@render details(node)}
								<SchemaTree schema={node} {schemaHref} {entries} depth={depth + 1} />
							</details>
						{:else}
							<div class="row">{@render branch(node, index)}</div>
							{@render details(node)}
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
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

	.tree.nested,
	.union.nested {
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

	.union {
		font-size: var(--sv-step--1);
	}

	.tree.nested + .union.nested {
		margin-block-start: var(--sv-space-3);
	}

	.union-label {
		margin: var(--sv-space-2) 0 0;
		color: var(--sv-muted);
		font-size: var(--sv-label-size);
		font-weight: 600;
		text-transform: uppercase;
	}

	.union .tree {
		font-size: inherit;
	}

	.branch {
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-weight: 600;
		overflow-wrap: anywhere;
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

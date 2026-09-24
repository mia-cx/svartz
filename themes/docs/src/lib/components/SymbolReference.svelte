<!--
	The generated part of a symbol page: signatures (tabs for overloads), type
	parameters, parameters, returns, throws, hierarchy, and members. The note's
	own Markdown (remarks, examples) renders between `lead` and `members`.
-->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import type { Snippet } from 'svelte';
	import { DescText } from '@svartz/ui';
	import KindBadge from './KindBadge.svelte';
	import TypeText from './TypeText.svelte';
	import { KIND_HEADINGS, type DocSymbol, type SymbolMember, type SymbolParameter } from '../symbols.js';

	let {
		symbol,
		entries,
		children
	}: { symbol: DocSymbol; entries: readonly IndexEntry[]; children?: Snippet } = $props();

	let overload = $state(0);

	const memberGroups = $derived(
		Object.entries(
			symbol.members.reduce<Record<string, SymbolMember[]>>((groups, member) => {
				(groups[member.kind] ??= []).push(member);
				return groups;
			}, {})
		) as [SymbolMember['kind'], SymbolMember[]][]
	);
	const sourceIsUrl = $derived(symbol.source ? /^https?:\/\//.test(symbol.source) : false);
</script>

{#snippet parameterTable(rows: readonly SymbolParameter[])}
	<table class="params">
		<thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead>
		<tbody>
			{#each rows as row (row.name)}
				<tr>
					<td><code class="name">{row.name}{row.optional ? '?' : ''}</code></td>
					<td>
						{#if row.type}<TypeText value={row.type} {entries} />{/if}
						{#if row.default}<span class="default">= <code>{row.default}</code></span>{/if}
					</td>
					<td>{#if row.description}<DescText value={row.description} {entries} />{/if}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

{#if symbol.signatures.length > 0}
	<div class="signatures">
		{#if symbol.signatures.length > 1}
			<div class="overloads" role="tablist" aria-label="Overloads">
				{#each symbol.signatures as _, index (index)}
					<button
						type="button"
						role="tab"
						id="overload-tab-{index}"
						aria-selected={overload === index}
						aria-controls="overload-panel"
						onclick={() => (overload = index)}
					>
						Overload {index + 1}
					</button>
				{/each}
			</div>
		{/if}
		<pre class="signature" id="overload-panel" role={symbol.signatures.length > 1 ? 'tabpanel' : undefined} aria-labelledby={symbol.signatures.length > 1 ? `overload-tab-${overload}` : undefined}><code>{symbol.signatures[overload]}</code></pre>
	</div>
{/if}

{#if symbol.deprecated}
	<div class="deprecated" data-sv-signal style:--sv-hue="var(--sv-hue-red)">
		<span class="sv-label">Deprecated</span>
		<span><DescText value={symbol.deprecated} {entries} /></span>
	</div>
{/if}

{#if symbol.typeParameters.length > 0}
	<section aria-labelledby="type-parameters">
		<h2 id="type-parameters">Type parameters</h2>
		{@render parameterTable(symbol.typeParameters)}
	</section>
{/if}

{#if symbol.parameters.length > 0}
	<section aria-labelledby="parameters">
		<h2 id="parameters">Parameters</h2>
		{@render parameterTable(symbol.parameters)}
	</section>
{/if}

{#if symbol.returns}
	<section aria-labelledby="returns">
		<h2 id="returns">Returns</h2>
		<p><TypeText value={symbol.returns.type} {entries} />{#if symbol.returns.description}{' '}— <DescText value={symbol.returns.description} {entries} />{/if}</p>
	</section>
{/if}

{#if symbol.throws.length > 0}
	<section aria-labelledby="throws">
		<h2 id="throws">Throws</h2>
		<ul>
			{#each symbol.throws as thrown (thrown.type)}
				<li><TypeText value={thrown.type} {entries} />{#if thrown.description}{' '}— <DescText value={thrown.description} {entries} />{/if}</li>
			{/each}
		</ul>
	</section>
{/if}

{@render children?.()}

{#if symbol.extends.length > 0 || symbol.implements.length > 0}
	<section aria-labelledby="hierarchy">
		<h2 id="hierarchy">Hierarchy</h2>
		<dl class="hierarchy">
			{#if symbol.extends.length > 0}
				<dt class="sv-label">Extends</dt>
				<dd>{#each symbol.extends as type, index (type)}{#if index > 0}, {/if}<TypeText value={type} {entries} />{/each}</dd>
			{/if}
			{#if symbol.implements.length > 0}
				<dt class="sv-label">Implements</dt>
				<dd>{#each symbol.implements as type, index (type)}{#if index > 0}, {/if}<TypeText value={type} {entries} />{/each}</dd>
			{/if}
		</dl>
	</section>
{/if}

{#each memberGroups as [kind, members] (kind)}
	<section aria-labelledby="members-{kind}">
		<h2 id="members-{kind}">{KIND_HEADINGS[kind]}</h2>
		{#each members as member (member.name)}
			<article class="member" id="member-{member.name}">
				<h3>
					<a href="#member-{member.name}">{member.name}</a>
					<KindBadge kind={member.kind} />
					{#if member.static}<span class="sv-badge" data-sv-signal style:--sv-hue="var(--sv-hue-blue)">static</span>{/if}
					{#if member.deprecated}<span class="sv-badge" data-sv-signal style:--sv-hue="var(--sv-hue-red)">deprecated</span>{/if}
				</h3>
				{#if member.signature}<pre class="signature small"><code>{member.signature}</code></pre>{/if}
				{#if member.description}<p><DescText value={member.description} {entries} /></p>{/if}
				{#if member.deprecated}<p class="member-deprecated"><DescText value={member.deprecated} {entries} /></p>{/if}
			</article>
		{/each}
	</section>
{/each}

{#if symbol.source}
	<p class="source sv-label">
		Defined in
		{#if sourceIsUrl}<a href={symbol.source}>{symbol.source.split('/').slice(-2).join('/')}</a>{:else}<code>{symbol.source}</code>{/if}
	</p>
{/if}

<style>
	section {
		margin-block-start: var(--sv-space-6);
	}

	h2 {
		margin: 0 0 var(--sv-space-3);
		padding-block-end: var(--sv-space-1);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		color: var(--sv-ink);
		font-size: var(--sv-step-2);
		font-weight: 700;
	}

	.signatures {
		margin-block-end: var(--sv-space-5);
	}

	.overloads {
		display: flex;
		gap: var(--sv-space-1);
		margin-block-end: calc(-1 * var(--sv-rule-width));
	}

	.overloads button {
		padding: var(--sv-space-1) var(--sv-space-3);
		border: var(--sv-rule-width) solid transparent;
		border-block-end: 0;
		border-radius: var(--sv-radius-m) var(--sv-radius-m) 0 0;
		background: none;
		color: var(--sv-muted);
		font: inherit;
		font-size: var(--sv-step--1);
		cursor: pointer;
	}

	.overloads button[aria-selected='true'] {
		border-color: var(--sv-rule);
		background: var(--sv-sunken);
		color: var(--sv-ink);
		font-weight: 600;
	}

	.signature {
		margin: 0;
		padding: var(--sv-space-4);
		overflow-x: auto;
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: var(--sv-sunken);
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-size: 0.9rem;
		line-height: 1.6;
	}

	.signature.small {
		padding: var(--sv-space-2) var(--sv-space-3);
		font-size: 0.82rem;
	}

	.deprecated {
		display: flex;
		gap: var(--sv-space-3);
		align-items: baseline;
		margin-block-end: var(--sv-space-5);
		padding: var(--sv-space-3) var(--sv-space-4);
		border-radius: var(--sv-radius-m);
		background: var(--sv-signal-soft);
	}

	.deprecated .sv-label {
		color: var(--sv-signal);
	}

	.params {
		inline-size: 100%;
		border-collapse: collapse;
		font-size: var(--sv-step--1);
	}

	.params th {
		padding: var(--sv-space-2) var(--sv-space-3) var(--sv-space-2) 0;
		border-block-end: var(--sv-rule-width) solid var(--sv-rule-strong);
		color: var(--sv-muted);
		font-size: var(--sv-label-size);
		font-stretch: var(--sv-label-stretch);
		font-weight: 600;
		letter-spacing: var(--sv-label-tracking);
		text-align: start;
		text-transform: uppercase;
	}

	.params td {
		padding: var(--sv-space-2) var(--sv-space-3) var(--sv-space-2) 0;
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		vertical-align: top;
	}

	.name {
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-weight: 600;
	}

	.default {
		display: block;
		color: var(--sv-muted);
	}

	.hierarchy {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--sv-space-2) var(--sv-space-4);
		margin: 0;
	}

	.hierarchy dd {
		margin: 0;
	}

	.member {
		padding-block: var(--sv-space-4);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		scroll-margin-block-start: var(--sv-space-8);
	}

	.member h3 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sv-space-2);
		margin: 0 0 var(--sv-space-2);
		font-size: var(--sv-step-1);
	}

	.member h3 a {
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		text-decoration: none;
	}

	.member p {
		margin: var(--sv-space-2) 0 0;
	}

	.member-deprecated {
		color: var(--sv-muted);
	}

	.source {
		margin-block-start: var(--sv-space-6);
	}

	.source a,
	.source code {
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		letter-spacing: 0;
		text-transform: none;
	}
</style>

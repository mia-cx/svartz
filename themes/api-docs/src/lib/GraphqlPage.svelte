<!-- A GraphQL operation's reference column: kind and field name, auth, the note's Markdown, arguments, and the return type. -->
<script lang="ts">
	import { AuthSummary, EndpointBar, ReferenceSection, SchemaTree, type ReferencePageProps } from '@svartz/ui/reference/runtime';
	import { argumentSchema, fieldsSchema, graphqlBadge, namedType, type GraphqlOperation } from './api.js';

	let { data: operation, context, children }: ReferencePageProps<GraphqlOperation> = $props();

	const entries = $derived(context.vault.entries);
	const returns = $derived(operation.returns?.replace(/\[\[|\]\]/g, ''));
	const returnsHref = $derived(operation.returns ? context.schemaHref(namedType(operation.returns)) : undefined);
	const args = $derived(fieldsSchema(operation.args.map((arg) => ({ name: arg.name, required: arg.required, schema: argumentSchema(arg) }))));
</script>

<header class="head">
	<h1>{context.entry.title}</h1>
	<EndpointBar badge={graphqlBadge(operation.kind)} code={operation.name} copyLabel="Copy field name" />
	{#if operation.auth}<AuthSummary auth={operation.auth} {entries} />{/if}
</header>

{@render children()}

{#if operation.args.length > 0}
	<ReferenceSection id="arguments" title="Arguments">
		<SchemaTree schema={args} schemaHref={context.schemaHref} {entries} />
	</ReferenceSection>
{/if}

{#if returns}
	<ReferenceSection id="returns" title="Returns">
		<p>{#if returnsHref}<a class="type-link" href={returnsHref} data-sv-internal>{returns}</a>{:else}<code>{returns}</code>{/if}</p>
	</ReferenceSection>
{/if}

<style>
	.head {
		display: grid;
		gap: var(--sv-space-3);
		margin-block-end: var(--sv-space-4);
	}

	h1 {
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-4);
		font-weight: 700;
		line-height: 1.1;
	}

	.head :global(.auth) {
		margin: 0;
	}

	p {
		margin: 0;
	}

	code,
	.type-link {
		font-family: var(--sv-font-mono);
	}

	.type-link {
		color: var(--sv-accent-text);
	}
</style>

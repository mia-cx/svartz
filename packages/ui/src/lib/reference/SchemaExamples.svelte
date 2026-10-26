<!-- A generated JSON example of a schema, from its examples, defaults, and types. -->
<script lang="ts">
	import CodePanel from './CodePanel.svelte';
	import type { ReferenceExamplesProps } from './renderers.js';
	import { exampleFromSchema, type SchemaNode } from './schema.js';

	let { data, context }: ReferenceExamplesProps<{ name: string; schema: SchemaNode }> = $props();
</script>

<CodePanel
	title="Example"
	tabs={[{ id: 'json', label: data.name, code: JSON.stringify(exampleFromSchema(data.schema, context.schemas), null, 2) }]}
/>

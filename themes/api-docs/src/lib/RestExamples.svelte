<!-- A REST operation's examples: the request in the reader's language (remembered), then a response per status. -->
<script lang="ts">
	import { CodePanel, exampleFromSchema, type CodeTab, type ReferenceExamplesProps } from '@svartz/ui/reference/runtime';
	import { requestSnippets, SNIPPET_LANGUAGES, type RestOperation } from './api.js';
	import { apiSettings } from './settings.js';

	let { data: operation, context }: ReferenceExamplesProps<RestOperation> = $props();

	const LANGUAGE_KEY = 'svartz:api-language';
	const json = (value: unknown) => JSON.stringify(value, null, 2);

	const requestTabs = $derived.by(() => {
		const snippets = requestSnippets(operation, apiSettings(context.themeConfig).baseUrl, context.schemas);
		return SNIPPET_LANGUAGES.map((language) => ({ id: language.id, label: language.label, code: snippets[language.id] }));
	});

	const responseTabs = $derived(
		operation.responses.flatMap((response): CodeTab[] => {
			// An authored `null` is a real example.
			const example =
				response.example !== undefined ? response.example : response.schema ? exampleFromSchema(response.schema, context.schemas) : undefined;
			return example === undefined ? [] : [{ id: response.status, label: response.status, code: json(example) }];
		})
	);
</script>

<CodePanel title="Request" tabs={requestTabs} remember={LANGUAGE_KEY} />
{#if responseTabs.length > 0}<CodePanel title="Response" tabs={responseTabs} />{/if}

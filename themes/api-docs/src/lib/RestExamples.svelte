<!--
	A REST operation's examples: the request in the reader's language (remembered),
	then a response per status. A browser route's request shows as an HTML form
	and raw HTTP instead.
-->
<script lang="ts">
	import { CodePanel, type ReferenceExamplesProps } from '@svartz/ui/reference/runtime';
	import { BROWSER_LANGUAGES, browserSnippets, requestSnippets, responseTabs, SNIPPET_LANGUAGES, type RestOperation } from './api.js';
	import { apiSettings } from './settings.js';

	let { data: operation, context }: ReferenceExamplesProps<RestOperation> = $props();

	const LANGUAGE_KEY = 'svartz:api-language';

	const requestTabs = $derived.by(() => {
		const baseUrl = apiSettings(context.themeConfig).baseUrl;
		if (operation.client === 'browser') {
			const snippets = browserSnippets(operation, baseUrl, context.schemas);
			return BROWSER_LANGUAGES.flatMap((language) => {
				const code = snippets[language.id];
				return code === undefined ? [] : [{ id: language.id, label: language.label, code }];
			});
		}
		const snippets = requestSnippets(operation, baseUrl, context.schemas);
		return SNIPPET_LANGUAGES.map((language) => ({ id: language.id, label: language.label, code: snippets[language.id] }));
	});
	const responses = $derived(responseTabs(operation.responses, context.schemas));
</script>

<CodePanel title="Request" tabs={requestTabs} remember={LANGUAGE_KEY} />
{#if responses.length > 0}<CodePanel title="Response" tabs={responses} />{/if}

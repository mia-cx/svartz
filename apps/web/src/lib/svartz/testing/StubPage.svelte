<script lang="ts">
	let { entry, ..._rest } = $props<{
		entry?: { title?: string };
		[key: string]: unknown;
	}>();
</script>

<h2>{entry?.title ?? 'Svartz test page'}</h2>

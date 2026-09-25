<script lang="ts">
	import type { ContentComponents } from '../content-components.js';
	let { contentComponents }: { contentComponents: ContentComponents } = $props();
</script>

<contentComponents.link tag="a" attributes={{ href: '/note/' }} text="Note" href="/note/">Note</contentComponents.link>

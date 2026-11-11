<!--
	The site-actions region: an empty element marked
	`[data-svartz-region="site-actions"]` where plugins mount actions for the
	whole site, such as New page. Themes place it once per page, in the rail or
	whatever holds the site's navigation, so phones reach it in the drawer.
	Empty, it takes no space.
-->

<!-- Plugins own this element's children; Svelte never renders into it. -->
<div class="sv-site-actions" data-svartz-region="site-actions" data-sv-preview-omit></div>

<style>
	.sv-site-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-2);
	}

	.sv-site-actions:empty {
		display: none;
	}
</style>

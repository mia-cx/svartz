<script lang="ts">
	type TagEntry = {
		slug: string;
		title: string;
		noteCount: number;
		href: string;
	};

	let { tags = [] }: { tags?: readonly TagEntry[] } = $props();
</script>

<section class="list-page">
	<h1>Tags</h1>
	<p>{tags.length} tags in this vault.</p>
	<ul>
		{#each tags as tag (tag.slug)}
			<li>
				<a href={tag.href}>{tag.title}</a>
				<span>{tag.noteCount}</span>
			</li>
		{/each}
	</ul>
</section>

<style>
	.list-page {
		display: grid;
		gap: 1rem;
	}

	h1,
	p {
		margin: 0;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.75rem;
	}

	li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	a {
		text-decoration: none;
		color: inherit;
		font-weight: 600;
	}

	span {
		color: #94a3b8;
	}
</style>

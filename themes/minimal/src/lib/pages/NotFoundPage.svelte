<script lang="ts">
	let { match }: { match?: { pathname?: string } } = $props();
</script>

<section class="not-found">
	<h1>Not Found</h1>
	<p>{match?.pathname ?? 'This route'} does not exist in the active vault.</p>
	<p><a href="/">Return home</a></p>
</section>

<style>
	.not-found {
		display: grid;
		gap: 1rem;
	}

	h1,
	p {
		margin: 0;
	}

	a {
		color: #c4b5fd;
	}
</style>

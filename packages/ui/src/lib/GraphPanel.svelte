<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		forceSimulation,
		forceLink,
		forceManyBody,
		forceCenter,
		forceCollide,
		drag,
		select,
		type SimulationNodeDatum
	} from 'd3';

	type Entry = { slug: string; title: string };

	let {
		currentSlug,
		entries = [],
		graph = {}
	}: {
		currentSlug?: string;
		entries?: readonly Entry[];
		graph?: Record<string, readonly string[]>;
	} = $props();

	type NodeDatum = SimulationNodeDatum & {
		id: string;
		title: string;
		isCurrent: boolean;
		degree: number;
	};
	type RawLink = { source: string; target: string };

	let containerEl = $state<HTMLDivElement | undefined>();
	let svgEl = $state<SVGSVGElement | undefined>();
	let width = $state(0);
	const HEIGHT = 200;

	function slugToHref(slug: string) {
		return slug === 'index' ? '/' : `/${slug}/`;
	}

	$effect(() => {
		if (!containerEl) return;
		const ro = new ResizeObserver((entries) => {
			width = entries[0]?.contentRect.width ?? 0;
		});
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	$effect(() => {
		if (!svgEl || width < 10) return;

		// Build node + link sets
		const nodeSet = new SvelteSet<string>();
		const rawLinks: RawLink[] = [];

		if (currentSlug) {
			nodeSet.add(currentSlug);
			for (const neighbor of graph[currentSlug] ?? []) {
				nodeSet.add(neighbor);
				rawLinks.push({ source: currentSlug, target: neighbor });
				for (const n2 of graph[neighbor] ?? []) {
					if (nodeSet.has(n2)) rawLinks.push({ source: neighbor, target: n2 });
				}
			}
		} else {
			entries.forEach((e) => nodeSet.add(e.slug));
			for (const [src, targets] of Object.entries(graph)) {
				for (const tgt of targets) {
					nodeSet.add(src);
					nodeSet.add(tgt);
					rawLinks.push({ source: src, target: tgt });
				}
			}
		}

		// Deduplicate undirected links
		const seen = new SvelteSet<string>();
		const dedupedLinks = rawLinks.filter((l) => {
			const key = [l.source, l.target].sort().join('\0');
			return seen.has(key) ? false : (seen.add(key), true);
		});

		const degreeMap = new SvelteMap<string, number>();
		for (const l of dedupedLinks) {
			degreeMap.set(l.source, (degreeMap.get(l.source) ?? 0) + 1);
			degreeMap.set(l.target, (degreeMap.get(l.target) ?? 0) + 1);
		}

		const entryMap = new SvelteMap(entries.map((e) => [e.slug, e.title]));
		const nodes: NodeDatum[] = [...nodeSet].map((id) => ({
			id,
			title: entryMap.get(id) ?? id,
			isCurrent: id === currentSlug,
			degree: degreeMap.get(id) ?? 0
		}));

		if (nodes.length === 0) return;

		const svg = select(svgEl);
		svg.selectAll('*').remove();

		const linkSel = svg
			.append('g')
			.attr('stroke', '#94a3b8')
			.attr('stroke-opacity', '0.45')
			.selectAll<SVGLineElement, RawLink>('line')
			.data(dedupedLinks)
			.join('line');

		const nodeSel = svg
			.append('g')
			.selectAll<SVGGElement, NodeDatum>('g')
			.data(nodes, (d) => d.id)
			.join('g')
			.style('cursor', 'pointer')
			.on('click', (_, d) => {
				window.location.href = slugToHref(d.id);
			});

		nodeSel
			.append('circle')
			.attr('r', (d) => 3 + Math.sqrt(d.degree))
			.attr('fill', (d) => (d.isCurrent ? '#3b82f6' : '#94a3b8'))
			.attr('stroke', (d) => (d.isCurrent ? '#1d4ed8' : 'none'))
			.attr('stroke-width', 1.5);

		nodeSel.append('title').text((d) => d.title);

		nodeSel
			.append('text')
			.text((d) => d.title)
			.attr('font-size', 9)
			.attr('dx', (d) => 5 + Math.sqrt(d.degree))
			.attr('dy', '0.35em')
			.attr('fill', '#71717a')
			.attr('pointer-events', 'none')
			.attr('user-select', 'none');

		const simulation = forceSimulation<NodeDatum>(nodes)
			.force(
				'link',
				forceLink<NodeDatum, RawLink>(dedupedLinks)
					.id((d) => d.id)
					.distance(55)
			)
			.force('charge', forceManyBody().strength(-80))
			.force('center', forceCenter(width / 2, HEIGHT / 2))
			.force('collide', forceCollide(14));

		nodeSel.call(
			drag<SVGGElement, NodeDatum>()
				.on('start', (event, d) => {
					if (!event.active) simulation.alphaTarget(0.3).restart();
					d.fx = d.x;
					d.fy = d.y;
				})
				.on('drag', (event, d) => {
					d.fx = event.x;
					d.fy = event.y;
				})
				.on('end', (event, d) => {
					if (!event.active) simulation.alphaTarget(0);
					d.fx = null;
					d.fy = null;
				})
		);

		simulation.on('tick', () => {
			linkSel
				.attr('x1', (d) => (d.source as unknown as NodeDatum).x ?? 0)
				.attr('y1', (d) => (d.source as unknown as NodeDatum).y ?? 0)
				.attr('x2', (d) => (d.target as unknown as NodeDatum).x ?? 0)
				.attr('y2', (d) => (d.target as unknown as NodeDatum).y ?? 0);

			nodeSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
		});

		return () => simulation.stop();
	});

	const hasData = $derived(
		currentSlug
			? (graph[currentSlug]?.length ?? 0) > 0
			: entries.length > 0 || Object.keys(graph).length > 0
	);
</script>

{#if hasData}
	<section class="grid gap-2" aria-label="Graph view">
		<p class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
			Graph View
		</p>
		<div
			bind:this={containerEl}
			class="w-full overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50"
		>
			<svg bind:this={svgEl} {width} height={HEIGHT} class="block"></svg>
		</div>
	</section>
{/if}

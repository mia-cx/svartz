export interface GraphNote {
	readonly slug: string;
	readonly title: string;
	readonly href: string;
	readonly tags: readonly string[];
}

export interface GraphInput {
	readonly notes: readonly GraphNote[];
	/** Outgoing links by slug (`vault.graph`). */
	readonly links: Readonly<Record<string, readonly string[]>>;
	readonly tagHref: (tag: string) => string;
}

export interface GraphNode {
	readonly id: string;
	readonly label: string;
	readonly href: string;
	readonly kind: 'note' | 'tag';
	/** Link count, which sizes the node. */
	degree: number;
}

export interface GraphLink {
	readonly source: string;
	readonly target: string;
}

/**
 * The link graph around `center`, `depth` hops out (−1 for the whole vault).
 * Tags become nodes, so notes sharing a tag sit two hops apart.
 */
export function buildGraph(
	input: GraphInput,
	center: string | undefined,
	depth: number
): { nodes: GraphNode[]; links: GraphLink[] } {
	const notes = new Map(input.notes.map((note) => [note.slug, note]));
	const allLinks: GraphLink[] = [];
	for (const [source, targets] of Object.entries(input.links)) {
		if (!notes.has(source)) continue;
		for (const target of targets) {
			if (notes.has(target) && target !== source) allLinks.push({ source, target });
		}
	}
	for (const note of input.notes) {
		for (const tag of note.tags) allLinks.push({ source: note.slug, target: `#${tag}` });
	}

	const neighbours = new Map<string, Set<string>>();
	const connect = (from: string, to: string) => {
		if (!neighbours.has(from)) neighbours.set(from, new Set());
		neighbours.get(from)!.add(to);
	};
	for (const link of allLinks) {
		connect(link.source, link.target);
		connect(link.target, link.source);
	}

	const kept = new Set<string>();
	if (depth < 0 || !center) {
		for (const id of [...notes.keys(), ...neighbours.keys()]) kept.add(id);
	} else {
		let frontier = [center];
		kept.add(center);
		for (let hop = 0; hop < depth; hop += 1) {
			const next: string[] = [];
			for (const id of frontier) {
				for (const neighbour of neighbours.get(id) ?? []) {
					if (kept.has(neighbour)) continue;
					kept.add(neighbour);
					next.push(neighbour);
				}
			}
			frontier = next;
		}
	}

	const links = allLinks.filter((link) => kept.has(link.source) && kept.has(link.target));
	const nodes = [...kept].map((id): GraphNode => {
		const note = notes.get(id);
		const degree = neighbours.get(id)?.size ?? 0;
		return note
			? { id, label: note.title, href: note.href, kind: 'note', degree }
			: { id, label: id, href: input.tagHref(id.slice(1)), kind: 'tag', degree };
	});
	return { nodes, links };
}

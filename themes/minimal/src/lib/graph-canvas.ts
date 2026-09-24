/**
 * Draws a link graph on a <canvas>: d3-force for layout, d3-zoom for pan and
 * zoom. Nodes can be dragged; a click without a drag opens the note. Colours
 * come from the design tokens and refresh when the colour mode changes.
 */
import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceRadial,
	forceSimulation,
	type SimulationLinkDatum,
	type SimulationNodeDatum
} from 'd3-force';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import type { GraphLink, GraphNode } from './graph.js';

type Node = GraphNode & SimulationNodeDatum;
type Link = SimulationLinkDatum<Node>;

export interface GraphCanvasOptions {
	readonly center?: string;
	/** Spread the whole vault in a disc: used by the full-vault view. */
	readonly radial?: boolean;
	/** Zoom level at which every label shows. */
	readonly labelZoom?: number;
	readonly onOpen: (href: string) => void;
}

const CLICK_SLOP_PX = 4;
const LABEL_PX = 11;

function tokenColors(probeParent: HTMLElement) {
	const probe = document.createElement('span');
	probe.style.display = 'none';
	probeParent.append(probe);
	const read = (token: string) => {
		probe.style.color = `var(${token})`;
		return getComputedStyle(probe).color;
	};
	const colors = {
		paper: read('--sv-paper'),
		ink: read('--sv-ink'),
		muted: read('--sv-muted'),
		rule: read('--sv-rule-strong'),
		accent: read('--sv-accent'),
		font: getComputedStyle(probeParent).getPropertyValue('--sv-font-interface')
	};
	probe.remove();
	return colors;
}

const radius = (node: Node) => 2.5 + Math.sqrt(node.degree) * 1.4;

export function mountGraph(
	canvas: HTMLCanvasElement,
	data: { nodes: readonly GraphNode[]; links: readonly GraphLink[] },
	options: GraphCanvasOptions
): () => void {
	const context = canvas.getContext('2d')!;
	const nodes: Node[] = data.nodes.map((node) => ({ ...node }));
	const links: Link[] = data.links.map((link) => ({ ...link }));
	const neighbours = new Map<string, Set<string>>();
	for (const link of data.links) {
		neighbours.set(link.source, (neighbours.get(link.source) ?? new Set()).add(link.target));
		neighbours.set(link.target, (neighbours.get(link.target) ?? new Set()).add(link.source));
	}

	let width = 0;
	let height = 0;
	let transform: ZoomTransform = zoomIdentity;
	let hovered: Node | undefined;
	let colors = tokenColors(canvas.parentElement ?? document.body);
	const labelZoom = options.labelZoom ?? 1.6;
	const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

	const simulation = forceSimulation<Node>(nodes)
		.force('charge', forceManyBody<Node>().strength(-70))
		.force('link', forceLink<Node, Link>(links).id((node) => node.id).distance(34))
		.force('center', forceCenter(0, 0).strength(0.4))
		.force('collide', forceCollide<Node>((node) => radius(node) + 3));

	const toWorld = (x: number, y: number) => {
		const [wx, wy] = transform.invert([x, y]);
		return [wx - width / 2, wy - height / 2] as const;
	};

	function draw() {
		const ratio = window.devicePixelRatio || 1;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, width, height);
		context.save();
		context.translate(transform.x, transform.y);
		context.scale(transform.k, transform.k);
		context.translate(width / 2, height / 2);

		const focus = hovered ? neighbours.get(hovered.id) : undefined;
		const lit = (node: Node) => !hovered || node === hovered || Boolean(focus?.has(node.id));

		context.lineWidth = 1 / transform.k;
		for (const link of links) {
			const source = link.source as Node;
			const target = link.target as Node;
			const active = hovered && (source === hovered || target === hovered);
			context.globalAlpha = hovered && !active ? 0.25 : 1;
			context.strokeStyle = active ? colors.ink : colors.rule;
			context.beginPath();
			context.moveTo(source.x!, source.y!);
			context.lineTo(target.x!, target.y!);
			context.stroke();
		}

		for (const node of nodes) {
			const current = node.id === options.center;
			context.globalAlpha = lit(node) ? 1 : 0.3;
			context.beginPath();
			context.arc(node.x!, node.y!, radius(node), 0, Math.PI * 2);
			if (node.kind === 'tag') {
				context.fillStyle = colors.paper;
				context.fill();
				context.lineWidth = 1.5 / transform.k;
				context.strokeStyle = colors.muted;
				context.stroke();
			} else {
				context.fillStyle = current ? colors.accent : node === hovered ? colors.ink : colors.muted;
				context.fill();
			}
		}
		context.restore();

		context.font = `${LABEL_PX}px ${colors.font}`;
		context.textAlign = 'center';
		context.textBaseline = 'top';
		const zoomAlpha = Math.min(1, Math.max(0, (transform.k - labelZoom * 0.75) / (labelZoom * 0.25)));
		for (const node of nodes) {
			const named = node.id === options.center || node === hovered || Boolean(focus?.has(node.id));
			const alpha = named ? 1 : hovered ? 0 : zoomAlpha;
			if (alpha === 0) continue;
			const [x, y] = transform.apply([node.x! + width / 2, node.y! + height / 2]);
			context.globalAlpha = alpha;
			context.fillStyle = colors.ink;
			context.fillText(node.label, x, y + radius(node) * transform.k + 3);
		}
		context.globalAlpha = 1;
	}

	function resize() {
		const ratio = window.devicePixelRatio || 1;
		width = canvas.clientWidth;
		height = canvas.clientHeight;
		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(height * ratio);
		if (options.radial) {
			simulation.force('radial', forceRadial<Node>(Math.min(width, height) * 0.38).strength(0.08));
		}
		draw();
	}

	const nodeAt = (event: { offsetX: number; offsetY: number }) => {
		const [x, y] = toWorld(event.offsetX, event.offsetY);
		return simulation.find(x, y, 10 / transform.k);
	};

	// Pan and zoom, except when the pointer starts on a node (that drags it).
	const zoomBehaviour = zoom<HTMLCanvasElement, unknown>()
		.scaleExtent([0.25, 5])
		.filter(
			(event: MouseEvent) =>
				event.type === 'wheel' || (!event.button && !event.ctrlKey && !nodeAt(event))
		)
		.on('zoom', (event: { transform: ZoomTransform }) => {
			transform = event.transform;
			draw();
		});
	select(canvas).call(zoomBehaviour);

	let dragged: Node | undefined;
	let pressX = 0;
	let pressY = 0;
	let moved = false;

	const onPointerDown = (event: PointerEvent) => {
		dragged = nodeAt(event);
		if (!dragged) return;
		canvas.setPointerCapture(event.pointerId);
		pressX = event.offsetX;
		pressY = event.offsetY;
		moved = false;
		if (!reduceMotion) simulation.alphaTarget(0.2).restart();
	};

	const onPointerMove = (event: PointerEvent) => {
		if (dragged) {
			moved ||= Math.hypot(event.offsetX - pressX, event.offsetY - pressY) > CLICK_SLOP_PX;
			[dragged.fx, dragged.fy] = toWorld(event.offsetX, event.offsetY);
			if (reduceMotion) {
				[dragged.x, dragged.y] = [dragged.fx!, dragged.fy!];
				draw();
			}
			return;
		}
		const next = nodeAt(event);
		if (next === hovered) return;
		hovered = next;
		canvas.style.cursor = next ? 'pointer' : 'grab';
		draw();
	};

	const onPointerUp = () => {
		if (!dragged) return;
		const released = dragged;
		dragged.fx = dragged.fy = null;
		dragged = undefined;
		simulation.alphaTarget(0);
		if (!moved) options.onOpen(released.href);
	};

	const onPointerLeave = () => {
		if (dragged || !hovered) return;
		hovered = undefined;
		draw();
	};

	const onColorMode = () => {
		colors = tokenColors(canvas.parentElement ?? document.body);
		draw();
	};
	const scheme = matchMedia('(prefers-color-scheme: dark)');

	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointermove', onPointerMove);
	canvas.addEventListener('pointerup', onPointerUp);
	canvas.addEventListener('pointerleave', onPointerLeave);
	window.addEventListener('svartz:color-mode', onColorMode);
	scheme.addEventListener('change', onColorMode);
	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(canvas);

	if (reduceMotion) {
		simulation.stop();
		simulation.tick(300);
	} else {
		simulation.on('tick', draw);
	}
	resize();

	return () => {
		simulation.stop();
		resizeObserver.disconnect();
		select(canvas).on('.zoom', null);
		canvas.removeEventListener('pointerdown', onPointerDown);
		canvas.removeEventListener('pointermove', onPointerMove);
		canvas.removeEventListener('pointerup', onPointerUp);
		canvas.removeEventListener('pointerleave', onPointerLeave);
		window.removeEventListener('svartz:color-mode', onColorMode);
		scheme.removeEventListener('change', onColorMode);
	};
}

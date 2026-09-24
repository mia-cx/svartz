import { isRecord, topLevelSections } from '@svartz/ui';

type Properties = Readonly<Record<string, unknown>>;

/** Kinds in reference order, each with its badge hue. */
export const SYMBOL_KINDS = {
	namespace: 'orange',
	class: 'amber',
	interface: 'teal',
	type: 'blue',
	enum: 'green',
	function: 'violet',
	variable: 'cyan',
	method: 'violet',
	property: 'cyan',
	constructor: 'amber',
	accessor: 'teal'
} as const;

export type SymbolKind = keyof typeof SYMBOL_KINDS;

/** Plural headings for grouped lists ("Classes", "Functions"). */
export const KIND_HEADINGS: Record<SymbolKind, string> = {
	namespace: 'Namespaces',
	class: 'Classes',
	interface: 'Interfaces',
	type: 'Types',
	enum: 'Enums',
	function: 'Functions',
	variable: 'Variables',
	method: 'Methods',
	property: 'Properties',
	constructor: 'Constructors',
	accessor: 'Accessors'
};
/** Kinds that get their own page; the rest appear as members. */
const PAGE_KINDS = ['namespace', 'class', 'interface', 'type', 'enum', 'function', 'variable'] as const;

export interface SymbolParameter {
	readonly name: string;
	readonly type?: string;
	readonly optional: boolean;
	readonly default?: string;
	readonly description?: string;
}

export interface SymbolMember {
	readonly name: string;
	readonly kind: SymbolKind;
	readonly signature?: string;
	readonly description?: string;
	readonly static: boolean;
	readonly deprecated?: string;
}

/**
 * The `symbol` frontmatter schema: one exported symbol per note. A TypeDoc
 * plugin emits this shape; until then, write it by hand. Types in `type`,
 * `extends`, and `implements` may use `[[Name]]` to link to other symbols.
 *
 * ```yaml
 * symbol:
 *   kind: function
 *   name: defineTheme
 *   signature: "defineTheme(factory: ThemeFactory): ThemeFactory"   # or signatures: [...]
 *   parameters: [{ name: factory, type: "[[ThemeFactory]]", description: … }]
 *   returns: { type: ThemeFactory, description: … }
 *   source: https://github.com/…/define-theme.ts
 *   since: 1.0.0
 * ```
 */
export interface DocSymbol {
	readonly kind: SymbolKind;
	readonly name: string;
	readonly signatures: readonly string[];
	readonly typeParameters: readonly SymbolParameter[];
	readonly parameters: readonly SymbolParameter[];
	readonly returns?: { readonly type: string; readonly description?: string };
	readonly throws: readonly { readonly type: string; readonly description?: string }[];
	readonly extends: readonly string[];
	readonly implements: readonly string[];
	readonly members: readonly SymbolMember[];
	readonly source?: string;
	readonly since?: string;
	readonly deprecated?: string;
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
const texts = (value: unknown) => (Array.isArray(value) ? value.map(text).filter((item) => item !== undefined) : []);
const isKind = (value: unknown): value is SymbolKind => typeof value === 'string' && value in SYMBOL_KINDS;
const records = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);

function readParameter(raw: Properties): SymbolParameter | undefined {
	const name = text(raw.name);
	if (!name) return undefined;
	return {
		name,
		type: text(raw.type) ?? text(raw.constraint),
		optional: raw.optional === true,
		default: text(raw.default) ?? (typeof raw.default === 'number' ? String(raw.default) : undefined),
		description: text(raw.description)
	};
}

const typed = (raw: Properties) => {
	const type = text(raw.type);
	return type ? { type, description: text(raw.description) } : undefined;
};

/** The note's symbol, or undefined when the frontmatter has none or is malformed. */
export function readSymbol(properties: Properties): DocSymbol | undefined {
	const raw = properties.symbol;
	if (!isRecord(raw) || !isKind(raw.kind)) return undefined;
	const name = text(raw.name);
	if (!name) return undefined;
	return {
		kind: raw.kind,
		name,
		signatures: text(raw.signature) ? [raw.signature as string] : texts(raw.signatures),
		typeParameters: records(raw.typeParameters).map(readParameter).filter((item) => item !== undefined),
		parameters: records(raw.parameters).map(readParameter).filter((item) => item !== undefined),
		returns: isRecord(raw.returns) ? typed(raw.returns) : text(raw.returns) ? { type: raw.returns as string } : undefined,
		throws: records(raw.throws).map(typed).filter((item) => item !== undefined),
		extends: texts(raw.extends),
		implements: texts(raw.implements),
		members: records(raw.members).flatMap((member): SymbolMember[] => {
			const memberName = text(member.name);
			if (!memberName || !isKind(member.kind)) return [];
			return [{
				name: memberName,
				kind: member.kind,
				signature: text(member.signature),
				description: text(member.description),
				static: member.static === true,
				deprecated: member.deprecated === true ? 'Deprecated.' : text(member.deprecated)
			}];
		}),
		source: text(raw.source),
		since: text(raw.since),
		deprecated: raw.deprecated === true ? 'Deprecated.' : text(raw.deprecated)
	};
}

export interface TocItem {
	readonly depth: number;
	readonly text: string;
	readonly slug: string;
}

/**
 * "On this page" for a symbol: the generated sections (ids match
 * SymbolReference) around the note's own headings, in the order they render.
 */
export function symbolToc(symbol: DocSymbol, noteToc: readonly TocItem[]): TocItem[] {
	const section = (slug: string, text: string, present: boolean) => (present ? [{ depth: 2, text, slug }] : []);
	const memberKinds = [...new Set(symbol.members.map((member) => member.kind))];
	return [
		...section('type-parameters', 'Type parameters', symbol.typeParameters.length > 0),
		...section('parameters', 'Parameters', symbol.parameters.length > 0),
		...section('returns', 'Returns', Boolean(symbol.returns)),
		...section('throws', 'Throws', symbol.throws.length > 0),
		...noteToc,
		...section('hierarchy', 'Hierarchy', symbol.extends.length + symbol.implements.length > 0),
		...memberKinds.map((kind) => ({ depth: 2, text: KIND_HEADINGS[kind], slug: `members-${kind}` }))
	];
}

interface NavEntry {
	readonly slug: string;
	readonly title: string;
	readonly href: string;
	readonly properties: Properties;
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const kindOf = (entry: NavEntry) => readSymbol(entry.properties)?.kind;

/** Symbol notes grouped by kind, in reference order; notes without a symbol are left out. */
export function groupByKind<T extends NavEntry>(entries: readonly T[]): { kind: SymbolKind; entries: T[] }[] {
	return PAGE_KINDS.map((kind) => ({
		kind,
		entries: entries.filter((entry) => kindOf(entry) === kind).sort((left, right) => collator.compare(left.title, right.title))
	})).filter((group) => group.entries.length > 0);
}

export interface NavSection<T> {
	readonly title: string;
	readonly href?: string;
	/** A module of symbols (grouped by kind) rather than a folder of guides. */
	readonly symbols: boolean;
	readonly entries: T[];
	/** Entries that aren't page-level symbols (guides), which `groupByKind` leaves out. */
	readonly pages: T[];
}

const isPageKind = (kind: SymbolKind | undefined) => (PAGE_KINDS as readonly (SymbolKind | undefined)[]).includes(kind);

/**
 * The sidebar: one section per top-level folder, guides before modules. Notes
 * at the vault root (other than the home note) form an Overview section. A
 * folder note (`core/index.md`, published as `core`) names and links its module.
 */
export function symbolNav<T extends NavEntry>(
	entries: readonly T[],
	folders: readonly { readonly slug: string; readonly title: string; readonly href: string }[]
): NavSection<T>[] {
	return topLevelSections(entries, folders)
		.map((section): NavSection<T> => {
			const sorted = [...section.entries].sort((left, right) => collator.compare(left.title, right.title));
			return {
				title: section.slug ? section.title : 'Overview',
				href: section.href,
				symbols: sorted.some((entry) => kindOf(entry) !== undefined),
				entries: sorted,
				pages: sorted.filter((entry) => !isPageKind(kindOf(entry)))
			};
		})
		.sort(
			(left, right) =>
				Number(left.symbols) - Number(right.symbols) ||
				Number(right.title === 'Overview') - Number(left.title === 'Overview') ||
				collator.compare(left.title, right.title)
		);
}

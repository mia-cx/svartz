/**
 * Generates the API reference: one note per exported symbol of every published entry point, in the `symbol`
 * frontmatter shape `@svartz/theme-docs` renders (see themes/docs/README.md). TypeDoc reads the packages' built
 * `.d.ts` files, which are what consumers import, in one program, so a type from another package links to its page.
 *
 *   node scripts/api-reference/index.mjs   # writes vaults/docs/reference/api/
 *
 * The root `pnpm build` runs it after the packages build. The output is generated, so it is gitignored and never
 * edited by hand.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Application, Converter, ReflectionKind } from 'typedoc';
import ts from 'typescript';
import { readEntryPoints } from './entries.mjs';

/** @typedef {import('./entries.mjs').EntryPoint} EntryPoint */
/** @typedef {{ path: string, content: string }} Note */

const PAGE_KINDS = new Map([
	[ReflectionKind.Namespace, 'namespace'],
	[ReflectionKind.Class, 'class'],
	[ReflectionKind.Interface, 'interface'],
	[ReflectionKind.TypeAlias, 'type'],
	[ReflectionKind.Enum, 'enum'],
	[ReflectionKind.Function, 'function'],
	[ReflectionKind.Variable, 'variable']
]);

/** Headings for an entry point's symbol list, in the docs theme's reference order. */
const KIND_HEADINGS = { namespace: 'Namespaces', class: 'Classes', interface: 'Interfaces', type: 'Types', enum: 'Enums', function: 'Functions', variable: 'Variables' };

/** Nested object types deeper than this collapse to `{ … }`, so a signature stays readable. */
const MAX_OBJECT_DEPTH = 2;

/**
 * Convert the entry points with TypeDoc. Returns each entry's module reflection and, for Svelte components, the props
 * TypeDoc can't see because svelte-package declares them in a type the module doesn't export.
 * @param {readonly EntryPoint[]} entries
 * @param {{ tsconfig: string }} options
 */
export async function convert(entries, { tsconfig }) {
	const app = await Application.bootstrap({
		entryPoints: entries.map((entry) => entry.types),
		entryPointStrategy: 'resolve',
		tsconfig,
		skipErrorChecking: true,
		excludeInternal: true,
		excludePrivate: true,
		excludeProtected: false,
		// Options read best in the order their authors wrote them.
		sort: ['source-order'],
		readme: 'none',
		logLevel: 'Error',
		validation: { notExported: false, invalidLink: false, rewrittenLink: false, notDocumented: false, unusedMergeModuleWith: false }
	});
	/** @type {Map<object, ComponentProp[]>} */
	const components = new Map();
	/** @type {Map<object, ComponentProp[]>} */
	const aliases = new Map();
	app.converter.on(Converter.EVENT_CREATE_DECLARATION, (context, reflection) => {
		const symbol = context.getSymbolFromReflection(reflection);
		if (!symbol) return;
		if (reflection.kindOf(ReflectionKind.TypeAlias)) {
			const fields = aliasFields(context.checker, context.checker.getDeclaredTypeOfSymbol(symbol));
			if (fields) aliases.set(reflection, fields);
			return;
		}
		if (!reflection.kindOf(ReflectionKind.Variable)) return;
		const props = componentProps(context.checker, context.checker.getTypeOfSymbol(symbol));
		if (props) components.set(reflection, props);
	});
	const project = await app.convert();
	if (!project) throw new Error('TypeDoc could not convert the entry points; see the errors above.');

	const modules = entries.length === 1 ? [project] : (project.children ?? []);
	const byFile = new Map(modules.map((module) => [module.sources?.[0]?.fullFileName, module]));
	return {
		components,
		aliases,
		modules: entries.map((entry) => {
			const module = entries.length === 1 ? project : byFile.get(entry.types.split(sep).join('/'));
			if (!module) throw new Error(`TypeDoc produced no module for ${entry.packageName}/${entry.subpath} (${entry.types}).`);
			return module;
		})
	};
}

/**
 * A field: `name` is its path (`discovery.site`), `key` its own name when that differs.
 * @typedef {{ name: string, key?: string, optional: boolean, type: string, description?: string, default?: string }} ComponentProp
 */

/** The props of a Svelte `Component<Props>`, or undefined for any other type. */
function componentProps(checker, type) {
	const declaration = type.symbol?.declarations?.[0];
	if (type.symbol?.name !== 'Component' || !declaration?.getSourceFile().fileName.includes('/svelte/')) return undefined;
	const [props] = checker.getTypeArguments(type);
	return props ? fieldsOf(checker, props, { asWritten: true }) : undefined;
}

/**
 * The fields of a type alias that resolves to an object type TypeDoc can't list, such as the config types
 * `Schema.Schema.Type<typeof VaultConfigSchema>`, or undefined for any other type: unions, functions, arrays and
 * primitives keep their type expression.
 */
function aliasFields(checker, type) {
	if (!plainObject(checker, type)) return undefined;
	const fields = fieldsOf(checker, type);
	return fields.length > 0 ? fields : undefined;
}

/** Nested fields deeper than this keep their type on one row: `a.b.c.d` lists, `a.b.c.d.e` doesn't. */
const MAX_FIELD_DEPTH = 3;

/** Whether `type` is an object of fields: not a union, function, array, tuple or primitive. */
const plainObject = (checker, type) =>
	(type.flags & ts.TypeFlags.Object) !== 0 && !checker.isArrayType(type) && !checker.isTupleType(type) &&
	type.getCallSignatures().length === 0 && type.getConstructSignatures().length === 0;

/**
 * Each property of `type`, with its doc comment and default. Its type is the one written on its declaration when
 * `asWritten` and there is one (a component's props read as their author wrote them), else the checker's resolved type
 * (a schema field reads as the value it accepts, `string`, not as `Schema.optional<typeof Schema.String>`). A resolved
 * field holding an object of fields lists them too, as `discovery.site.title`, the way inline option objects do.
 */
function fieldsOf(checker, type, { asWritten = false, prefix = '', depth = 0 } = {}) {
	return checker.getPropertiesOfType(type).flatMap((prop) => {
		const node = prop.declarations?.[0];
		const tag = prop.getJsDocTags(checker).find((item) => item.name === 'default' || item.name === 'defaultValue');
		const optional = (prop.flags & ts.SymbolFlags.Optional) !== 0;
		const resolved = checker.getTypeOfSymbol(prop);
		const written = asWritten && node && ts.isPropertySignature(node) && node.type ? node.type.getText() : undefined;
		// Spotting a nested object looks past an optional field's `undefined`. The type text drops only `| undefined`,
		// which `?` already states, so `unknown` stays `unknown` and `null` stays.
		const value = optional ? checker.getNonNullableType(resolved) : resolved;
		const nested = written === undefined && depth < MAX_FIELD_DEPTH && plainObject(checker, value) &&
			checker.getPropertiesOfType(value).length > 0 ? value : undefined;
		const row = {
			name: `${prefix}${prop.name}`,
			key: prop.name,
			optional,
			type: written ?? (nested ? '{ … }' : withoutUndefined(checker.typeToString(resolved, undefined, ts.TypeFormatFlags.NoTruncation), optional)),
			description: oneLine(ts.displayPartsToString(prop.getDocumentationComment(checker))) || undefined,
			default: tag ? stripCode(ts.displayPartsToString(tag.text)) || undefined : undefined
		};
		return [row, ...(nested ? fieldsOf(checker, nested, { prefix: `${row.name}.`, depth: depth + 1 }) : [])];
	});
}

/** An optional field's type as text, without the `| undefined` its `?` already states. */
const withoutUndefined = (text, optional) => (optional ? text.replace(/ \| undefined$/, '').replace(/^undefined \| /, '') : text);

/**
 * Lay out one note per declaration, plus a folder note per entry point and one for the whole reference.
 * Notes land in `<dir>/<package>/<subpath>/<Name>.md`; names that would share a file name or URL in one folder
 * (`themeSettings` and `ThemeSettings`, or a symbol named like its folder or a subpath folder) take their kind as a
 * suffix.
 * @param {readonly EntryPoint[]} entries
 * @param {Awaited<ReturnType<typeof convert>>} converted
 * @param {{ dir: string, source?: (reflection: any, entry: EntryPoint) => { url?: string, file?: string } | undefined, dates?: (file: string) => { created?: string, updated?: string } | undefined }} options
 *   `dir` is the vault-relative folder the notes go in; wikilinks name notes by vault path.
 * @returns {Note[]}
 */
export function buildNotes(entries, { modules, components, aliases = new Map() }, { dir, source = () => undefined, dates = () => undefined }) {
	const folders = entries.map(folderOf);
	// `index` and a note named after its folder (`auth/auth.md`) would both be the folder's own note.
	const reserved = new Map(folders.map((folder) => [folder, new Set(['index', folder.split('/').at(-1)])]));
	for (const folder of folders) reserved.get(dirname(folder))?.add(folder.split('/').at(-1));

	/** @type {Map<any, { link: string, entry: EntryPoint }>} reflection → its note */
	const pages = new Map();
	const declarations = entries.map((entry, index) => {
		const folder = folders[index];
		const children = (modules[index].children ?? []).filter((child) => PAGE_KINDS.has(child.kind) && !isComponentType(child, modules[index]));
		const counts = new Map();
		for (const child of children) counts.set(child.name.toLowerCase(), (counts.get(child.name.toLowerCase()) ?? 0) + 1);
		const used = new Set();
		for (const child of children) {
			const key = child.name.toLowerCase();
			const file = counts.get(key) > 1 || reserved.get(folder).has(key) ? `${child.name}-${kindOf(child)}` : child.name;
			if (used.has(file.toLowerCase())) throw new Error(`Two symbols in ${entry.packageName}/${entry.subpath} would both be ${folder}/${file}.md.`);
			used.add(file.toLowerCase());
			pages.set(child, { link: `${dir}/${folder}/${file}`, entry });
		}
		return children;
	});

	const link = (reflection) => {
		const target = reflection?.kindOf?.(ReflectionKind.Reference) ? reflection.getTargetReflectionDeep() : reflection;
		return pages.get(target)?.link;
	};
	// Component props come from the type checker as source text, so their types link by name: to the one page with
	// that name, or the one in the component's own package.
	const byName = Map.groupBy([...pages.entries()], ([reflection]) => reflection.name);
	const linkNames = (text, entry) => text.replace(/(?<![\w$.])[A-Z][\w$]*/g, (name) => {
		const candidates = byName.get(name) ?? [];
		const own = candidates.filter(([, page]) => page.entry.packageName === entry.packageName);
		const [match] = candidates.length === 1 ? candidates : own.length === 1 ? own : [];
		return match ? `[[${match[1].link}|${name}]]` : name;
	});
	const notes = [];
	const updatedOf = new Map();

	entries.forEach((entry, index) => {
		for (const reflection of declarations[index]) {
			const page = pages.get(reflection);
			const origin = source(reflection, entry);
			const date = origin?.file ? dates(origin.file) : undefined;
			if (date?.updated) updatedOf.set(reflection, date.updated);
			// A type alias TypeDoc lists no members for, such as a schema-derived config type, takes the fields the checker
			// resolved for it.
			const fields = components.get(reflection) ??
				(reflection.kindOf(ReflectionKind.TypeAlias) && objectMembers(reflection.type).length === 0 ? aliases.get(reflection) : undefined);
			notes.push({ path: `${page.link.slice(dir.length + 1)}.md`, content: symbolNote(reflection, { link, props: fields?.map((prop) => ({ ...prop, type: linkNames(prop.type, entry) })), url: origin?.url, date }) });
		}
	});

	entries.forEach((entry, index) => {
		const folder = folders[index];
		const children = folders.flatMap((other, otherIndex) => (dirname(other) === folder ? [entries[otherIndex]] : []));
		const reexports = (modules[index].children ?? []).filter((child) => child.kindOf(ReflectionKind.Reference) && link(child));
		const updated = declarations[index].map((reflection) => updatedOf.get(reflection)).filter(Boolean).sort().at(-1);
		notes.push({ path: `${folder}/index.md`, content: entryNote(entry, { declarations: declarations[index], reexports, children, link, dir, updated }) });
	});

	notes.push({ path: 'index.md', content: overviewNote(entries, dir) });
	return notes;
}

/** Svelte components export a type of the same name (`type Badge = ReturnType<typeof Badge>`); the component's page covers it. */
function isComponentType(reflection, module) {
	if (!reflection.kindOf(ReflectionKind.TypeAlias)) return false;
	const type = reflection.type;
	return type?.type === 'reference' && type.name === 'ReturnType' && type.typeArguments?.[0]?.type === 'query'
		&& (module.children ?? []).some((child) => child !== reflection && child.name === reflection.name && child.kindOf(ReflectionKind.Variable));
}

/**
 * The call signatures of a function, or of a constant holding one: plugins are `const presentation = definePlugin(…)`,
 * which a declaration file types as `(options?: PresentationOptions) => NormalizedSvartzPlugin`.
 */
function callSignatures(reflection) {
	if (reflection.signatures) return reflection.signatures;
	const declaration = reflection.kindOf(ReflectionKind.Variable) && reflection.type?.type === 'reflection' ? reflection.type.declaration : undefined;
	return declaration?.signatures?.length && !declaration.children?.length ? declaration.signatures : undefined;
}

const kindOf = (reflection) => (callSignatures(reflection) ? 'function' : PAGE_KINDS.get(reflection.kind));

const folderOf = (entry) => [entry.packageName.replace(/^@[^/]+\//, ''), ...(entry.subpath ? [entry.subpath] : [])].join('/');
const importPath = (entry) => (entry.subpath ? `${entry.packageName}/${entry.subpath}` : entry.packageName);

/** One symbol's note: frontmatter in the `symbol` shape, then its remarks and examples as Markdown. */
function symbolNote(reflection, { link, props, url, date }) {
	const kind = kindOf(reflection);
	const signatures = callSignatures(reflection) ?? [];
	const comment = reflection.comment ?? signatures[0]?.comment;
	const summary = summaryOf(comment);
	const [, ...rest] = paragraphs(partsText(comment?.summary, link, true));
	const main = signatures.reduce((best, signature) => ((signature.parameters?.length ?? 0) >= (best?.parameters?.length ?? 0) ? signature : best), undefined);
	const returns = main && returnsOf(main, link);

	const symbol = compact({
		kind,
		name: reflection.name,
		signatures: signatureLines(reflection, link, props),
		typeParameters: (main?.typeParameters ?? reflection.typeParameters ?? []).map((parameter) => typeParameterRow(parameter, link)),
		parameters: (main?.parameters ?? []).map((parameter) => parameterRow(parameter, link)),
		returns,
		throws: (main?.comment ?? comment)?.blockTags.filter((tag) => tag.tag === '@throws').map((tag) => thrown(partsText(tag.content, link, false))),
		extends: (reflection.extendedTypes ?? []).map((type) => typeText(type, link)),
		implements: (reflection.implementedTypes ?? []).map((type) => typeText(type, link)),
		members: props ? props.map(propMember) : members(reflection, link),
		source: url,
		since: tagText(comment, '@since'),
		deprecated: deprecation(comment, link)
	});

	const body = [
		...rest,
		...blocks(comment, '@remarks', link),
		...section('Example', blocks(comment, '@example', link)),
		...section('See also', blocks(comment, '@see', link))
	].join('\n\n');
	return frontmatter({ title: reflection.name, description: summary, updated_at: date?.updated, created_at: date?.created, symbol }) + (body ? `\n${body}\n` : '');
}

/** An entry point's folder note: how to import it, its subpaths, and its symbols by kind. */
function entryNote(entry, { declarations, reexports, children, link, dir, updated }) {
	const lines = [];
	if (children.length > 0) {
		lines.push('', '## Entry points', '');
		for (const child of children) lines.push(`- [[${dir}/${folderOf(child)}/index|${importPath(child)}]]`);
	}
	const groups = Object.entries(KIND_HEADINGS).map(([kind, heading]) => [heading, declarations.filter((reflection) => kindOf(reflection) === kind)]);
	for (const [heading, group] of groups) {
		if (group.length === 0) continue;
		lines.push('', `## ${heading}`, '');
		for (const reflection of [...group].sort((left, right) => left.name.localeCompare(right.name))) {
			const summary = summaryOf(reflection.comment ?? reflection.signatures?.[0]?.comment);
			lines.push(`- [[${link(reflection)}|${reflection.name}]]${summary ? ` — ${summary}` : ''}`);
		}
	}
	if (reexports.length > 0) {
		lines.push('', '## Re-exports', '');
		for (const reflection of reexports) lines.push(`- [[${link(reflection)}|${reflection.name}]]`);
	}
	const description = entry.subpath ? `The \`${importPath(entry)}\` entry point.` : entry.description;
	return frontmatter({ title: importPath(entry), description, updated_at: updated }) + `\n${lines.join('\n').trim()}\n`;
}

function overviewNote(entries, dir) {
	const lines = entries.map((entry) => `- [[${dir}/${folderOf(entry)}/index|${importPath(entry)}]]${!entry.subpath && entry.description ? ` — ${entry.description}` : ''}`);
	return frontmatter({ title: 'API reference', description: 'Every symbol each published Svartz package exports, generated from its types.' })
		+ '\nOne page per exported symbol, by package and entry point. Each page is generated from the package\'s TypeScript types and its doc comments on every build.\n\n'
		+ `${lines.join('\n')}\n`;
}

// --- Signatures and members -------------------------------------------------------------------------------------

function signatureLines(reflection, link, props) {
	const name = reflection.name;
	const typeParameters = typeParametersText(reflection.typeParameters, link);
	switch (kindOf(reflection)) {
		case 'function':
			return callSignatures(reflection).map((signature) => callText(name, signature, link));
		case 'class':
		case 'interface': {
			const keyword = reflection.kindOf(ReflectionKind.Class) ? `${reflection.flags.isAbstract ? 'abstract ' : ''}class` : 'interface';
			const heritage = [
				reflection.extendedTypes?.length ? ` extends ${reflection.extendedTypes.map((type) => typeText(type, link)).join(', ')}` : '',
				reflection.implementedTypes?.length ? ` implements ${reflection.implementedTypes.map((type) => typeText(type, link)).join(', ')}` : ''
			].join('');
			return [`${keyword} ${name}${typeParameters}${heritage}`];
		}
		case 'type':
			return [objectMembers(reflection.type).length > 0 && reflection.type.type === 'reflection'
				? `type ${name}${typeParameters}`
				: `type ${name}${typeParameters} = ${typeText(reflection.type, link)}`];
		case 'enum':
			return [`enum ${name}`];
		case 'variable': {
			const type = typeText(reflection.type, link);
			return [`${reflection.flags.isConst ? 'const' : 'let'} ${name}: ${props ? type.replace(/\$\$ComponentProps/g, 'ComponentProps') : type}`];
		}
		default:
			return [`namespace ${name}`];
	}
}

/** The type's own properties when it is an object type, or an intersection with object parts. */
function objectMembers(type) {
	if (type?.type === 'reflection') return [...(type.declaration.children ?? [])];
	if (type?.type === 'intersection') return type.types.flatMap(objectMembers);
	return [];
}

function members(reflection, link) {
	const children = reflection.kindOf(ReflectionKind.TypeAlias) ? objectMembers(reflection.type) : (reflection.children ?? []);
	const indexes = (reflection.indexSignatures ?? []).map((signature) => ({
		name: `[${signature.parameters?.map((parameter) => `${parameter.name}: ${typeText(parameter.type, link)}`).join(', ')}]`,
		kind: 'property',
		signature: `[${signature.parameters?.map((parameter) => `${parameter.name}: ${typeText(parameter.type, link)}`).join(', ')}]: ${typeText(signature.type, link)}`,
		description: partsText(signature.comment?.summary, link, false) || undefined
	}));
	return [...children.filter((child) => !child.inheritedFrom).flatMap((child) => memberRows(child, reflection, link)), ...indexes].map(compact);
}

function memberRows(child, parent, link, prefix = '') {
	const base = (comment) => {
		const tagged = tagText(comment, '@defaultValue') ?? tagText(comment, '@default');
		return {
			static: child.flags.isStatic || undefined,
			...splitDefault(oneLine(partsText(comment?.summary, link, false)), tagged && `\`${tagged}\``),
			deprecated: deprecation(comment, link)
		};
	};
	const name = propertyName(child.name);
	if (child.kindOf(ReflectionKind.Method)) {
		return (child.signatures ?? []).map((signature) => ({ name: `${prefix}${child.name}`, kind: 'method', signature: callText(`${name}${child.flags.isOptional ? '?' : ''}`, signature, link), ...base(signature.comment ?? child.comment) }));
	}
	if (child.kindOf(ReflectionKind.Constructor)) {
		return (child.signatures ?? []).map((signature) => ({ name: 'constructor', kind: 'constructor', signature: `new ${parent.name}(${parametersText(signature.parameters, link)})`, ...base(signature.comment ?? child.comment) }));
	}
	if (child.kindOf(ReflectionKind.Accessor)) {
		const lines = [
			child.getSignature && `get ${name}(): ${typeText(child.getSignature.type, link)}`,
			child.setSignature && `set ${name}(${parametersText(child.setSignature.parameters, link)})`
		].filter(Boolean);
		return [{ name: child.name, kind: 'accessor', signature: lines.join('\n'), ...base(child.getSignature?.comment ?? child.setSignature?.comment ?? child.comment) }];
	}
	if (child.kindOf(ReflectionKind.EnumMember)) {
		return [{ name: child.name, kind: 'property', signature: `${name} = ${typeText(child.type, link)}`, ...base(child.comment) }];
	}
	const modifiers = `${child.flags.isStatic ? 'static ' : ''}${child.flags.isReadonly ? 'readonly ' : ''}`;
	const declaration = child.type?.type === 'reflection' ? child.type.declaration : undefined;
	// A property whose value is a function reads better as a call: `load(): Promise<void>`.
	const call = declaration?.signatures?.length === 1 && !declaration.children?.length;
	// An inline object's fields (`signIn: { required?: boolean }`) are options too, each listed as `signIn.required`.
	const fields = !call && !declaration?.signatures?.length ? (declaration?.children ?? []) : [];
	const signature = call
		? `${modifiers}${callText(`${name}${child.flags.isOptional ? '?' : ''}`, declaration.signatures[0], link)}`
		: `${modifiers}${name}${child.flags.isOptional ? '?' : ''}: ${fields.length > 0 ? '{ … }' : typeText(child.type, link)}`;
	return [
		{ name: `${prefix}${child.name}`, kind: call ? 'method' : 'property', signature, ...base(child.comment ?? (call ? declaration.signatures[0].comment : undefined)) },
		...fields.flatMap((field) => memberRows(field, parent, link, `${prefix}${child.name}.`))
	];
}

const propMember = (prop) => compact({
	name: prop.name,
	kind: 'property',
	// A nested field's row is named by its path (`discovery.site`), its signature by its own key.
	signature: `${propertyName(prop.key ?? prop.name)}${prop.optional ? '?' : ''}: ${prop.type}`,
	...splitDefault(prop.description ?? '', prop.default && `\`${prop.default}\``)
});

/**
 * Svartz documents a field's default in its description: "Default: `"permission"`.", "Default `"p"`.", "Defaults to the
 * first host vault.". That sentence becomes the member's `default`, unless an `@defaultValue` tag gives one. A default
 * stated mid-sentence ("Default `"folders"`; …") is read but left in the description.
 */
export function splitDefault(description, tagged) {
	const match = DEFAULT_SENTENCE.exec(description);
	if (tagged || !match) return { description: description || undefined, default: tagged || undefined };
	const rest = match[2] === '.' ? `${description.slice(0, match.index)} ${description.slice(match.index + match[0].length)}`.trim() : description;
	return { description: rest || undefined, default: match[1].trim() };
}

const DEFAULT_SENTENCE = /(?<=^|\s)(?:Default:\s+|Default\s+(?=`)|Defaults to\s+)((?:`[^`]*`|[^.;`])+?)([.;])(?=\s|$)/;

function callText(name, signature, link) {
	return `${name}${typeParametersText(signature.typeParameters, link)}(${parametersText(signature.parameters, link)}): ${typeText(signature.type, link)}`;
}

function parametersText(parameters = [], link) {
	return parameters.map((parameter) => `${parameter.flags.isRest ? '...' : ''}${parameterName(parameter)}${parameter.flags.isOptional ? '?' : ''}: ${typeText(parameter.type, link)}`).join(', ');
}

function typeParametersText(parameters, link) {
	if (!parameters?.length) return '';
	return `<${parameters.map((parameter) => `${parameter.name}${parameter.type ? ` extends ${typeText(parameter.type, link)}` : ''}${parameter.default ? ` = ${typeText(parameter.default, link)}` : ''}`).join(', ')}>`;
}

/** Destructured parameters have no name in a declaration file; TypeDoc calls them `__namedParameters`. */
const parameterName = (parameter) => (parameter.name === '__namedParameters' ? 'options' : parameter.name);

const parameterRow = (parameter, link) => compact({
	name: parameterName(parameter),
	type: typeText(parameter.type, link),
	optional: parameter.flags.isOptional || parameter.flags.isRest || undefined,
	default: tagText(parameter.comment, '@defaultValue') ?? tagText(parameter.comment, '@default'),
	description: oneLine(partsText(parameter.comment?.summary, link, false)) || undefined
});

const typeParameterRow = (parameter, link) => compact({
	name: parameter.name,
	constraint: parameter.type ? typeText(parameter.type, link) : undefined,
	default: parameter.default ? typeText(parameter.default, link) : undefined,
	description: oneLine(partsText(parameter.comment?.summary, link, false)) || undefined
});

function returnsOf(signature, link) {
	const type = typeText(signature.type, link);
	const description = oneLine(partsText(signature.comment?.getTag('@returns')?.content, link, false)) || undefined;
	return type === 'void' && !description ? undefined : compact({ type, description });
}

/** `@throws {RangeError} When …` → `{ type: "RangeError", description: "When …" }`. */
function thrown(text) {
	const match = /^\{([^}]+)\}\s*(.*)$/s.exec(text);
	return match ? compact({ type: match[1], description: oneLine(match[2]) || undefined }) : compact({ type: 'Error', description: oneLine(text) || undefined });
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const propertyName = (name) => (IDENTIFIER.test(name) || /^\[.*\]$/.test(name) ? name : JSON.stringify(name));

// --- Types ------------------------------------------------------------------------------------------------------

/**
 * A type as TypeScript source, with each reference to a documented symbol written `[[path|Name]]` so the docs theme
 * links it.
 */
export function typeText(type, link, depth = 0) {
	if (!type) return 'unknown';
	const text = (inner) => typeText(inner, link, depth);
	const wrapped = (inner) => (needsParentheses(inner) ? `(${text(inner)})` : text(inner));
	switch (type.type) {
		case 'intrinsic':
		case 'unknown':
			return type.name;
		case 'literal':
			if (typeof type.value === 'string') return JSON.stringify(type.value);
			if (type.value !== null && typeof type.value === 'object') return `${type.value.negative ? '-' : ''}${type.value.value}n`;
			return String(type.value);
		case 'reference': {
			const target = link(type.reflection);
			const args = type.typeArguments?.length ? `<${type.typeArguments.map(text).join(', ')}>` : '';
			// Bundled declarations name other packages' types through an import alias: `_svartz_core.SvartzTheme`.
			const name = type.name.replace(/^_[\w$]*\./, '');
			return `${target ? `[[${target}|${name}]]` : name}${args}`;
		}
		case 'array':
			return `${wrapped(type.elementType)}[]`;
		case 'union':
			return type.types.map(wrapped).join(' | ');
		case 'intersection':
			return type.types.map(wrapped).join(' & ');
		case 'tuple': {
			const elements = (type.elements ?? []).map(text).join(', ');
			// `[[` would read as a wikilink.
			return elements.startsWith('[') ? `[ ${elements}]` : `[${elements}]`;
		}
		case 'namedTupleMember':
			return `${type.name}${type.isOptional ? '?' : ''}: ${text(type.element)}`;
		case 'optional':
			return `${wrapped(type.elementType)}?`;
		case 'rest':
			return `...${text(type.elementType)}`;
		case 'query':
			return `typeof ${text(type.queryType)}`;
		case 'typeOperator':
			return `${type.operator} ${wrapped(type.target)}`;
		case 'indexedAccess':
			return `${wrapped(type.objectType)}[${text(type.indexType)}]`;
		case 'conditional':
			return `${wrapped(type.checkType)} extends ${text(type.extendsType)} ? ${text(type.trueType)} : ${text(type.falseType)}`;
		case 'inferred':
			return `infer ${type.name}${type.constraint ? ` extends ${text(type.constraint)}` : ''}`;
		case 'predicate':
			return `${type.asserts ? 'asserts ' : ''}${type.name}${type.targetType ? ` is ${text(type.targetType)}` : ''}`;
		case 'templateLiteral':
			return `\`${type.head}${type.tail.map(([inner, literal]) => `\${${text(inner)}}${literal}`).join('')}\``;
		case 'mapped': {
			const readonly = type.readonlyModifier ? `${type.readonlyModifier === '-' ? '-' : ''}readonly ` : '';
			const optional = type.optionalModifier ? `${type.optionalModifier === '-' ? '-' : ''}?` : '';
			const as = type.nameType ? ` as ${text(type.nameType)}` : '';
			return `{ ${readonly}[${type.parameter} in ${text(type.parameterType)}${as}]${optional}: ${text(type.templateType)} }`;
		}
		case 'reflection':
			return reflectionText(type.declaration, link, depth);
		default:
			return type.toString();
	}
}

function needsParentheses(type) {
	if (['union', 'intersection', 'conditional'].includes(type?.type)) return true;
	return type?.type === 'reflection' && Boolean(type.declaration.signatures?.length) && !type.declaration.children?.length;
}

/** An inline object or function type. */
function reflectionText(declaration, link, depth) {
	const signatures = declaration.signatures ?? [];
	const children = declaration.children ?? [];
	const indexes = declaration.indexSignatures ?? [];
	if (signatures.length === 1 && children.length === 0 && indexes.length === 0) {
		const [signature] = signatures;
		const prefix = signature.kindOf(ReflectionKind.ConstructorSignature) ? 'new ' : '';
		return `${prefix}${typeParametersText(signature.typeParameters, link)}(${parametersText(signature.parameters, link, depth + 1)}) => ${typeText(signature.type, link, depth + 1)}`;
	}
	if (signatures.length + children.length + indexes.length === 0) return '{}';
	if (depth >= MAX_OBJECT_DEPTH) return '{ … }';
	const next = (inner) => typeText(inner, link, depth + 1);
	const parts = [
		...signatures.map((signature) => `(${parametersText(signature.parameters, link)}): ${next(signature.type)}`),
		...indexes.map((signature) => `[${signature.parameters?.map((parameter) => `${parameter.name}: ${next(parameter.type)}`).join(', ')}]: ${next(signature.type)}`),
		...children.map((child) => child.signatures?.length
			? child.signatures.map((signature) => `${propertyName(child.name)}${child.flags.isOptional ? '?' : ''}(${parametersText(signature.parameters, link)}): ${next(signature.type)}`).join('; ')
			: `${child.flags.isReadonly ? 'readonly ' : ''}${propertyName(child.name)}${child.flags.isOptional ? '?' : ''}: ${next(child.type)}`)
	];
	return `{ ${parts.join('; ')} }`;
}

// --- Comments ---------------------------------------------------------------------------------------------------

/**
 * Comment display parts as text. `{@link X}` to a documented symbol becomes `[[path|X]]`. In `markdown` mode (the
 * note body) URL links stay Markdown links and stray `<` is escaped; otherwise (frontmatter) both read as plain text.
 * A literal `[[Name]]` in prose is wrapped in backticks, so it reads as the syntax it describes instead of a link.
 */
export function partsText(parts = [], link, markdown) {
	return parts.map((part) => {
		if (part.kind === 'code') return part.text;
		if (part.kind === 'inline-tag' && ['@link', '@linkcode', '@linkplain'].includes(part.tag)) {
			const target = typeof part.target === 'object' ? link(part.target) ?? link(part.target?.parent) : undefined;
			if (target) return `[[${target}|${part.text}]]`;
			if (typeof part.target === 'string') return markdown ? `[${part.text}](${part.target})` : part.text;
			return `\`${part.text}\``;
		}
		const text = part.text.replace(/\[\[([^\]\n]*)\]\]/g, '`[[$1]]`');
		return markdown ? text.replace(/</g, '&lt;') : text.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1');
	}).join('').trim();
}

/**
 * The comment's first paragraph, for a note's `description`. It names symbols in backticks rather than linking them:
 * descriptions also fill meta tags, search results and symbol lists, which show them as plain text.
 */
const summaryOf = (comment) => paragraphs(partsText(comment?.summary, () => undefined, false))[0];
const paragraphs = (text) => (text ? text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean) : []).map((paragraph, index) => (index === 0 ? oneLine(paragraph) : paragraph));
const oneLine = (text) => text.replace(/\s+/g, ' ').trim();
const stripCode = (text) => oneLine(text.replace(/^```\w*\n?|\n?```$/g, '').replace(/^`|`$/g, ''));
const tagText = (comment, tag) => {
	const content = comment?.getTag?.(tag)?.content;
	return content ? stripCode(content.map((part) => part.text).join('')) || undefined : undefined;
};
const deprecation = (comment, link) => {
	const tag = comment?.getTag?.('@deprecated');
	if (!tag) return undefined;
	return oneLine(partsText(tag.content, link, false)) || true;
};
const blocks = (comment, tag, link) => (comment?.blockTags ?? []).filter((item) => item.tag === tag).map((item) => partsText(item.content, link, true)).filter(Boolean);
const section = (heading, content) => (content.length > 0 ? [`## ${heading}`, ...content] : []);

// --- Notes ------------------------------------------------------------------------------------------------------

/** Drops undefined values and empty arrays, so the frontmatter carries only what the symbol has. */
function compact(value) {
	return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && !(Array.isArray(item) && item.length === 0)));
}

/** YAML frontmatter, each value written as JSON, which YAML reads as is. */
function frontmatter(fields) {
	return `---\n${Object.entries(fields).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n`;
}

// --- Sources and dates ------------------------------------------------------------------------------------------

/** A top-level declaration, exported where it stands or by a later `export { name }`. */
const DECLARATION = /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/;

/**
 * Finds where each symbol is declared in its package's `src/`, so a page links to the source rather than the built
 * declaration file. Declarations bundled by tsup keep no trace of their source file, so this searches by name.
 * @param {string} root
 * @param {readonly EntryPoint[]} entries
 * @param {{ repository: string, ref: string }} options
 */
export function sourceLocator(root, entries, { repository, ref }) {
	const packages = [...new Set(entries.map((entry) => entry.packageDir))].sort((left, right) => right.length - left.length);
	const indexes = new Map();
	const index = (packageDir) => {
		if (!indexes.has(packageDir)) indexes.set(packageDir, sourceFiles(root, join(packageDir, 'src')).map((file) => ({ file, lines: readFileSync(join(root, file), 'utf8').split('\n') })));
		return indexes.get(packageDir);
	};
	const located = (file, line) => ({ file, url: `${repository}/blob/${ref}/${file}${line ? `#L${line}` : ''}` });

	return (reflection, entry) => {
		const built = reflection.sources?.[0]?.fullFileName;
		const packageDir = built ? packages.find((dir) => relative(root, built).split(sep).join('/').startsWith(`${dir}/`)) ?? entry.packageDir : entry.packageDir;
		const files = index(packageDir);
		// Where the built file came from, for svelte-package output that keeps the source layout: `dist/x.d.ts` → `src/lib/x.ts`.
		const stem = built ? relative(join(root, packageDir), built).split(sep).join('/').replace(/^(dist|types)\//, '').replace(/\.d\.ts$/, '') : '';
		const sameStem = ({ file }) => file.replace(/^.*?\/src\/(lib\/)?/, '').replace(/\.(ts|js|svelte)$/, '') === stem.replace(/\.(js|svelte)$/, '');

		if (stem.endsWith('.svelte')) {
			const component = files.find(sameStem);
			if (component) return located(component.file);
		}
		const pattern = reflection.name === 'default' ? /^\s*export\s+default\b/ : undefined;
		const matches = files
			.flatMap(({ file, lines }) => lines.flatMap((text, line) => ((pattern ? pattern.test(text) : DECLARATION.exec(text)?.[1] === reflection.name) ? [{ file, line: line + 1, exported: text.startsWith('export') }] : [])))
			.sort((left, right) => Number(right.exported) - Number(left.exported));
		const entryStem = relative(join(root, entry.packageDir), entry.types).split(sep).join('/').replace(/^(dist|types)\//, '').replace(/\.d\.ts$/, '');
		const best = (reflection.name === 'default' ? matches.find(({ file }) => file.replace(/^.*?\/src\/(lib\/)?/, '').replace(/\.(ts|js)$/, '') === entryStem) : matches.find(sameStem)) ?? matches[0];
		return best ? located(best.file, best.line) : undefined;
	};
}

function sourceFiles(root, dir) {
	let entries;
	try {
		entries = readdirSync(join(root, dir), { withFileTypes: true });
	} catch {
		return [];
	}
	return entries.flatMap((entry) => {
		const path = `${dir}/${entry.name}`;
		if (entry.isDirectory()) return entry.name === 'routes' || entry.name === 'node_modules' ? [] : sourceFiles(root, path);
		return /\.(ts|svelte)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
	}).sort();
}

/**
 * Each file's first and last commit dates under `paths`, from one `git log`. A page takes its symbol's source file
 * dates, so "Recently updated" shows when the code changed, not when the docs were built. Outside a git checkout
 * there are no dates.
 */
export function gitDates(root, paths) {
	let log;
	try {
		log = execFileSync('git', ['log', '--format=%x00%cI', '--name-only', '--', ...paths], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
	} catch {
		return () => undefined;
	}
	const dates = new Map();
	for (const commit of log.split('\0').slice(1)) {
		const [date, ...files] = commit.trim().split('\n');
		for (const file of files.filter(Boolean)) {
			const known = dates.get(file);
			dates.set(file, { updated: known?.updated ?? date, created: date });
		}
	}
	return (file) => dates.get(file);
}

/** Replace `outDir` with `notes`. The folder belongs to the generator: anything else in it is removed. */
export function writeNotes(outDir, notes) {
	rmSync(outDir, { recursive: true, force: true });
	for (const note of notes) {
		const path = join(outDir, note.path);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, note.content);
	}
}

/**
 * Generate the reference for every published entry point under `root`.
 * @param {{ root: string, vault: string, dir: string, dirs?: readonly string[], tsconfig?: string }} options
 *   `vault` is the vault's folder, `dir` the reference folder inside it.
 */
export async function generate({ root, vault, dir, dirs, tsconfig = fileURLToPath(new URL('./tsconfig.json', import.meta.url)) }) {
	const entries = readEntryPoints(root, dirs);
	const converted = await convert(entries, { tsconfig });
	const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	const repository = (manifest.repository?.url ?? manifest.repository ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
	const ref = git(root, ['rev-parse', 'HEAD']) ?? 'main';
	const notes = buildNotes(entries, converted, {
		dir,
		source: repository ? sourceLocator(root, entries, { repository, ref }) : undefined,
		dates: gitDates(root, [...new Set(entries.map((entry) => entry.packageDir))])
	});
	writeNotes(resolve(root, vault, dir), notes);
	return { entries, notes };
}

function git(root, args) {
	try {
		return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
	} catch {
		return undefined;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = resolve(fileURLToPath(import.meta.url), '../../..');
	const started = performance.now();
	const { entries, notes } = await generate({ root, vault: 'vaults/docs', dir: 'reference/api' });
	console.log(`API reference: ${notes.length} notes for ${entries.length} entry points in ${Math.round(performance.now() - started)} ms.`);
}

import type { Result } from './extra';

/** How {@link plugin} behaves. */
export interface Options {
	/** The key that starts it. Default: `"p"`. */
	readonly key?: string;
	/**
	 * How often it runs.
	 * @defaultValue 3
	 */
	readonly times?: number;
	/** Sign-in settings. */
	readonly signIn?: {
		/** Refuse anonymous readers. Default: `false`. */
		readonly required?: boolean;
	};
}

/** Runs the plugin. */
export declare const plugin: (options?: Options) => Result;

/** Reads theme settings. */
export declare function themeSettings(value: unknown): ThemeSettings;

/** Theme settings. */
export interface ThemeSettings {
	readonly accent: string;
}

/** Every field read-only, as a schema library derives a type from its schema. Kept private by `export {}` below. */
type Derive<T> = { readonly [K in keyof T]: T[K] };
export {};

/** The site settings, derived from their schema. */
export type SiteSettings = Derive<{
	/** The site's title. Default: `"Untitled"`. */
	title?: string;
	/** Where it publishes. */
	url: string;
	/** Anything a plugin wants. */
	extra?: unknown;
	/** Link previews. */
	social?: {
		/** The preview image. */
		image?: string | null;
	};
	/** A named type keeps its link. */
	theme?: ThemeSettings;
	/** Extra keys keep their index signature. */
	meta?: { readonly [key: string]: string };
	/** `null` keeps its place beside the object. */
	preview?: { image: string } | null;
}>;

/** Named like the `extra` entry point's folder. */
export declare const extra: number;

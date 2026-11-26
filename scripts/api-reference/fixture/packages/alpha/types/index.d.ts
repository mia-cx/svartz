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

/** Named like the `extra` entry point's folder. */
export declare const extra: number;

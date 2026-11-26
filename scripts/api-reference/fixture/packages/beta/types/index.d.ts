import type { Options as AlphaOptions } from '@fixture/alpha';

/** Beta's config. */
export interface BetaConfig extends AlphaOptions {
	readonly label: string;
}

/** Beta's own options, named like alpha's. */
export interface Options {
	readonly verbose?: boolean;
}

/** Every field read-only, as a schema library derives a type from its schema. Kept private by `export {}` below. */
type Derive<T> = { readonly [K in keyof T]: T[K] };

/** Settings that embed alpha's options, not beta's. */
export type BetaSettings = Derive<{
	/** Alpha's options. */
	alpha?: AlphaOptions;
	/** Required, yet it may be `undefined`. */
	required: { enabled: boolean } | undefined;
}>;
export {};

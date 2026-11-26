import type { Options } from './options';

export const plugin = (options: Options = {}) => ({ id: options.key ?? 'p' });

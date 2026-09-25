import { describe, expect, it } from 'vitest';
import createMinimalTheme from './runtime';

describe('@svartz/theme-minimal runtime modules', () => {
	it('exposes eager layout, route, and shared component modules for SSR', () => {
		const theme = createMinimalTheme();

		for (const layout of Object.values(theme.layouts)) {
			if (!layout) continue;
			expect(typeof layout).toBe('object');
			expect(layout).toHaveProperty('default');
		}

		for (const route of theme.routes) {
			if (!route.component) continue;
			expect(typeof route.component).toBe('object');
			expect(route.component).toHaveProperty('default');
		}

		for (const component of Object.values(theme.components ?? {})) {
			if (!component) continue;
			expect(typeof component).toBe('object');
			expect(component).toHaveProperty('default');
		}
	});
});

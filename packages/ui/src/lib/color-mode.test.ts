import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { COLOR_MODE_SCRIPT, COLOR_MODE_SCRIPT_HASH } from './color-mode.js';

describe('COLOR_MODE_SCRIPT_HASH', () => {
	it('is the CSP hash of the inline script', () => {
		const digest = createHash('sha256').update(COLOR_MODE_SCRIPT).digest('base64');
		expect(COLOR_MODE_SCRIPT_HASH).toBe(`'sha256-${digest}'`);
	});
});

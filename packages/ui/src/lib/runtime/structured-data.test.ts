import { describe, expect, it } from 'vitest';
import { jsonLdScript } from './structured-data.js';

describe('jsonLdScript', () => {
	it('keeps note text from closing the script tag', () => {
		const script = jsonLdScript([{ '@type': 'Article', headline: '</script><script>alert(1)</script>' }]);

		expect(script.match(/<\/script>/g)).toHaveLength(1);
		expect(script).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
	});
});

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Builds theme-only Tailwind CSS into dist/styles.css.
 * Run after prepack so dist/ exists; output is copied into dist by the build:theme-css script.
 */
export default defineConfig({
	plugins: [tailwindcss()],
	build: {
		outDir: 'dist-theme-css',
		emptyOutDir: true,
		lib: {
			entry: 'src/lib/theme-css-entry.js',
			formats: ['es'],
			fileName: () => 'theme-css-placeholder.js'
		},
		rollupOptions: {
			output: {
				assetFileNames: 'styles.css'
			}
		},
		// No need to emit the placeholder JS to dist
		manifest: false
	}
});

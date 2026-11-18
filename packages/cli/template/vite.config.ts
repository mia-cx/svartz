import adapter from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { mdsvex } from 'mdsvex';
import { fileURLToPath } from 'node:url';
import { withSvartzHost } from '@svartz/vite/host';
import { defineConfig } from 'vite';

const outDir = process.env.SVARTZ_OUT_DIR ?? 'build';

export default withSvartzHost(defineConfig({
  resolve: {
    alias: {
      'virtual:svartz/tailwind-sources.css': process.env.SVARTZ_TAILWIND_SOURCES_PATH
        ?? fileURLToPath(new URL('./src/tailwind-sources.css', import.meta.url))
    }
  },
  plugins: [
    tailwindcss(),
    sveltekit({
      extensions: ['.svelte', '.svx'],
      preprocess: [mdsvex()],
      adapter: adapter({ pages: outDir, assets: outDir, fallback: '404.html', strict: true }),
      paths: { base: process.env.SVARTZ_BASE_PATH ?? '' }
    })
  ]
}));

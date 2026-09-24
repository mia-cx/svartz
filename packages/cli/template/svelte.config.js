import adapter from '@sveltejs/adapter-static';
import { mdsvex } from 'mdsvex';

/** @type {import('@sveltejs/kit').Config} */
export default {
  extensions: ['.svelte', '.svx'],
  preprocess: [mdsvex()],
  kit: {
    adapter: adapter({
      pages: process.env.SVARTZ_OUT_DIR ?? 'build',
      assets: process.env.SVARTZ_OUT_DIR ?? 'build',
      fallback: '404.html',
      strict: true
    }),
    paths: { base: process.env.SVARTZ_BASE_PATH ?? '' }
  }
};

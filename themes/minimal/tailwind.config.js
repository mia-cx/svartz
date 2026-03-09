/** Used by theme build (dist/styles.css) and by consumers who merge this with Svartz theme config. */
export default {
  content: [
    "./src/lib/**/*.{svelte,ts}",
    "./node_modules/@svartz/ui/src/lib/**/*.svelte",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

# Theme resolution for v1

`@svartz/config` defaults to `@svartz/theme-minimal`. An explicit `theme` can name an installed npm package, a `./` or `../` path relative to `svartz.config.ts`, or an absolute path. Config resolution turns relative paths into absolute paths. It preserves npm names and absolute paths.

`@svartz/vite` owns theme entry and package-root lookup. It resolves npm names from the host SvelteKit app root and loads the theme manifest for build and dev. An invalid explicit theme fails with its name and resolution directory; it never silently falls back. The built-in minimal theme uses its runtime entry for SSR.

The CLI reuses Vite's package-root lookup for Tailwind sources, dev watch paths, and source aliases. Local workspace themes rebuild by their package name when their source changes. An absolute theme outside the workspace restarts dev when its files change; its own package build remains the author's responsibility. Installed npm themes are not watched as source packages. The CLI allows an external absolute theme root through Vite's dev file-server boundary.

Theme management commands and a community theme browser are post-v1 work. Implementation checks are in `planning/implementation/22-theme-resolution.md`.

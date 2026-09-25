# Social images and favicons

Svartz creates a PNG preview for each published note when `site.url` exists and the theme supplies `socialImage`. The theme function receives only the note title, description, and site title. It returns a complete SVG document; Svartz rasterizes it to a 1200 × 630 PNG during the build. Protected notes use the configured site image instead of a generated preview. No unpublished note produces an image.

An authored note can set `socialImage`, `image`, or `cover` in frontmatter. The first nonempty value wins. Use an HTTP(S) URL, a host-root path, or a note-relative attachment. Svartz retains referenced attachments from published notes and fails the build when a note-relative image is missing or excluded. `site.image` is the fallback when generation is disabled, the theme has no template, or a note is protected.

```ts
{
  site: {
    title: 'Journal',
    url: 'https://example.com',
    image: '/fallback.png',
    favicon: './static/icon.webp'
  },
  discovery: {
    socialImages: { enabled: true },
    favicon: { enabled: true }
  }
}
```

`site.favicon` is a local path relative to `svartz.config.ts`. Supported inputs are SVG, PNG, JPEG (`.jpg` or `.jpeg`), WebP, and ICO. The build decodes the source and emits a 32-pixel PNG and a 180-pixel touch icon. SVG input also emits the original scalable SVG; ICO input also emits the original ICO. The first-party theme supplies an SVG default when no source is set.

Standalone vaults enable favicon generation by default. Existing SvelteKit hosts keep their own icon until `discovery.favicon.enabled` is `true`. Generated files live beneath each vault's mount in `__svartz/`, so separate vaults do not overwrite one another. Rebuilding after deletion, unpublishing, or disabling generation removes obsolete Svartz-owned files. The runtime links the generated icon and note preview when `site.url` is configured. Without a public URL, it uses an inlined favicon; social preview generation defaults off, and explicitly enabling it for production requires `site.url`.

Themes can implement `SvartzTheme.socialImage(metadata)` and `SvartzTheme.faviconSvg`. The first is a build-time SVG template, not a Svelte component. `faviconSvg` is the default image used only when the vault does not configure `site.favicon`. Neither hook receives note body content. See [vault routes](routes.md) for mount and host ownership rules.

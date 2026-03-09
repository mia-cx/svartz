# @svartz/theme-minimal

Quartz-like starter theme for Svartz static vault sites.

## Theme styles (Tailwind)

The theme ships **prebuilt CSS** containing only the Tailwind utilities used by the theme and its UI components. Consumers do not need to add the theme to Tailwind’s `content`; import the styles once:

```js
// In your app’s root layout or entry (e.g. +layout.svelte or app.css)
import '@svartz/theme-minimal/styles.css';
```

The file `dist/styles.css` is built at prepack time from `src/lib/theme.css` and **`tailwind.config.js`**. Content paths and `theme.extend` live in that config so Svartz/vault config (e.g. `defaults.theme.colors`) can be merged with the same shape. The theme CSS uses `@config "../../tailwind.config.js"`; plugins (forms, typography) stay in the CSS file.

**Content and recursive deps:** `svelte-package` does not flatten the bundle — `dist/` keeps `import('@svartz/ui')`, so Tailwind would not see UI class names if we only scanned `dist/`. The config therefore lists both `./src/lib/**` and `./node_modules/@svartz/ui/src/lib/**`. To avoid listing deps you’d need a separate build step that bundles theme + dependencies into a single (flat) file and then run Tailwind with `content` pointing only at that file; that’s not the default.

---

*Below: default Svelte library template.*

# Svelte library

Everything you need to build a Svelte library, powered by [`sv`](https://npmjs.com/package/sv).

Read more about creating a library [in the docs](https://svelte.dev/docs/kit/packaging).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@0.12.5 create --template library --types ts --add prettier eslint vitest="usages:unit,component" tailwindcss="plugins:typography,forms" paraglide="languageTags:en, nl+demo:no" --install pnpm minimal
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

Everything inside `src/lib` is part of your library, everything inside `src/routes` can be used as a showcase or preview app.

## Building

To build your library:

```sh
npm pack
```

To create a production version of your showcase app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Publishing

Go into the `package.json` and give your package the desired name through the `"name"` option. Also consider adding a `"license"` field and point it to a `LICENSE` file which you can create from a template (one popular option is the [MIT license](https://opensource.org/license/mit/)).

To publish your library to [npm](https://www.npmjs.com):

```sh
npm publish
```

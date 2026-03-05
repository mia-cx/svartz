# How to Create a Theme

Step-by-step guide to authoring a custom Svartz theme.

## Prerequisites

- Familiarity with [[contracts/theme-contract]]
- Svelte knowledge (components)
- Tailwind CSS (optional, for styling)
- Understanding of SvelteKit route patterns

---

## Step 1: Understand Theme Requirements

A minimal theme must have:

1. **Unique ID** — e.g., `@myorg/theme-custom`
2. **Version** — Semver (e.g., `1.0.0`)
3. **Contract Version** — Must match core (currently `1.0.0`)
4. **Layouts** — At minimum: `defaultPage`, `notePage`
5. **Routes** — At minimum: one route with `id: "note"` and `:slug` pattern
6. **Svelte Components** — The actual layout components

---

## Step 2: Create Project Structure

```
@myorg/theme-custom/
├── src/
│   ├── index.ts              # Theme export
│   ├── layouts/
│   │   ├── Default.svelte    # defaultPage layout
│   │   └── Note.svelte       # notePage layout
│   ├── components/           # Optional: shared components
│   │   ├── Header.svelte
│   │   └── Footer.svelte
│   └── styles/
│       └── index.css         # Global styles (Tailwind, etc.)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── svelte.config.js
└── README.md
```

---

## Step 3: Set Up Package Metadata

Create `package.json`:

```json
{
  "name": "@myorg/theme-custom",
  "version": "1.0.0",
  "description": "Custom theme for Svartz",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "vite build",
    "dev": "vite"
  },
  "dependencies": {
    "@svartz/core": "workspace:^"
  },
  "devDependencies": {
    "svelte": "^5.0.0",
    "vite": "^5.0.0",
    "@sveltejs/vite-plugin-svelte": "^3.0.0",
    "tailwindcss": "^3.0.0"
  }
}
```

---

## Step 4: Create Layout Components

### Default Layout (defaultPage)

```svelte
<!-- src/layouts/Default.svelte -->
<script>
  import Header from "../components/Header.svelte";
  import Footer from "../components/Footer.svelte";
</script>

<div class="default-layout">
  <Header />
  
  <main class="content">
    <slot />
  </main>
  
  <Footer />
</div>

<style>
  .default-layout {
    display: grid;
    grid-template-rows: auto 1fr auto;
    min-height: 100vh;
  }
  
  .content {
    padding: 2rem;
  }
</style>
```

### Note Layout (notePage)

```svelte
<!-- src/layouts/Note.svelte -->
<script>
  import Header from "../components/Header.svelte";
  import Sidebar from "../components/Sidebar.svelte";
  import Footer from "../components/Footer.svelte";
</script>

<div class="note-layout">
  <Header />
  
  <div class="note-container">
    <main class="note-content">
      <slot />
    </main>
    
    <aside class="note-sidebar">
      <Sidebar />
    </aside>
  </div>
  
  <Footer />
</div>

<style>
  .note-layout {
    display: grid;
    grid-template-rows: auto 1fr auto;
    min-height: 100vh;
  }
  
  .note-container {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 2rem;
    padding: 2rem;
  }
  
  @media (max-width: 768px) {
    .note-container {
      grid-template-columns: 1fr;
    }
  }
</style>
```

---

## Step 5: Create Theme Entry Point

```typescript
// src/index.ts
import { defineTheme } from "@svartz/core";
import DefaultLayout from "./layouts/Default.svelte";
import NoteLayout from "./layouts/Note.svelte";

export default defineTheme({
  id: "@myorg/theme-custom",
  version: "1.0.0",
  contractVersion: "1.0.0",
  
  displayName: "My Custom Theme",
  description: "A beautiful, minimal theme for Svartz",
  
  // Required: layouts
  layouts: {
    defaultPage: { default: DefaultLayout },
    notePage: { default: NoteLayout }
  },
  
  // Required: routes
  routes: [
    {
      id: "note",
      pattern: "/[...slug]",
      layoutSlot: "notePage"
    },
    {
      id: "index",
      pattern: "/",
      layoutSlot: "defaultPage"
    }
  ],
  
  // Optional: component overrides
  componentRegistry: {
    backlinks: { default: BacklinksComponent },
    toc: { default: TocComponent }
  },
  
  // Optional: declare what artifacts you need
  artifactRequirements: {
    index: true,
    graph: false,
    backlinks: true
  },
  
  // Optional: declare rendering capabilities
  renderCapabilities: {
    wikilinks: true,
    codeBlocks: true,
    syntaxHighlighting: true,
    math: true,
    callouts: true
  }
});
```

---

## Step 6: Add Optional Styling

### Tailwind Setup

```typescript
// tailwind.config.js
export default {
  content: ["./src/**/*.{svelte,ts}"],
  theme: {
    extend: {
      colors: {
        primary: "#0066cc",
        secondary: "#666"
      }
    }
  }
};
```

```css
/* src/styles/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-primary: #0066cc;
  --color-secondary: #666;
  --color-bg: #fff;
  --color-text: #000;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--color-text);
  background-color: var(--color-bg);
}
```

---

## Step 7: Add JSDoc to Theme

```typescript
/**
 * Custom theme for Svartz vaults.
 *
 * @description
 * A beautiful, minimal theme featuring:
 * - Responsive grid layouts
 * - Dark/light mode support
 * - Syntax-highlighted code blocks
 * - Full wikilink support
 *
 * @example
 * ```ts
 * import theme from "@myorg/theme-custom";
 * export default theme;
 *
 * // In svartz.config.ts:
 * defaults: {
 *   theme: "@myorg/theme-custom"
 * }
 * ```
 *
 * @returns SvartzTheme factory
 * @throws ThemeValidationError if validation fails
 * @see [[contracts/theme-contract]] for theme contract
 */
export default defineTheme({
  // ...
});
```

---

## Step 8: Use Factory Pattern for Configurable Themes

If your theme needs user configuration:

```typescript
import { defineTheme } from "@svartz/core";

interface ThemeOptions {
  colorScheme?: "light" | "dark" | "auto";
  sidebarPosition?: "right" | "left";
  fontFamily?: string;
}

export default defineTheme<ThemeOptions>(
  (opts = {}) => {
    const {
      colorScheme = "auto",
      sidebarPosition = "right",
      fontFamily = "system"
    } = opts;

    return {
      id: "@myorg/theme-custom",
      version: "1.0.0",
      contractVersion: "1.0.0",
      
      displayName: "My Custom Theme",
      
      layouts: {
        defaultPage: { default: DefaultLayout },
        notePage: { default: NoteLayout }
      },
      
      routes: [
        {
          id: "note",
          pattern: "/[...slug]",
          layoutSlot: "notePage",
          meta: { colorScheme, sidebarPosition, fontFamily }
        }
      ]
    };
  }
);
```

Users can then configure per-vault:

```typescript
// svartz.config.ts
vaults: {
  docs: {
    path: "./docs",
    theme: {
      base: "@myorg/theme-custom",
      colorScheme: "dark",
      fontFamily: "Georgia, serif"
    }
  }
}
```

---

## Step 9: Add Optional Plugin Preset

Bundle plugins with your theme:

```typescript
import { discoverFiles, filterUnpublished } from "@svartz/plugins";

export default defineTheme({
  id: "@myorg/theme-custom",
  // ... other fields ...
  
  pluginPreset: {
    plugins: [
      // Ensure these run even if user removes core plugins
      discoverFiles(),
      filterUnpublished()
    ]
  }
});
```

---

## Step 10: Test Your Theme

### Manual Testing

1. **Create test vault:**
   ```bash
   mkdir test-vault
   echo "# Test Note\nWikilink: [[another]]" > test-vault/test.md
   ```

2. **Add to config:**
   ```typescript
   vaults: {
     test: {
       path: "./test-vault",
       theme: require("./src/index.ts").default
     }
   }
   ```

3. **Build and preview:**
   ```bash
   npm run build
   npm run dev
   ```

### Validation

```typescript
import { defineTheme } from "@svartz/core";
import theme from "./src/index";

try {
  const factory = defineTheme(/* your theme */);
  const validated = factory();
  console.log("✓ Theme is valid");
} catch (err) {
  console.error("✗ Theme validation failed:", err.message);
}
```

---

## Publishing to npm

```bash
# Build
npm run build

# Publish
npm publish --access public

# Users can then install:
# pnpm i @myorg/theme-custom
```

Then use in config:

```typescript
defaults: {
  theme: "@myorg/theme-custom"
}
```

---

## Best Practices

✅ **DO:**
- Use semantic versioning (1.0.0, 1.1.0, 2.0.0)
- Include both `defaultPage` and `notePage` layouts
- Document with JSDoc and README
- Support responsive design (mobile, tablet, desktop)
- Use Tailwind or CSS variables for theming
- Provide light/dark mode support
- Test with real vault content

❌ **DON'T:**
- Skip the `:slug` route pattern (breaks note rendering)
- Hard-code file paths (use relative imports)
- Assume specific frontmatter fields (get from config)
- Forget `contractVersion` (causes validation errors)
- Create overly complex components (keep them composable)

---

## Troubleshooting

### Theme Won't Load
- Check `contractVersion` major version matches core
- Verify `id`, `version`, `contractVersion` are present
- Test with `defineTheme()` directly

### Layouts Not Applied
- Ensure layout component is properly exported
- Check route `layoutSlot` matches layout key
- Verify `pattern` is valid SvelteKit route syntax

### Styling Not Working
- Ensure CSS is imported in component
- Check Tailwind/PostCSS is configured
- Test with inline styles first

---

## See Also

- [[contracts/theme-contract]] — Full theme specification
- [[reference/quick-reference#Custom Theme]] — Code examples
- [[guides/create-plugin]] — How to create plugins for themes

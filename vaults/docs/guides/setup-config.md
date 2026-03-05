# How to Set Up and Configure Svartz

Complete setup guide from zero to fully configured Svartz project.

## Prerequisites

- Node.js 18+ and pnpm
- Familiarity with `svartz.config.ts` ([[contracts/config-contract]])
- Basic knowledge of glob patterns and YAML frontmatter

---

## Step 1: Initialize Your Project

### Option A: From Scratch

```bash
# Create project directory
mkdir my-svartz-site && cd my-svartz-site

# Initialize pnpm workspace
pnpm init
echo "packages:
  - 'vaults/*'" > pnpm-workspace.yaml

# Create vaults directory
mkdir vaults
```

### Option B: Clone Existing

```bash
git clone git@github.com:user/my-svartz-site.git
cd my-svartz-site
pnpm install
```

---

## Step 2: Install Core Dependencies

```bash
# Install Svartz packages
pnpm i @svartz/core @svartz/config @svartz/plugins

# Install Svelte/SvelteKit for app
pnpm i -D svelte @sveltejs/kit vite

# Install theme
pnpm i @svartz/theme-minimal
```

---

## Step 3: Create Vaults

### Create a Vault Directory

```bash
mkdir vaults/docs
```

Add some markdown files:

```bash
cat > vaults/docs/index.md << 'EOF'
---
title: Home
published: true
---

# Welcome to My Vault

This is the main entry point.
EOF

cat > vaults/docs/getting-started.md << 'EOF'
---
title: Getting Started
published: true
---

# Getting Started

Here's how to use this vault.
EOF
```

---

## Step 4: Create Configuration File

Create `svartz.config.ts` in project root:

```typescript
// svartz.config.ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",

  // Default settings applied to all vaults
  defaults: {
    vault: {
      // File patterns to include/exclude
      include: ["**/*.md"],
      exclude: ["node_modules/**", ".git/**", "_draft/**"],
      
      // Frontmatter field mapping
      frontmatterFields: {
        titleField: "title",
        descriptionField: "description",
        tagsField: "tags",
        aliasesField: "aliases",
        createdAtField: "createdAt",
        updatedAtField: "updatedAt",
        publishedField: "published"
      }
    },
    
    // Default theme for all vaults
    theme: "@svartz/theme-minimal",
    
    // Plugins run in all vaults (optional)
    plugins: []
  },

  // Define one or more vaults
  vaults: {
    // Vault key: "docs"
    docs: {
      // Path relative to config file (can be absolute too)
      path: "./vaults/docs",
      
      // Optional: override defaults for this vault
      theme: "@svartz/theme-minimal",
      
      // Optional: vault-specific plugins
      plugins: []
    },

    // Another vault: "wiki"
    wiki: {
      path: "./vaults/wiki",
      
      // Optional: different theme
      theme: {
        base: "@svartz/theme-minimal",
        // Optional: Tailwind customization
        tailwind: {
          extend: {
            colors: {
              primary: "#0066cc"
            }
          }
        }
      }
    }
  }
});
```

---

## Step 5: Frontmatter Semantics

### What's a "Draft"?

A file is considered **draft** if:
- The `publishedField` (default: `"published"`) is missing, OR
- The field value is **falsy**: `false`, `null`, `undefined`, `""`

```yaml
---
title: Published Note
published: true
---
# This file will be published

---
title: Draft Note
published: false
---
# This file will be filtered out

---
title: Another Draft
---
# No 'published' field → draft (filtered out)
```

### Standard Fields

| Field | Example | Purpose |
| --- | --- | --- |
| `title` | `"My Note"` | Note title (required for good UX) |
| `description` | `"A brief summary"` | Used in previews and search |
| `tags` | `["learning", "svartz"]` | Taxonomy for filtering |
| `aliases` | `["alternate-name"]` | Alternative wikilink targets |
| `createdAt` | `"2024-01-15"` | Creation date (ISO format preferred) |
| `updatedAt` | `"2024-01-20"` | Last modified date |
| `published` | `true` or omitted | Publication status |

---

## Step 6: Vault-Specific Overrides

### Per-Vault Include/Exclude

```typescript
vaults: {
  docs: {
    path: "./vaults/docs",
    // Override include/exclude for this vault only
    include: ["**/*.md", "**/*.mdx"],  // Also include .mdx files
    exclude: ["node_modules/**", ".git/**", "_draft/**", "node_modules/**"]
  }
}
```

### Per-Vault Frontmatter Fields

```typescript
vaults: {
  docs: {
    path: "./vaults/docs",
    frontmatterFields: {
      // Custom field names for this vault
      titleField: "heading",         // Look for 'heading' instead of 'title'
      publishedField: "draft",       // 'draft: true' means unpublished
      createdAtField: "dateCreated"
    }
  }
}
```

### Per-Vault Plugins

```typescript
import { myCustomPlugin } from "./plugins/custom";

vaults: {
  docs: {
    path: "./vaults/docs",
    plugins: [myCustomPlugin()]     // Only this vault gets the plugin
  }
}
```

---

## Step 7: Target Configuration (Optional)

Specify where to deploy/build output:

```typescript
defaults: {
  vault: {
    target: {
      type: "static",               // Output static files
      outDir: "./dist",             // Output directory
      basePath: "/"                 // Base URL path
    }
  }
}

// Or per-vault:
vaults: {
  docs: {
    path: "./vaults/docs",
    target: {
      type: "pages",                // Cloudflare Pages
      projectName: "my-docs-site"
    }
  }
}
```

**Target types:**
- `static` — Static file output (default)
- `pages` — Cloudflare Pages
- `worker` — Cloudflare Workers
- `node` — Node.js server

---

## Step 8: Validate Your Config

```bash
# In your project
npx ts-node -e "
import { loadAndResolveConfig } from '@svartz/config';

try {
  const config = await loadAndResolveConfig('./svartz.config.ts');
  console.log('✓ Config is valid');
  console.log('Vaults:', config.vaults.map(v => v.path));
} catch (err) {
  console.error('✗ Config error:', err.message);
}
"
```

---

## Step 9: Integrate with Build Tool (Vite/SvelteKit)

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { svartzPlugin } from "@svartz/vite-plugin";

export default defineConfig({
  plugins: [
    svartzPlugin({
      configPath: "./svartz.config.ts",
      vaultId: "docs"  // Which vault to build
    }),
    sveltekit()
  ]
});
```

---

## Step 10: Run Your Site

```bash
# Development
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

---

## Common Patterns

### Multi-Vault Setup

```typescript
vaults: {
  docs: {
    path: "./vaults/docs",
    theme: "@svartz/theme-minimal",
    target: { type: "pages", projectName: "docs-site" }
  },
  
  wiki: {
    path: "./vaults/wiki",
    theme: "@svartz/theme-wiki",
    target: { type: "pages", projectName: "wiki-site" }
  },
  
  blog: {
    path: "./vaults/blog",
    theme: "@svartz/theme-blog",
    target: { type: "static", outDir: "./dist/blog" }
  }
}
```

### Shared Plugins Across Vaults

```typescript
import { myTransformer } from "./plugins/my-transformer";

defaults: {
  plugins: [myTransformer()]  // All vaults get this
}

vaults: {
  docs: {
    path: "./vaults/docs",
    plugins: [myTransformer()]  // Explicitly included per vault too
  }
}
```

### Environment-Specific Config

```typescript
const isDev = process.env.NODE_ENV === "development";

export default defineConfig({
  version: "1.0.0",
  
  defaults: {
    vault: {
      include: isDev ? ["**/*.md", "**/_draft/**"] : ["**/*.md"],
      frontmatterFields: {
        publishedField: isDev ? "draft" : "published"
      }
    },
    theme: isDev ? "@svartz/theme-dev" : "@svartz/theme-prod"
  },
  
  vaults: { /* ... */ }
});
```

---

## Troubleshooting

### "Config validation failed"

Check your YAML syntax in frontmatter. Use an online YAML validator if unsure.

```yaml
# ✓ Correct
---
tags: ["one", "two"]
published: true
---

# ✗ Wrong (missing quotes)
---
tags: [one, two]
published: yes
---
```

### Files Not Discovered

- Check `include` patterns match your files
- Verify `exclude` patterns don't hide your files
- Check `.gitignore` — files ignored by git are skipped
- Ensure vault path is correct (relative to config file)

### Draft Files Being Published

- Check `publishedField` name matches your frontmatter
- Remember: missing field or falsy value = draft
- Use consistent casing: `published` not `Published`

### Theme Not Loading

- Verify theme is installed: `pnpm list @svartz/theme-minimal`
- Check theme name is correct (with namespace)
- Ensure `contractVersion` in theme matches core

---

## See Also

- [[contracts/config-contract]] — Full config specification
- [[guides/create-plugin]] — How to write custom plugins
- [[guides/create-theme]] — How to create custom themes
- [[reference/quick-reference#Config System]] — Code examples

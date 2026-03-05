# How to Create a Plugin

Step-by-step guide to authoring a custom Svartz plugin.

## Prerequisites

- Familiarity with [[contracts/plugin-contract]]
- Know which stage your plugin targets ([[plugins/plugins-overview#Stages Breakdown]])
- Understand the plugin lifecycle (see [[reference/IMPLEMENTATION-SUMMARY#Plugin Lifecycle]])

---

## Step 1: Choose Your Stage

Each plugin hooks into one or more stages. Determine where your logic fits:

| Stage | Purpose | Example Plugins |
| --- | --- | --- |
| `discover` | Traverse vault, parse frontmatter | `discoverFiles` |
| `filterUnpublished` | Remove drafts | `filterUnpublished` |
| `transformContent` | Modify markdown | `transformGfm`, `transformLatex` |
| `indexContent` | Build metadata/index | `transformDescription`, `indexContent` |
| `resolveLinks` | Resolve wikilinks | `resolveLinks` (stub) |
| `emit` | Write artifacts | `emitArtifacts` |
| `handleChange` | Hot reload (dev) | Custom watchers |

**Example:** To add custom syntax highlighting, target `transformContent`.

---

## Step 2: Define Your Plugin Structure

Use `definePlugin()` factory:

```typescript
import { definePlugin, type SvartzPlugin } from "@svartz/core";

export const myCustomPlugin = definePlugin(() => ({
  id: "custom:my-plugin",       // Unique ID (namespace:name)
  transformContent: (ctx) => {   // Hook (shorthand form)
    // Implementation
  }
}));
```

**Key fields:**
- `id` — Unique identifier (use your namespace to avoid collisions)
- `disabled` — Optional flag to disable the plugin
- `contractVersion` — Optional, for compatibility checks
- Hook names correspond to stages

---

## Step 3: Implement the Hook (Shorthand or Full Form)

### Option A: Shorthand (Simple Synchronous)

```typescript
export const myPlugin = definePlugin(() => ({
  id: "custom:my-plugin",
  transformContent: (ctx) => {
    ctx.files.forEach(file => {
      file.content = processMarkdown(file.content);
    });
  }
}));
```

**Use when:**
- Hook is synchronous
- Default options (`fatal: false`, `enforce: "default"`, `parallel: true`) work for you

---

### Option B: Full Form (Async or Custom Options)

```typescript
export const myPlugin = definePlugin(() => ({
  id: "custom:my-plugin",
  transformContent: {
    run: async (ctx) => {
      for (const file of ctx.files) {
        file.content = await processMarkdownAsync(file.content);
      }
    },
    options: {
      fatal: false,           // Errors are non-fatal (continue pipeline)
      enforce: "post",        // Run after default transformers
      parallel: false         // Run sequentially (not in parallel)
    }
  }
}));
```

**Options breakdown:**
- `fatal` — If `true`, throw in this hook stops the pipeline immediately
- `enforce` — `"pre"` (run first), `"post"` (run last), or undefined (default, can run parallel)
- `parallel` — If `true`, run alongside other `default` hooks; if `false`, run sequentially

---

## Step 4: Access Plugin Context

Inside your hook, receive `ctx: PluginContext`:

```typescript
interface PluginContext {
  readonly stage: string;                    // Current stage name
  readonly files: ProcessedFile[];           // Files being processed
  readonly config: ResolvedSvartzConfig;     // Full resolved config
  readonly vaultConfig: ResolvedVaultConfig; // Current vault settings
}

interface ProcessedFile {
  readonly path: string;                  // Relative path from vault root
  readonly slug: string;                  // Canonical slug
  readonly content: string;               // Markdown content (mutable)
  readonly frontmatter: Record<string, any>; // YAML frontmatter (mutable)
  readonly published: boolean;            // Draft status
  readonly createdAt?: string;            // ISO timestamp
  readonly updatedAt?: string;            // ISO timestamp
  readonly description?: string;          // Summary (if extracted)
  readonly links?: RawLink[];             // Wikilinks (if parsed)
}
```

**Mutation:** You can mutate files and their properties directly.

---

## Step 5: Example: Transform Plugin

Let's build a plugin that converts Obsidian callouts to HTML:

```typescript
import { definePlugin } from "@svartz/core";

/**
 * Transform Obsidian callouts to custom HTML.
 *
 * @description
 * Converts:
 *   > [!note] Title
 *   > Content here
 *
 * To:
 *   <div class="callout callout-note">
 *     <div class="callout-title">Title</div>
 *     <div class="callout-content">Content here</div>
 *   </div>
 */
export const obsidianCallouts = definePlugin(() => ({
  id: "custom:obsidian-callouts",
  
  transformContent: {
    run: (ctx) => {
      ctx.files.forEach(file => {
        file.content = transformCallouts(file.content);
      });
    },
    options: { enforce: "pre" }  // Run before other transformers
  }
}));

function transformCallouts(markdown: string): string {
  const calloutRegex = /^>\s*\[\!(\w+)\]\s*(.+?)\n((?:^>.+$\n?)*)/gm;
  
  return markdown.replace(
    calloutRegex,
    (match, type, title, content) => {
      const lines = content
        .split('\n')
        .map(line => line.replace(/^>\s?/, ''))
        .join('\n');
      
      return `
<div class="callout callout-${type}">
  <div class="callout-title">${title}</div>
  <div class="callout-content">${lines}</div>
</div>
      `.trim();
    }
  );
}
```

---

## Step 6: Test Your Plugin

```typescript
import { normalizePlugin } from "@svartz/core";
import { obsidianCallouts } from "./my-plugin";

// Validate plugin
const normalized = normalizePlugin(obsidianCallouts());

// Test in isolation
const mockContext = {
  stage: "transformContent",
  files: [
    {
      path: "test.md",
      slug: "test",
      content: "> [!note] Hello\n> World",
      frontmatter: {}
    }
  ],
  config: { /* mock config */ },
  vaultConfig: { /* mock vault config */ }
};

// Run hook
const hook = obsidianCallouts().transformContent;
if (typeof hook === 'function') {
  hook(mockContext);
} else {
  hook.run(mockContext);
}

// Check result
console.log(mockContext.files[0].content); // Should have HTML
```

---

## Step 7: Add JSDoc

Always include JSDoc for documentation:

```typescript
/**
 * Transform Obsidian callouts to custom HTML.
 *
 * @description
 * Converts Obsidian-style callouts (> [!type] Title) to HTML divs.
 * Runs in pre-transform phase to ensure proper ordering.
 *
 * @example
 * ```ts
 * import { obsidianCallouts } from "./my-plugin";
 *
 * const plugins = [obsidianCallouts()];
 * runner.execute(plugins, config);
 * // Result: Callouts transformed to HTML
 * ```
 *
 * @returns SvartzPlugin for transformContent stage
 * @see [[contracts/plugin-contract]] for plugin system details
 */
export const obsidianCallouts = definePlugin(() => ({
  // ...
}));
```

---

## Step 8: Integrate into Your Config

Add your plugin to `svartz.config.ts`:

```typescript
import { defineConfig } from "@svartz/config";
import { obsidianCallouts } from "./plugins/my-plugin";

export default defineConfig({
  version: "1.0.0",
  
  defaults: {
    plugins: [
      obsidianCallouts()  // Add here
    ]
  },
  
  vaults: {
    docs: { path: "./docs" }
  }
});
```

Or override per-vault:

```typescript
vaults: {
  docs: {
    path: "./docs",
    plugins: [obsidianCallouts()]  // Only for this vault
  }
}
```

---

## Best Practices

✅ **DO:**
- Use specific, descriptive IDs (e.g., `"myorg:transform-callouts"`)
- Handle errors gracefully (don't throw unless `fatal: true`)
- Mutate files in-place (efficient)
- Document with JSDoc
- Test in isolation before integrating

❌ **DON'T:**
- Assume files are in a certain order (they're not deterministic across runs)
- Modify `path` or `slug` (these should be stable)
- Leave side effects outside the hook
- Forget to check if hooks are defined before accessing

---

## Troubleshooting

### Plugin Not Running
- Check `disabled: false` (default: false)
- Verify `enforce` level and merge order ([[contracts/plugin-contract#Plugin Merge Order]])
- Check for validation errors (run `normalizePlugin()` to test)

### Unknown Key Warning
- Add JSDoc comment to plugin explaining unknown fields
- Or remove unknown keys (only standard fields: `id`, `contractVersion`, `disabled`, stage names, `handleChange`)

### Async Plugin Hangs
- Ensure all promises are awaited
- Set timeout in runner if needed
- Check for circular promises

---

## See Also

- [[contracts/plugin-contract]] — Full plugin specification
- [[plugins/plugins-overview]] — All core plugins reference
- [[reference/quick-reference#Custom Plugin]] — Code snippets

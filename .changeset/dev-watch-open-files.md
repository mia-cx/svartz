---
"svartz": patch
---

`svartz dev` no longer watches `node_modules`, `.git`, `.svelte-kit`, `.turbo` or `.wrangler` inside a watched theme. On macOS a theme outside the project held about 40,000 open files through its dependencies, so a second dev server could fail with `ENFILE: file table overflow`.

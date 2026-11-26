---
"svartz": patch
---

In a workspace whose `turbo.json` has a `build` task, the managed Turbo task that builds a vault (`svartz:build:<id>`) now depends on `^build`. The project's workspace packages build first, and their output counts toward the task's cache key, so rebuilding a local theme or plugin no longer brings back a stale cached vault build. A workspace without a `build` task keeps independent vault builds, since Turbo refuses a `^build` that names no task.

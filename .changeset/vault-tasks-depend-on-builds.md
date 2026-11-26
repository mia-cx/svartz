---
"svartz": patch
---

In a workspace whose `turbo.json` has a generic `build` task, the managed Turbo task that builds a vault (`svartz:build:<id>`) now depends on `^build`. The project's workspace packages build first, and their output counts toward the task's cache key, so rebuilding a local theme or plugin no longer brings back a stale cached vault build. Other workspaces keep independent vault builds: `^build` would fail on a dependency without a build, and naming package builds such as `theme#build` could pull in unrelated ones or close a cycle.

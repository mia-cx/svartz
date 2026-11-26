---
"svartz": patch
---

The managed Turbo task that builds a vault (`svartz:build:<id>`) now waits on the workspace's package builds, and their output counts toward its cache key, so rebuilding a local theme or plugin no longer brings back a stale cached vault build. With a generic `build` task in `turbo.json`, it depends on `^build`. With only package-specific tasks such as `theme#build`, it depends on those by name, since `^build` would fail on a dependency without a build. With neither, vault builds stay independent.

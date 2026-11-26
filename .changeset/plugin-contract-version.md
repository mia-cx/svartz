---
"@svartz/core": patch
---

A plugin whose `contractVersion` has a different major version from Svartz's `CONTRACT_VERSION` now fails when it loads, before any hook runs. The error names the plugin, its `contractVersion` and the contract. Before, Svartz accepted any `contractVersion` and ran the plugin anyway. A plugin that doesn't declare `contractVersion` still loads.

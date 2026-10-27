---
"@svartz/config": patch
---

Configs written for Svartz 1 keep loading under Svartz 2. The `version` in `svartz.config.ts` names the config format, whose major stays 1 until a 1.x config stops working, rather than following the package's major.

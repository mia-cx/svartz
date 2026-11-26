---
"@svartz/vite": patch
---

A vault of around a thousand notes or more builds again on Linux. The build kept every published file's path in one environment variable, and once that outgrew the size Linux allows one variable, every process the build started afterwards failed with `spawn E2BIG`.

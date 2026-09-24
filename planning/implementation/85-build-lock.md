# Safe vault build lock

Issue #85 fixes retrying build errors as contention and concurrent stale-lock deletion.

- [x] Tests: cover stale recovery with parallel builders, an older directory lock, a stale guard, malformed metadata, and callback `EEXIST`. The full CLI suite passed 33 tests before the final malformed-owner case; all five lock tests and the CLI build pass afterward.
- [x] Capture knowledge: record atomic owner creation and recovery guard rules for cross-process builds.
- [x] Documentation: describe crash recovery and the manual action for an abandoned recovery guard.
- [ ] Review & close: inspect the lock protocol, run CLI tests/build, and resolve both original review threads. Close #85 only when merged.

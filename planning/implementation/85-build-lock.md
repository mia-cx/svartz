# Safe vault build lock

Issue #85 fixes retrying build errors as contention and concurrent stale-lock deletion.

- [ ] Tests: cover live contention, stale recovery with parallel builders, and an `EEXIST` thrown by the build callback.
- [ ] Capture knowledge: record atomic owner creation and recovery guard rules for cross-process builds.
- [ ] Documentation: describe crash recovery and the manual action for an abandoned recovery guard.
- [ ] Review & close: inspect the lock protocol, run CLI tests/build, and resolve both original review threads. Close #85 only when merged.

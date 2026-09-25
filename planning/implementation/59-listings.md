# #59 Mounted folder and tag listings

## Outcome

Published notes populate mounted folder and tag routes. Ancestor folders count descendants, authored notes and host routes retain priority, and old routes disappear after a rebuild.

## TODOs

- [x] Index all ancestor folders for each published note, with stable counts and mounted hrefs.
- [x] Verify runtime route matching and authored landing precedence for nested folders and tags.
- [x] Tests: cover nested counts, unpublished notes, static prerender, host overrides, and stale-route cleanup.
- [x] Capture Knowledge: record listing ownership and ancestor aggregation in a scoped rule.
- [x] Documentation: explain folder/tag route generation and authored overrides.
- [x] Review & Close: inspected diff and ran relevant builds/tests. Packed check is N/A because public exports and archives did not change. File PR closing #59.

## Notes

Base branch: `feat/v1-generators` (PR #57). The first-party theme already has listing components and nested folder filtering; the index currently records only each note's immediate parent folder.

Validation: plugin/Vite/CLI build 7/7; host build test, static docs build test, and full workspace test 16/16 passed. The host test covers hidden notes and removal of a nested note on rebuild. Existing runtime tests cover authored tag landing and folder route precedence.

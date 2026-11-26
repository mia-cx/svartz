# @svartz/plugin-submissions

## 2.6.0

### Patch Changes

- b7f2573: A page's history numbers its pages from 1, as GitHub does: `?page=1` is the first page, the same as no `?page`, and `?page=10` the last, which reaches the latest 1,000 changes. `?page=0` now answers 404. `CommitReader.history` takes GitHub's page number as it is, counting from 1.
- dbf8b88: Svartz's plugin packages carry the npm keyword `svartz-plugin`, and its themes `svartz-theme`, so an npm search for either keyword finds them. Tag your own Svartz plugin or theme the same way to be found beside them.
- Updated dependencies [5596543]
- Updated dependencies [1ddaf7e]
- Updated dependencies [dbf8b88]
- Updated dependencies [8f0291d]
- Updated dependencies [04e44dd]
- Updated dependencies [ba0f490]
  - @svartz/plugins@2.6.0
  - @svartz/auth@2.6.0
  - @svartz/core@2.6.0

## 2.5.0

### Minor Changes

- 7e8db9e: The community wiki plugins are on npm. `@svartz/plugin-submissions` turns readers' edits and new pages into commits or pull requests, `@svartz/plugin-history` gives every page a history with diffs and the wiki a Recent changes list, and `@svartz/plugin-moderation` lets readers report problems and moderators handle them from the dashboard. They ship in the fixed version group with the rest of Svartz.

### Patch Changes

- Updated dependencies [03747e2]
- Updated dependencies [7f28eb7]
- Updated dependencies [8677494]
- Updated dependencies [22acec7]
- Updated dependencies [34fe812]
- Updated dependencies [c2b0f0d]
- Updated dependencies [11aedab]
- Updated dependencies [7119bad]
- Updated dependencies [142f796]
- Updated dependencies [142f796]
- Updated dependencies [e44be06]
- Updated dependencies [b82cf41]
- Updated dependencies [35ef566]
- Updated dependencies [f6cf60e]
- Updated dependencies [e42d690]
- Updated dependencies [5178445]
- Updated dependencies [03747e2]
- Updated dependencies [a863185]
- Updated dependencies [0661dc3]
- Updated dependencies [3a2a761]
- Updated dependencies [3aac18d]
- Updated dependencies [8c57dcf]
- Updated dependencies [72e30fc]
- Updated dependencies [b0548e3]
- Updated dependencies [2c11831]
  - @svartz/auth@2.5.0
  - @svartz/core@2.5.0
  - @svartz/plugins@2.5.0

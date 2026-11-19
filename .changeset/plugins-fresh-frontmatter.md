---
"@svartz/plugins": minor
---

A second build in the same process, such as a `svartz dev` rebuild, no longer publishes a description or title the first build generated as if the note's author had written it. Parsing the same note text twice used to hand both builds one shared frontmatter object, so values a build wrote into it stayed for the next. Each parse now answers its own.

`compileNoteVersion` also answers `resources`, the browser resources a version's steps registered, so a caller that keeps the compiled `markup` for a later build can give that build the scripts and styles the version needs.

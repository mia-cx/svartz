---
"@svartz/ui": patch
---

The reference sidebar nests folders as a real tree: `Reference > Public API > Authentication` instead of peer groups titled `Public API / Authentication`. Each folder shows its own name, closing a folder hides everything under it, and the current page's folders open on arrival. Folders a reader opens or closes stay that way across pages, the filter opens the path to each match, and clearing it restores the reader's choices.

`ReferenceNavSection` now holds `links` and nested `folders` (`ReferenceNavFolder`) instead of flat `groups`; `ReferenceNavGroup` is gone. `readingOrder` and `folderTrail` are new.

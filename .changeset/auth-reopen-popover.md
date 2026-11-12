---
'@svartz/auth': patch
---

Closing the sign-in dialog reopens the popover its opener sat in, which opening the dialog had hidden, so focus goes back to a control the reader can see instead of falling to the page.

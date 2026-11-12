---
'@svartz/plugin-annotations': minor
---

Readers delete their own comments, and moderators delete anyone's, from the comment's card. **Delete** asks first and locks while it's sent; the marker, card and highlight go when it's done. The new `DELETE <mount>/_svartz/annotations/<id>/` route deletes an annotation and its agreements for its author or an identity listed in `moderators`, answers 403 to anyone else, and 404 to an id that's already gone. `GET`'s `viewer` now also says whether the reader is a `moderator`.

---
"@svartz/auth": minor
---

Readers manage their account at `<mount>/-/account/`, in the site's own shell. They change their display name and handle, link another sign-in provider and unlink one while another remains, see their sessions, and sign out everywhere. An old handle keeps pointing at its account for good and can't be taken by anyone else: `GET <mount>/_svartz/auth/users/<old>/` redirects to the current handle, and `findProfile(handle, env)` from `@svartz/auth/server` answers the same for plugins. A provider account another account already has can't be linked, and a link only lands on the browser session that started it.

The page needs a server target and `SVARTZ_DB`. A host app needs the plugin page route that `npx svartz init` adds; without it, a host build with auth fails and says how to add it.

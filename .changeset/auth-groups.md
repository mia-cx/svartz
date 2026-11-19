---
"@svartz/core": minor
"@svartz/auth": minor
---

Accounts can form groups, such as a wiki's alliances. Any signed-in reader creates a group from the Groups section of `/-/account/` and owns it. Each group has a page at `<mount>/-/groups/<name>/`, shown only to its members, where owners invite accounts by handle, make members co-owners and remove members, and members leave. An invited account joins only by accepting on its account page. A group always keeps at least one owner.

Grants can name a group in People & permissions, and every member holds them; a group's grants rank below an account's own and above its roles'. A moderator who holds the new `auth:group-links:write` permission links a group to a vault, folder or page from the dashboard's Groups panel, which gives the group's owners every content permission there and below. Linking has no default, so only admins hold it until granted, and every link, unlink and membership change is recorded in the audit log.

A plugin can declare a permission with `administrative: true` when it administers the site rather than a page's content. Owning a user page or a group's linked pages never gives such a permission; only the `admin` role or a grant does. Auth's own permissions are administrative, and each grant, role and link change is checked on the object it lands on.

---
"@svartz/auth": minor
---

Sites with accounts get a dashboard at `<mount>/-/dashboard/`. It lists, by plugin, every panel the viewer holds the permission for, and answers 404 to anyone who holds none. Auth adds the first panel, People & permissions: grant, deny or unset any permission for an account or a role on the whole site, a vault, a folder or a page; create roles and choose who holds them; check whether an account may do something somewhere and see what decided it; find accounts; and read every permission the site's plugins declare. It needs `auth:grants:read` to open and `auth:grants:write` to change anything, which only admins hold until granted. Either is as powerful as being an admin.

Stored roles are new: grants can name a role, accounts hold roles, and `Account.roles` lists them after `admin`. The `admin` role still comes only from `admins` in config.

Every grant and role change is recorded in an append-only audit log in `SVARTZ_DB`, in the same transaction as the change. Server plugins record their own changes with `audit(env, entry, changes?)` from `@svartz/auth/server`. Signed-in readers find Account and, when they hold a panel, Dashboard links in the site actions.

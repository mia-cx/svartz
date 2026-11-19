---
"@svartz/core": minor
"@svartz/vite": minor
"@svartz/auth": minor
"@svartz/plugin-annotations": minor
---

Plugins can declare permissions and check them with one call. A plugin lists what it checks under `permissions`, as `namespace:feature:action` slugs with a name, a description and optional defaults for the built-in actors `guest` (everyone) and `signed-in` (everyone with an account). Auth collects the declarations at build time, a theme preset's plugins included, and fails the build on a malformed one. Build hooks can read every plugin the build runs as `ctx.plugins`.

`can(account, permission, object, env)` from `@svartz/auth/server` answers whether an account, or a guest, holds a permission on the site, a vault or a page. Grants live in `SVARTZ_DB` and give an actor `allow`, `deny` or `unset` on an object: the most specific object with a grant that applies decides, then the most specific actor, and a deny beats an allow between equals. Admins are allowed everything, and every account everything on its own `users/<handle>` page. Without `SVARTZ_DB`, `can()` answers `false`.

Annotations now declares `annotations:comments:write`, which every signed-in reader holds by default, and `annotations:comments:delete`, which lets a reader delete anyone's annotations on a page. On a site with accounts, each identity in the `moderators` option becomes a grant of `annotations:comments:delete` on the vault once its owner has an account, and the grant decides from then on. `moderators` is deprecated; grant the permission instead. Sites without `SVARTZ_DB` keep using the list.

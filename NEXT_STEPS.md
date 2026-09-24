# Next steps for v1

1. Finish the UI work in [#21](https://github.com/mia-cx/svartz/issues/21) on its separate branch. Backend changes through [#70](https://github.com/mia-cx/svartz/pull/70) are already pushed for that branch to consume.
2. Review and merge the backend stack from [#16](https://github.com/mia-cx/svartz/pull/16) upward, preserving each PR's base until its parent merges. Rebase the finished UI branch onto the integrated backend before merging it.
3. Run the [#17](https://github.com/mia-cx/svartz/issues/17) acceptance pass on the integrated branch: serial workspace checks, public-URL sitemap and metadata, 404 and asset output, mounted host routes, browser hydration, and packed npm consumers.
4. Plan npm publication and deployment once the integrated v1 branch is green. Package release preparation is in [#20](https://github.com/mia-cx/svartz/issues/20); no public publish or production deployment has happened.

The previous Markdown, embed, watch, and CLI checklist is obsolete. Their backend work is represented by the PR stack and its linked issues; use those issues for remaining review findings.

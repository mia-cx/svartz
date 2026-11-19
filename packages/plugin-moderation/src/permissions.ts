import type { PermissionDeclaration } from "@svartz/core";

/** Report a page, an edit, a submission, a comment or an account. Every signed-in reader may, unless a grant says otherwise. */
export const WRITE_REPORTS = "moderation:reports:write";
/** Open the Reports panel, and resolve or dismiss reports. */
export const READ_REPORTS = "moderation:reports:read";
/** Suspend and unsuspend accounts. Declared for suspensions; nothing checks it yet. */
export const WRITE_ACCOUNTS = "moderation:accounts:write";
/** Read the audit log. Declared for the audit log panel; nothing checks it yet. */
export const READ_AUDIT = "moderation:audit:read";

/** What the plugin declares to `auth`, which collects it at build time and checks it with `can()`. */
export const PERMISSIONS = [
  {
    slug: WRITE_REPORTS,
    name: "Report",
    description: "Report a page, an edit, a submission, a comment or an account to the moderators.",
    defaults: { "signed-in": "allow" },
  },
  {
    slug: READ_REPORTS,
    name: "Handle reports",
    description: "See the reports readers send, and resolve or dismiss them.",
  },
  {
    slug: WRITE_ACCOUNTS,
    name: "Suspend accounts",
    description: "Suspend and unsuspend accounts.",
  },
  {
    slug: READ_AUDIT,
    name: "Read the audit log",
    description: "See what every moderator and admin changed, and when.",
  },
] as const satisfies readonly PermissionDeclaration[];

/**
 * What a report can be about, checked against this vault before it's stored. Pages, comments and accounts must exist
 * now. Commits and submissions live on GitHub, which this plugin doesn't call: they need the submissions plugin on the
 * vault, whose repository they belong to, and a well-formed SHA or number. The owning plugin checks the rest when a
 * moderator acts: closing a submission refuses a pull request that isn't one.
 */
import { findProfile } from "@svartz/auth/server";
import type { ServerContext } from "@svartz/core";
import { findComment } from "@svartz/plugin-annotations/server";
import { TARGET_KINDS, type TargetKind } from "./api";
import type { Target } from "./store";

/** What the build tells the server about the vault. */
export interface BuildData {
  /** Every published page, by slug: its title and its URL below the deployment base. */
  readonly pages: Readonly<Record<string, { readonly title: string; readonly href: string }>>;
  /** The annotations plugin, when the vault has it: the D1 binding its comments are in. */
  readonly annotations?: { readonly database: string };
  /** The submissions plugin, when the vault has it: the repository edits go to, as `owner/name`. */
  readonly submissions?: { readonly repo: string };
}

/** Why a target can't be reported, as the route answers it. */
export interface Refusal {
  readonly status: number;
  readonly error: string;
  readonly message: string;
}

/** Longest target id accepted; page slugs are far shorter. */
const MAX_ID_LENGTH = 1024;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const PULL_NUMBER = /^[1-9]\d{0,9}$/;

/**
 * Published page `slug`, or `undefined`. Own entries only: `pages` is a plain object, so `constructor`, `toString` and
 * `__proto__` would otherwise name a page.
 */
export const publishedPage = (data: BuildData, slug: string) => Object.hasOwn(data.pages, slug) ? data.pages[slug] : undefined;

const refuse = (status: number, error: string, message: string): Refusal => ({ status, error, message });
const isKind = (value: unknown): value is TargetKind => TARGET_KINDS.includes(value as TargetKind);

/** `input` as a target of this vault that exists, or why it can't be reported. An account is stored under its current handle. */
export async function checkTarget(input: unknown, context: ServerContext, data: BuildData): Promise<Target | Refusal> {
  const { kind, id } = (typeof input === "object" && input !== null ? input : {}) as { kind?: unknown; id?: unknown };
  if (!isKind(kind) || typeof id !== "string" || id === "" || id.length > MAX_ID_LENGTH) {
    return refuse(400, "invalid_target", "Say what you're reporting as { kind, id }.");
  }
  switch (kind) {
    case "page":
      return publishedPage(data, id) ? { kind, id } : refuse(404, "not_found", "This page isn't on the site.");
    case "annotation": {
      if (!data.annotations) return refuse(400, "invalid_target", "This site has no comments to report.");
      const comment = await findComment(context.env, data.annotations.database, context.vault.id, id);
      return comment && !comment.hidden ? { kind, id } : refuse(404, "not_found", "This comment has been deleted.");
    }
    case "account": {
      const profile = await findProfile(id, context.env);
      return profile ? { kind, id: profile.handle } : refuse(404, "not_found", "No account has this handle.");
    }
    case "commit":
    case "submission":
      if (!data.submissions) return refuse(400, "invalid_target", `This site takes no edits to report.`);
      return (kind === "commit" ? COMMIT_SHA : PULL_NUMBER).test(id)
        ? { kind, id }
        : refuse(400, "invalid_target", kind === "commit" ? "Name the commit by its full SHA." : "Name the submission by its number.");
  }
}

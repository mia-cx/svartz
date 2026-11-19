/**
 * The header on everything the site posts to GitHub on someone's behalf: replies now, and moderators' comments and
 * reviews later. GitHub shows the post as the App's bot, so the header names who wrote it, their role and their user
 * page, as a Note callout:
 *
 * ```md
 * > [!NOTE]
 * > Sent from wiki.example by [Ada Lovelace (ada)](<https://wiki.example/users/ada/>), submitter.
 *
 * Thanks, I've added a source.
 * ```
 *
 * The header comes first and ends at a blank line, so nothing in the text after it can change it: Markdown never
 * reaches back into a block that has ended. Its fields are escaped as plain text with no line breaks, so a display
 * name can't close the callout, add a link or start a second header. The text keeps its Markdown, since GitHub
 * renders it, but every `@` mention in it is quieted with a word joiner: GitHub users who never asked to hear from the
 * site aren't notified by someone typing their name on it.
 */
import { markdownText, quietMentions } from "./github";

/** Longest text a reply may hold, in characters; GitHub's own cap on a comment is far above it. */
export const MAX_REPLY_LENGTH = 4000;

/** Who the site posts as. */
export interface Sender {
  /** The account's display name and handle. */
  readonly name: string;
  readonly handle: string;
  /** What they act as on this post: `submitter` on their own submission, else their site role, such as `moderator`. */
  readonly role: string;
  /** Their user page's absolute URL, when they have one the site shows. */
  readonly userPage?: string;
}

/** A link destination in angle brackets may hold anything but whitespace and the brackets themselves. */
const LINKABLE = /^https:\/\/[^\s<>]+$/;

/** The header naming `sender`, posting from the site at `host`, as one callout ending its own block. */
export function header({ name, handle, role, userPage }: Sender, host: string): string {
  const who = `${markdownText(name) || markdownText(handle)} (${markdownText(handle)})`;
  const linked = userPage && LINKABLE.test(userPage) ? `[${who}](<${userPage}>)` : who;
  return `> [!NOTE]\n> Sent from ${markdownText(host)} by ${linked}, ${markdownText(role)}.`;
}

/** What the reader typed, as it is posted: line endings as GitHub stores them, trimmed, with mentions quieted. */
export const postedText = (text: string): string => quietMentions(text.replace(/\r\n?/g, "\n").trim());

/** The comment GitHub gets: the header, a blank line, then the text. */
export const attributed = (heading: string, text: string): string => `${heading}\n\n${text}`;

/**
 * The provider accounts linked to an account, for plugins that need one in particular, such as a commit crediting
 * the person's GitHub account.
 */
import { isProviderId, type Identity } from "./providers";
import type { Account } from "./session";
import { accountsDatabase } from "./store";

interface IdentityRow {
  id: string;
  provider: string;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  profile_url: string | null;
}

/**
 * Every provider account linked to `account`, the first linked first, each with the profile it last signed in with.
 * Empty when the site binds no `SVARTZ_DB`. `env` is the handler's `context.env`.
 */
export async function linkedIdentities(account: Pick<Account, "id">, env: Readonly<Record<string, unknown>>): Promise<Identity[]> {
  const db = await accountsDatabase(env);
  if (!db) return [];
  const { results } = await db.prepare(`SELECT id, provider, name, handle, avatar_url, profile_url FROM auth_identities
      WHERE account_id = ? ORDER BY created_at, id`).bind(account.id).all<IdentityRow>();
  return results.flatMap((row) => isProviderId(row.provider)
    ? [{
      id: row.id,
      provider: row.provider,
      name: row.name,
      ...row.handle !== null && { handle: row.handle },
      ...row.avatar_url !== null && { avatarUrl: row.avatar_url },
      ...row.profile_url !== null && { profileUrl: row.profile_url },
    }]
    : []);
}

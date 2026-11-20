import { SSO_COOKIE, type SsoClaims, verifySsoToken } from "@huyab/sso";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";

/**
 * SSO claims from the `huyab_sso` cookie only. `Authorization: Bearer` here
 * carries the master password (with `X-Email`), never an SSO token.
 */
export async function getSsoClaims<
  E extends { Bindings: { SSO_ISSUER: string } },
>(c: Context<E>): Promise<SsoClaims | null> {
  const token = getCookie(c, SSO_COOKIE);
  return token ? verifySsoToken(token, c.env.SSO_ISSUER) : null;
}

export type DbUser = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  password_hash: string | null;
  password_salt: string | null;
};

export function findUserByEmail(
  db: D1Database,
  email: string,
): Promise<DbUser | null> {
  return db
    .prepare(
      "SELECT id, email, name, picture, password_hash, password_salt FROM share_users WHERE email = ?",
    )
    .bind(email)
    .first<DbUser>();
}

export async function resolveUser(
  db: D1Database,
  claims: SsoClaims,
): Promise<DbUser> {
  const existing = await findUserByEmail(db, claims.email);
  if (existing) return existing;

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO share_users (id, email, name, picture)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(id, claims.email, claims.name ?? claims.email, claims.picture ?? null)
    .run();

  const created = await findUserByEmail(db, claims.email);

  if (!created) throw new Error("Failed to resolve user row");
  return created;
}

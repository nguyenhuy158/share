import { verifySsoToken, SsoClaims } from "./sso-verifier.js";

export const SSO_COOKIE = "huyab_sso";

export function parseCookie(header: string | null, name: string): string | undefined {
  return header?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
}

export function ssoUrl(issuer: string, path: string, redirectTo: string): string {
  const target = new URL(`${issuer}${path}`);
  target.searchParams.set("redirect_uri", redirectTo);
  return target.toString();
}

export async function getClaimsFromRequest(request: Request, issuer: string): Promise<SsoClaims | null> {
  const token = parseCookie(request.headers.get("Cookie"), SSO_COOKIE);
  if (!token) return null;
  return verifySsoToken(token, issuer);
}

export type DbUser = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  password_hash: string | null;
  password_salt: string | null;
};

export async function resolveUser(db: D1Database, claims: SsoClaims): Promise<DbUser> {
  const existing = await db
    .prepare("SELECT id, email, name, picture, password_hash, password_salt FROM share_users WHERE email = ?")
    .bind(claims.email)
    .first<DbUser>();

  if (existing) return existing;

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO share_users (id, email, name, picture)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`
    )
    .bind(id, claims.email, claims.name ?? claims.email, claims.picture ?? null)
    .run();

  const created = await db
    .prepare("SELECT id, email, name, picture, password_hash, password_salt FROM share_users WHERE email = ?")
    .bind(claims.email)
    .first<DbUser>();

  if (!created) throw new Error("Failed to resolve user row");
  return created;
}

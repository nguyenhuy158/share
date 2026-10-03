import { Hono, Context } from "hono";
import { cors } from "hono/cors";
import { generateSalt, hashPassword, verifyPassword } from "./crypto.js";
import { findUserByEmail, getClaimsFromRequest, resolveUser, ssoUrl, DbUser } from "./session.js";

type Bindings = {
  DB: D1Database;
  SSO_ISSUER: string;
  APP_URL: string;
};

type Variables = {
  user: DbUser;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("/api/*", cors());

const DEFAULT_ISSUER = "https://auth.huyab.click";
const DEFAULT_APP_URL = "https://share.huyab.click";

/** Gốc URL công khai của app, không có "/" cuối. */
function appUrl(env: Bindings): string {
  return (env.APP_URL || DEFAULT_APP_URL).replace(/\/$/, "");
}

const MIME_BY_EXT: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  svg: "image/svg+xml",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

function getMimeType(filename: string, fallback = "text/html; charset=utf-8"): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? fallback;
}

// SSO Authentication helpers
function ssoRedirect(c: Context<{ Bindings: Bindings; Variables: Variables }>, path: "/login" | "/logout") {
  return c.redirect(ssoUrl(c.env.SSO_ISSUER || DEFAULT_ISSUER, path, `${appUrl(c.env)}/`));
}

app.get("/login", (c) => ssoRedirect(c, "/login"));

app.get("/logout", (c) => ssoRedirect(c, "/logout"));

// Current user state for Web UI
app.get("/api/me", async (c) => {
  const claims = await getClaimsFromRequest(c.req.raw, c.env.SSO_ISSUER);
  if (!claims) {
    return c.json({ authenticated: false });
  }

  try {
    const user = await resolveUser(c.env.DB, claims);
    return c.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        hasMasterPassword: Boolean(user.password_hash),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Database error";
    return c.json({ error: message }, 500);
  }
});

// Set or update Master Password (requires SSO session)
app.post("/api/user/master-password", async (c) => {
  const claims = await getClaimsFromRequest(c.req.raw, c.env.SSO_ISSUER);
  if (!claims) {
    return c.json({ error: "Unauthorized. Please sign in via SSO." }, 401);
  }

  const user = await resolveUser(c.env.DB, claims);
  const body = (await c.req.json().catch(() => ({}))) as { password?: string };
  const password = body.password?.trim();

  if (!password || password.length < 6) {
    return c.json({ error: "Master password must be at least 6 characters." }, 400);
  }

  const salt = generateSalt();
  const hash = await hashPassword(password, salt);

  await c.env.DB.prepare(
    `UPDATE share_users 
     SET password_hash = ?, password_salt = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE id = ?`
  )
    .bind(hash, salt, user.id)
    .run();

  return c.json({ success: true, message: "Master password updated successfully." });
});

// Upload artifact (supports Agent, MCP tool, curl, or frontend form)
app.post("/api/upload", async (c) => {
  let email = "";
  let password = "";
  let content = "";
  let filename = "index.html";
  let title = "";
  let contentType = "";
  let slug = "";
  let isFresh = false;
  let isBinary = 0;

  // 1. Check Authorization header: Authorization: Bearer <password>, X-Email: <email>
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    password = authHeader.slice(7).trim();
  }
  const emailHeader = c.req.header("X-Email");
  if (emailHeader) {
    email = emailHeader.trim().toLowerCase();
  }

  const contentTypeHeader = c.req.header("Content-Type") || "";

  // 2. Parse Multipart Form
  if (contentTypeHeader.includes("multipart/form-data") || contentTypeHeader.includes("application/x-www-form-urlencoded")) {
    const formData = await c.req.formData();
    email = (formData.get("email") as string)?.trim().toLowerCase() || email;
    password = (formData.get("password") as string)?.trim() || password;
    title = (formData.get("title") as string)?.trim() || "";
    slug = (formData.get("slug") as string)?.trim().toLowerCase() || "";
    isFresh = formData.get("fresh") === "true" || formData.get("new") === "true";

    const fileOrContent = formData.get("file");
    if (fileOrContent instanceof File) {
      filename = fileOrContent.name || filename;
      contentType = fileOrContent.type || getMimeType(filename);
      // Check if text or binary
      if (
        contentType.startsWith("text/") ||
        contentType.includes("json") ||
        contentType.includes("javascript") ||
        contentType.includes("xml") ||
        contentType.includes("svg")
      ) {
        content = await fileOrContent.text();
        isBinary = 0;
      } else {
        const buffer = await fileOrContent.arrayBuffer();
        let binaryStr = "";
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i++) {
          binaryStr += String.fromCharCode(bytes[i]);
        }
        content = btoa(binaryStr);
        isBinary = 1;
      }
    } else if (typeof fileOrContent === "string") {
      content = fileOrContent;
      filename = (formData.get("filename") as string)?.trim() || filename;
    }
  } else {
    // 3. Parse JSON body
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      content?: string;
      filename?: string;
      title?: string;
      slug?: string;
      fresh?: boolean;
      new?: boolean;
      contentType?: string;
      isBinary?: boolean;
    };
    email = body.email?.trim().toLowerCase() || email;
    password = body.password?.trim() || password;
    content = body.content || "";
    filename = body.filename?.trim() || filename;
    title = body.title?.trim() || "";
    slug = body.slug?.trim().toLowerCase() || "";
    isFresh = Boolean(body.fresh || body.new);
    contentType = body.contentType?.trim() || "";
    isBinary = body.isBinary ? 1 : 0;
  }

  if (!email || !password) {
    return c.json(
      { error: "Missing required fields: email and master password are required." },
      400
    );
  }

  if (!content) {
    return c.json({ error: "No content provided to share." }, 400);
  }

  // Check user & verify master password
  const user = await findUserByEmail(c.env.DB, email);

  if (!user || !user.password_hash || !user.password_salt) {
    return c.json(
      {
        error:
          "User not found or master password not set. Please log in to https://share.huyab.click via SSO and set your master password first.",
      },
      401
    );
  }

  const isValid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!isValid) {
    return c.json({ error: "Invalid master password." }, 401);
  }

  const effectiveTitle = title || filename;
  const effectiveContentType = contentType || getMimeType(filename);
  const size = isBinary ? Math.round((content.length * 3) / 4) : new TextEncoder().encode(content).length;

  // Max payload size protection (1.8MB for SQLite column safety)
  if (content.length > 2_000_000) {
    return c.json({ error: "Artifact content exceeds maximum size limit (2MB)." }, 413);
  }

  type ExistingRow = {
    id: string;
    title: string;
    filename: string;
    content: string;
    size: number;
    version: number;
    slug: string | null;
    created_at: string;
    updated_at: string;
  };

  let existing: ExistingRow | null = null;

  // Check if an existing artifact should be versioned
  if (!isFresh) {
    if (slug) {
      existing = await c.env.DB.prepare(
        `SELECT id, title, filename, content, size, version, slug, created_at, updated_at
         FROM share_artifacts WHERE user_id = ? AND slug = ? LIMIT 1`
      )
        .bind(user.id, slug)
        .first<ExistingRow>();
    } else if (filename) {
      existing = await c.env.DB.prepare(
        `SELECT id, title, filename, content, size, version, slug, created_at, updated_at
         FROM share_artifacts WHERE user_id = ? AND filename = ? ORDER BY created_at DESC LIMIT 1`
      )
        .bind(user.id, filename)
        .first<ExistingRow>();
    } else if (title) {
      existing = await c.env.DB.prepare(
        `SELECT id, title, filename, content, size, version, slug, created_at, updated_at
         FROM share_artifacts WHERE user_id = ? AND title = ? ORDER BY created_at DESC LIMIT 1`
      )
        .bind(user.id, title)
        .first<ExistingRow>();
    }
  }

  let targetId: string;
  let nextVersion: number;
  const now = new Date().toISOString();

  if (existing) {
    // 1. Archive previous version
    const versionHistoryId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO share_artifact_versions (id, artifact_id, version, content, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        versionHistoryId,
        existing.id,
        existing.version || 1,
        existing.content,
        existing.size,
        existing.updated_at || existing.created_at
      )
      .run();

    targetId = existing.id;
    nextVersion = (existing.version || 1) + 1;
    const finalSlug = slug || existing.slug || null;

    // 2. Update existing artifact in-place with incremented version
    await c.env.DB.prepare(
      `UPDATE share_artifacts
       SET title = ?, filename = ?, content = ?, size = ?, content_type = ?, is_binary = ?, version = ?, slug = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`
    )
      .bind(effectiveTitle, filename, content, size, effectiveContentType, isBinary, nextVersion, finalSlug, existing.id)
      .run();
  } else {
    // Brand new artifact
    targetId = crypto.randomUUID();
    nextVersion = 1;

    await c.env.DB.prepare(
      `INSERT INTO share_artifacts (id, user_id, title, filename, content_type, size, content, is_binary, version, slug)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(targetId, user.id, effectiveTitle, filename, effectiveContentType, size, content, isBinary, nextVersion, slug || null)
      .run();
  }

  const publicUrl = `${appUrl(c.env)}/artifact/${targetId}`;
  const rawUrl = `${appUrl(c.env)}/artifact/${targetId}/raw`;

  return c.json({
    success: true,
    id: targetId,
    url: publicUrl,
    rawUrl,
    version: nextVersion,
    isNew: !existing,
    title: effectiveTitle,
    filename,
    contentType: effectiveContentType,
    size,
    updatedAt: now,
  });
});
// Helper to authenticate either via SSO cookie or Bearer master password
async function authenticateUser(c: Context<{ Bindings: Bindings; Variables: Variables }>): Promise<DbUser | null> {
  const claims = await getClaimsFromRequest(c.req.raw, c.env.SSO_ISSUER);
  if (claims) {
    return resolveUser(c.env.DB, claims);
  }

  const authHeader = c.req.header("Authorization");
  const emailHeader = c.req.header("X-Email");
  if (authHeader?.startsWith("Bearer ") && emailHeader) {
    const password = authHeader.slice(7).trim();
    const email = emailHeader.trim().toLowerCase();
    const user = await findUserByEmail(c.env.DB, email);

    if (user && user.password_hash && user.password_salt) {
      const isValid = await verifyPassword(password, user.password_hash, user.password_salt);
      if (isValid) return user;
    }
  }

  return null;
}

// List user artifacts (supports SSO session or Bearer master password)
app.get("/api/artifacts", async (c) => {
  const user = await authenticateUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, title, filename, content_type, size, views, version, slug, created_at, updated_at
     FROM share_artifacts
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT 100`
  )
    .bind(user.id)
    .all();

  return c.json({ artifacts: results || [] });
});

// Get versions history of an artifact
app.get("/api/artifacts/:id/versions", async (c) => {
  const user = await authenticateUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const current = await c.env.DB.prepare(
    `SELECT id, version, size, created_at, updated_at
     FROM share_artifacts
     WHERE id = ? AND user_id = ?`
  )
    .bind(id, user.id)
    .first<{ id: string; version: number; size: number; created_at: string; updated_at: string }>();

  if (!current) {
    return c.json({ error: "Artifact not found" }, 404);
  }

  const { results: history } = await c.env.DB.prepare(
    `SELECT version, size, created_at
     FROM share_artifact_versions
     WHERE artifact_id = ?
     ORDER BY version DESC`
  )
    .bind(id)
    .all<{ version: number; size: number; created_at: string }>();

  const allVersions = [
    {
      version: current.version || 1,
      size: current.size,
      createdAt: current.updated_at || current.created_at,
      isCurrent: true,
    },
    ...(history || []).map((h) => ({
      version: h.version,
      size: h.size,
      createdAt: h.created_at,
      isCurrent: false,
    })),
  ];

  return c.json({ currentVersion: current.version || 1, versions: allVersions });
});

// Delete user artifact (supports SSO session or Bearer master password)
app.delete("/api/artifacts/:id", async (c) => {
  const user = await authenticateUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const result = await c.env.DB.prepare(
    "DELETE FROM share_artifacts WHERE id = ? AND user_id = ?"
  )
    .bind(id, user.id)
    .run();

  if (!result.meta.changes) {
    return c.json({ error: "Artifact not found or already deleted" }, 404);
  }

  // Clean up versions
  await c.env.DB.prepare("DELETE FROM share_artifact_versions WHERE artifact_id = ?").bind(id).run();

  return c.json({ success: true });
});

type ArtifactRow = { content: string; is_binary: number; version: number };

/**
 * Body để trả cho `?v=`: bản lịch sử nếu có, không thì bản hiện tại; kèm số
 * version thực sự được phục vụ. Nội dung nhị phân (lưu base64) giải về bytes.
 */
async function resolveArtifactBody(db: D1Database, id: string, row: ArtifactRow, requestedVersion?: string) {
  let content = row.content;
  let version = row.version || 1;

  if (requestedVersion) {
    const vNum = parseInt(requestedVersion, 10);
    if (!isNaN(vNum) && vNum !== row.version) {
      const historical = await db
        .prepare("SELECT content FROM share_artifact_versions WHERE artifact_id = ? AND version = ?")
        .bind(id, vNum)
        .first<{ content: string }>();

      if (historical) {
        content = historical.content;
        version = vNum;
      }
    }
  }

  if (row.is_binary !== 1) return { body: content, version };
  const binaryStr = atob(content);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return { body: bytes, version };
}

// Public direct artifact preview
app.get("/artifact/:id", async (c) => {
  const id = c.req.param("id");
  const requestedVersion = c.req.query("v");

  const row = await c.env.DB.prepare(
    "SELECT content, content_type, is_binary, version FROM share_artifacts WHERE id = ?"
  )
    .bind(id)
    .first<{ content: string; content_type: string; is_binary: number; version: number }>();

  if (!row) {
    return c.html(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Artifact Not Found — Share</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
    .card { text-align: center; max-width: 440px; padding: 2.5rem; background: #1e293b; border-radius: 1rem; border: 1px solid #334155; }
    h1 { margin: 0 0 0.5rem; font-size: 1.5rem; color: #f1f5f9; }
    p { margin: 0 0 1.5rem; color: #94a3b8; line-height: 1.5; font-size: 0.95rem; }
    a { display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 0.5rem; font-weight: 500; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>404 &mdash; Artifact Not Found</h1>
    <p>This artifact does not exist, or has been removed by its creator.</p>
    <a href="/">Go to Share Dashboard</a>
  </div>
</body>
</html>`,
      404
    );
  }

  const { body, version } = await resolveArtifactBody(c.env.DB, id, row, requestedVersion);

  // Increment view counter without delaying response
  c.executionCtx.waitUntil(
    c.env.DB.prepare("UPDATE share_artifacts SET views = views + 1 WHERE id = ?").bind(id).run()
  );

  const headers: Record<string, string> = {
    "Content-Type": row.content_type || "text/html; charset=utf-8",
    "X-Robots-Tag": "noindex, nofollow",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
    "X-Artifact-Version": String(version),
  };

  return new Response(body, { status: 200, headers });
});

// Download raw file content
app.get("/artifact/:id/raw", async (c) => {
  const id = c.req.param("id");
  const requestedVersion = c.req.query("v");

  const row = await c.env.DB.prepare(
    "SELECT filename, content, content_type, is_binary, version FROM share_artifacts WHERE id = ?"
  )
    .bind(id)
    .first<{ filename: string; content: string; content_type: string; is_binary: number; version: number }>();

  if (!row) {
    return c.text("Artifact not found", 404);
  }

  const { body, version } = await resolveArtifactBody(c.env.DB, id, row, requestedVersion);

  const headers: Record<string, string> = {
    "Content-Type": row.content_type || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${row.filename || "artifact"}"`,
    "X-Robots-Tag": "noindex, nofollow",
    "X-Artifact-Version": String(version),
  };

  return new Response(body, { status: 200, headers });
});
export default app;

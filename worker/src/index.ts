import { Hono } from "hono";
import { cors } from "hono/cors";
import { generateSalt, hashPassword, verifyPassword } from "./crypto.js";
import { getClaimsFromRequest, resolveUser, ssoUrl, DbUser } from "./session.js";

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
app.get("/login", (c) => {
  const issuer = c.env.SSO_ISSUER || "https://auth.huyab.click";
  const appUrl = c.env.APP_URL || "https://share.huyab.click";
  return c.redirect(ssoUrl(issuer, "/login", `${appUrl}/`));
});

app.get("/logout", (c) => {
  const issuer = c.env.SSO_ISSUER || "https://auth.huyab.click";
  const appUrl = c.env.APP_URL || "https://share.huyab.click";
  return c.redirect(ssoUrl(issuer, "/logout", `${appUrl}/`));
});

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
      contentType?: string;
      isBinary?: boolean;
    };
    email = body.email?.trim().toLowerCase() || email;
    password = body.password?.trim() || password;
    content = body.content || "";
    filename = body.filename?.trim() || filename;
    title = body.title?.trim() || "";
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
  const user = await c.env.DB.prepare(
    "SELECT id, email, password_hash, password_salt FROM share_users WHERE email = ?"
  )
    .bind(email)
    .first<DbUser>();

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

  const id = crypto.randomUUID();
  const effectiveTitle = title || filename;
  const effectiveContentType = contentType || getMimeType(filename);
  const size = isBinary ? Math.round((content.length * 3) / 4) : new TextEncoder().encode(content).length;

  // Max payload size protection (1.8MB for SQLite column safety)
  if (content.length > 2_000_000) {
    return c.json({ error: "Artifact content exceeds maximum size limit (2MB)." }, 413);
  }

  await c.env.DB.prepare(
    `INSERT INTO share_artifacts (id, user_id, title, filename, content_type, size, content, is_binary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, user.id, effectiveTitle, filename, effectiveContentType, size, content, isBinary)
    .run();

  const appUrl = (c.env.APP_URL || "https://share.huyab.click").replace(/\/$/, "");
  const publicUrl = `${appUrl}/artifact/${id}`;
  const rawUrl = `${appUrl}/artifact/${id}/raw`;

  return c.json({
    success: true,
    id,
    url: publicUrl,
    rawUrl,
    title: effectiveTitle,
    filename,
    contentType: effectiveContentType,
    size,
    createdAt: new Date().toISOString(),
  });
});

// List user artifacts (requires SSO session)
app.get("/api/artifacts", async (c) => {
  const claims = await getClaimsFromRequest(c.req.raw, c.env.SSO_ISSUER);
  if (!claims) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await resolveUser(c.env.DB, claims);
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, filename, content_type, size, views, created_at, updated_at
     FROM share_artifacts
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 100`
  )
    .bind(user.id)
    .all();

  return c.json({ artifacts: results || [] });
});

// Delete user artifact (requires SSO session)
app.delete("/api/artifacts/:id", async (c) => {
  const claims = await getClaimsFromRequest(c.req.raw, c.env.SSO_ISSUER);
  if (!claims) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await resolveUser(c.env.DB, claims);
  const id = c.req.param("id");

  const result = await c.env.DB.prepare(
    "DELETE FROM share_artifacts WHERE id = ? AND user_id = ?"
  )
    .bind(id, user.id)
    .run();

  if (!result.meta.changes) {
    return c.json({ error: "Artifact not found or already deleted" }, 404);
  }

  return c.json({ success: true });
});

// Public direct artifact preview
app.get("/artifact/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT content, content_type, is_binary FROM share_artifacts WHERE id = ?"
  )
    .bind(id)
    .first<{ content: string; content_type: string; is_binary: number }>();

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

  // Increment view counter without delaying response
  c.executionCtx.waitUntil(
    c.env.DB.prepare("UPDATE share_artifacts SET views = views + 1 WHERE id = ?").bind(id).run()
  );

  const headers: Record<string, string> = {
    "Content-Type": row.content_type || "text/html; charset=utf-8",
    "X-Robots-Tag": "noindex, nofollow",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
  };

  if (row.is_binary === 1) {
    const binaryStr = atob(row.content);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new Response(bytes, { status: 200, headers });
  }

  return new Response(row.content, { status: 200, headers });
});

// Download raw file content
app.get("/artifact/:id/raw", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT filename, content, content_type, is_binary FROM share_artifacts WHERE id = ?"
  )
    .bind(id)
    .first<{ filename: string; content: string; content_type: string; is_binary: number }>();

  if (!row) {
    return c.text("Artifact not found", 404);
  }

  const headers: Record<string, string> = {
    "Content-Type": row.content_type || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${row.filename || "artifact"}"`,
    "X-Robots-Tag": "noindex, nofollow",
  };

  if (row.is_binary === 1) {
    const binaryStr = atob(row.content);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new Response(bytes, { status: 200, headers });
  }

  return new Response(row.content, { status: 200, headers });
});

export default app;

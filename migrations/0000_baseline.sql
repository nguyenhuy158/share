-- Baseline: the share_* schema as it runs in production on 2026-10-18.
-- IF NOT EXISTS makes it a no-op there; on a fresh local D1 it creates the schema.

CREATE TABLE IF NOT EXISTS share_artifact_versions (id TEXT PRIMARY KEY, artifact_id TEXT NOT NULL REFERENCES share_artifacts(id) ON DELETE CASCADE, version INTEGER NOT NULL, content TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));

CREATE TABLE IF NOT EXISTS share_artifacts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES share_users(id),
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text/html',
    size INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_binary INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
, version INTEGER NOT NULL DEFAULT 1, slug TEXT);

CREATE TABLE IF NOT EXISTS share_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    picture TEXT,
    password_hash TEXT,
    password_salt TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_artifact_versions ON share_artifact_versions(artifact_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_share_artifacts_id ON share_artifacts(id);

CREATE INDEX IF NOT EXISTS idx_share_artifacts_user_created ON share_artifacts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_share_artifacts_user_filename ON share_artifacts(user_id, filename);

CREATE INDEX IF NOT EXISTS idx_share_artifacts_user_slug ON share_artifacts(user_id, slug);

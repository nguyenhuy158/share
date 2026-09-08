-- D1 Database schema for Share (share.huyab.click)
-- Tables use the share_ prefix to avoid collisions in the shared D1 database.

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
);

CREATE INDEX IF NOT EXISTS idx_share_artifacts_user_created ON share_artifacts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_artifacts_id ON share_artifacts(id);

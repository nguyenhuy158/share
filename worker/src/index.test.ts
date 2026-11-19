import { describe, expect, it, vi } from "vitest";
import { BUILD_INFO } from "./build-info.js";
import app from "./index.js";

const HEALTH_SELECT = "SELECT 1";

function fakeDb(failure?: Error): D1Database {
  return {
    prepare: (sql: string) => {
      if (failure) throw failure;
      expect(sql).toContain(HEALTH_SELECT);
      return { first: async () => ({ ok: 1 }) };
    },
  } as unknown as D1Database;
}

const env = (db: D1Database) => ({
  DB: db,
  SSO_ISSUER: "https://auth.example.test",
  APP_URL: "https://share.example.test",
});

const call = (path: string, db: D1Database, init?: RequestInit) =>
  app.fetch(new Request(`https://share.example.test${path}`, init), env(db));

describe("deploy check routes", () => {
  it("serves the baked build info without credentials", async () => {
    const response = await call("/api/version", fakeDb());
    expect(response.status).toBe(200);
    const body = (await response.json()) as typeof BUILD_INFO;
    expect(body).toEqual(BUILD_INFO);
    expect(body.commit.length).toBeGreaterThan(0);
    expect(Object.keys(body).sort()).toEqual(
      ["branch", "builtAt", "builtBy", "commit", "dirty", "shortCommit"].sort(),
    );
  });

  it("answers health ok when the database works", async () => {
    const response = await call("/api/health", fakeDb());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("answers 500 with a hint and no error text when the database fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const response = await call(
      "/api/health",
      fakeDb(new Error("secret-detail")),
    );
    expect(response.status).toBe(500);
    const text = await response.text();
    const body = JSON.parse(text) as { ok: boolean; hint: string };
    expect(body.ok).toBe(false);
    expect(body.hint.length).toBeGreaterThan(0);
    expect(text).not.toContain("secret-detail");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("does not answer other methods", async () => {
    const response = await call("/api/version", fakeDb(), { method: "POST" });
    expect(response.status).toBe(404);
  });

  it("still requires credentials for other API routes", async () => {
    const response = await call("/api/artifacts", fakeDb());
    expect(response.status).toBe(401);
  });
});

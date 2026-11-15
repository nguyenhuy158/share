import type { Hono } from "hono";
import { BUILD_INFO } from "./build-info.js";

export const VERSION_PATH = "/api/version";
export const HEALTH_PATH = "/api/health";
const HEALTH_PROBE_SQL = "SELECT 1 AS ok";
const HEALTH_FAILURE_HINT =
  "Database check failed. Is the D1 binding DB set and are migrations applied?";

type DeployCheckEnv = { Bindings: { DB: D1Database } };

export function registerDeployCheck<E extends DeployCheckEnv>(app: Hono<E>) {
  app.get(VERSION_PATH, (c) => c.json(BUILD_INFO));

  app.get(HEALTH_PATH, async (c) => {
    try {
      await c.env.DB.prepare(HEALTH_PROBE_SQL).first();
      return c.json({ ok: true });
    } catch (error) {
      console.error("health check failed", error);
      return c.json({ ok: false, hint: HEALTH_FAILURE_HINT }, 500);
    }
  });
}

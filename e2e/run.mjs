// Chạy cả bộ E2E một lệnh: build FE -> D1 local mới tinh (schema.sql) -> SSO
// giả -> `wrangler dev --local` -> smoke chỉ-đọc + smoke đầy đủ -> tắt hết.
// Không đụng dữ liệu thật: D1 nằm trong .wrangler/e2e-state, xoá mỗi lần chạy.
//
// Biến môi trường:
// - E2E_PORT: cổng cho wrangler dev (mặc định: cổng trống bất kỳ)
// - E2E_SKIP_BUILD=1: bỏ qua `pnpm build` (dùng khi ./dist đã mới)
// - PLAYWRIGHT_CHROMIUM_PATH: chỉ định Chromium cụ thể
import { rmSync } from "node:fs";
import { freePort, run, startServer, startSsoMock } from "@huyab/e2e";

const PERSIST_DIR = ".wrangler/e2e-state";
const E2E_EMAIL = "e2e@share.local";

const PORT = process.env.E2E_PORT || (await freePort());
const BASE = `http://127.0.0.1:${PORT}`;
const env = { E2E_BASE_URL: BASE };

if (process.env.E2E_SKIP_BUILD !== "1") {
  await run("pnpm", ["build"], { label: "build", env });
}
rmSync(PERSIST_DIR, { recursive: true, force: true });
await run(
  "pnpm",
  [
    "exec",
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    PERSIST_DIR,
    "--file=./schema.sql",
  ],
  { label: "schema D1", env },
);

const sso = await startSsoMock();
const inspectorPort = await freePort();

let server;
let failed = false;
try {
  // APP_URL trỏ về server local để link artifact trả về mở được ngay.
  server = await startServer({
    command: "pnpm",
    args: [
      "exec",
      "wrangler",
      "dev",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      PORT,
      "--inspector-port",
      inspectorPort,
      "--persist-to",
      PERSIST_DIR,
      "--var",
      `SSO_ISSUER:${sso.issuer}`,
      "--var",
      `APP_URL:${BASE}`,
    ],
    readyUrl: `${BASE}/api/me`,
  });
  console.log(
    `\nServer sẵn sàng tại ${BASE} (SSO giả: ${sso.issuer}), bắt đầu smoke\n`,
  );
  await run("node", ["e2e/readonly-smoke.mjs"], {
    label: "read-only smoke",
    env,
  });
  await run("node", ["e2e/ui-smoke.mjs"], {
    label: "ui smoke",
    env: { ...env, E2E_SSO_TOKEN: sso.mintToken(E2E_EMAIL, "E2E"), E2E_EMAIL },
  });
} catch (error) {
  failed = true;
  console.error("E2E FAIL:", error.message);
} finally {
  await server?.stop();
  sso.close();
}

process.exit(failed ? 1 : 0);

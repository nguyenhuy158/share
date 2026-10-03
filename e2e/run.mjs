// Chạy cả bộ E2E một lệnh: build FE -> D1 local mới tinh (schema.sql) -> SSO
// giả -> `wrangler dev --local` -> smoke chỉ-đọc + smoke đầy đủ -> tắt hết.
// Không đụng dữ liệu thật: D1 nằm trong .wrangler/e2e-state, xoá mỗi lần chạy.
//
// Biến môi trường:
// - E2E_PORT: cổng cho wrangler dev (mặc định: cổng trống bất kỳ)
// - E2E_SKIP_BUILD=1: bỏ qua `pnpm build` (dùng khi ./dist đã mới)
// - PLAYWRIGHT_CHROMIUM_PATH: chỉ định Chromium cụ thể
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { createServer } from "node:net";
import { startSsoMock } from "./sso-mock.mjs";

const PERSIST_DIR = ".wrangler/e2e-state";
const SERVER_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const E2E_EMAIL = "e2e@share.local";

/** Cổng TCP đang trống trên 127.0.0.1. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(String(port)));
    });
  });
}

const PORT = process.env.E2E_PORT || (await freePort());
const BASE = `http://127.0.0.1:${PORT}`;

/** Chạy một lệnh đến khi kết thúc; lỗi thì ném. */
function run(command, args, label, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: { ...process.env, E2E_BASE_URL: BASE, ...env } });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${label} thất bại (exit ${code})`))));
  });
}

/** Đợi tới khi server trả lời /api/me, hoặc ném khi quá hạn. */
async function waitForServer(child) {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev tắt sớm (exit ${child.exitCode})`);
    try {
      const response = await fetch(`${BASE}/api/me`);
      if (response.ok) return;
    } catch {
      // Server chưa sẵn sàng, thử lại.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`wrangler dev không lên sau ${SERVER_TIMEOUT_MS}ms`);
}

if (process.env.E2E_SKIP_BUILD !== "1") {
  await run("pnpm", ["build"], "build");
}
rmSync(PERSIST_DIR, { recursive: true, force: true });
await run(
  "pnpm",
  ["exec", "wrangler", "d1", "execute", "DB", "--local", "--persist-to", PERSIST_DIR, "--file=./schema.sql"],
  "schema D1",
);

const sso = await startSsoMock();
const inspectorPort = await freePort();

// `detached` cho server một process group riêng: `pnpm exec` sinh thêm tầng
// node con, kill riêng PID cha sẽ bỏ mồ côi wrangler/workerd giữ cổng.
// APP_URL trỏ về server local để link artifact trả về mở được ngay.
const server = spawn(
  "pnpm",
  [
    "exec", "wrangler", "dev", "--local",
    "--ip", "127.0.0.1", "--port", PORT, "--inspector-port", inspectorPort,
    "--persist-to", PERSIST_DIR,
    "--var", `SSO_ISSUER:${sso.issuer}`,
    "--var", `APP_URL:${BASE}`,
  ],
  { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, CI: "1" }, detached: true },
);

/** Gửi signal tới cả process group của server (bỏ qua nếu đã tắt). */
function killServer(signal) {
  try {
    process.kill(-server.pid, signal);
  } catch {
    // Group đã tắt.
  }
}

// Group tách riêng nên Ctrl-C không tới server: tự dọn trước khi thoát.
process.once("SIGINT", () => {
  killServer("SIGKILL");
  process.exit(130);
});

let failed = false;
try {
  await waitForServer(server);
  console.log(`\nServer sẵn sàng tại ${BASE} (SSO giả: ${sso.issuer}), bắt đầu smoke\n`);
  await run("node", ["e2e/readonly-smoke.mjs"], "read-only smoke");
  await run("node", ["e2e/ui-smoke.mjs"], "ui smoke", {
    E2E_SSO_TOKEN: sso.mintToken(E2E_EMAIL, "E2E"),
    E2E_EMAIL,
  });
} catch (error) {
  failed = true;
  console.error("E2E FAIL:", error.message);
} finally {
  const exited = new Promise((resolve) => server.once("exit", () => resolve(true)));
  killServer("SIGTERM");
  // Chờ wrangler dọn dẹp; quá hạn thì kết liễu để process không treo.
  const stopped =
    server.exitCode !== null ||
    (await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve(false), 5000))]));
  // Kết liễu cả group: wrangler có thể tắt trước khi workerd con kịp dọn.
  killServer("SIGKILL");
  if (!stopped) console.error("wrangler không tắt sau SIGTERM, đã SIGKILL");
  sso.close();
}

process.exit(failed ? 1 : 0);

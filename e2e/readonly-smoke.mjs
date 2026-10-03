// Smoke CHỈ ĐỌC, không cookie đăng nhập: chỉ GET trang/API công khai và kiểm
// trang render. Không upload/xoá/đặt mật khẩu, không vượt qua xác thực — an
// toàn để chạy vào production: `pnpm e2e:prod` (share.huyab.click). `pnpm e2e`
// chạy nó trước ui-smoke.mjs để dev và prod dùng chung một bộ kiểm tra.
//
// Request duy nhất gửi đi (đều là GET):
//   /api/me (mong anonymous), /api/artifacts (mong 401),
//   /artifact/<uuid ngẫu nhiên> và .../raw (mong 404 — CỐ TÌNH không mở artifact
//   có thật vì mỗi lần xem tăng bộ đếm views), /login (không theo redirect),
//   trang `/` trong Chromium (kèm asset + GET /api/me của SPA).
//
// Biến môi trường:
// - E2E_BASE_URL: mặc định http://127.0.0.1:8787
// - PLAYWRIGHT_CHROMIUM_PATH: xem findChromium() của @huyab/e2e
import { randomUUID } from "node:crypto";
import { BASE, findChromium } from "@huyab/e2e";
import { chromium } from "playwright-core";

const WAIT = { timeout: 15000 };
const MISSING_ID = randomUUID();

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

/** GET một đường dẫn (không theo redirect), ném nếu status/content-type không khớp. */
async function get(path, status, type) {
  const response = await fetch(BASE + path, { redirect: "manual" });
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status !== status || !contentType.includes(type)) {
    throw new Error(`GET ${path}: ${response.status} ${contentType} (cần ${status} ${type})`);
  }
  return response;
}

console.log(`Read-only smoke tại ${BASE}\n`);

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(`${page.url()}: ${error.message}`));

try {
  const me = await (await get("/api/me", 200, "application/json")).json();
  if (me.authenticated !== false) throw new Error(`/api/me phải anonymous: ${JSON.stringify(me)}`);
  ok("GET /api/me is anonymous without SSO cookie");

  await get("/api/artifacts", 401, "application/json");
  ok("GET /api/artifacts is 401 without credentials");

  const missing = await (await get(`/artifact/${MISSING_ID}`, 404, "text/html")).text();
  if (!missing.includes("Artifact Not Found")) throw new Error("trang 404 artifact thiếu tiêu đề");
  ok("GET /artifact/:id renders the 404 page for an unknown id");

  await get(`/artifact/${MISSING_ID}/raw`, 404, "text/plain");
  ok("GET /artifact/:id/raw is 404 for an unknown id");

  const login = await fetch(`${BASE}/login`, { redirect: "manual" });
  const location = login.headers.get("location") ?? "";
  if (login.status !== 302 || !location.includes("/login?redirect_uri=")) {
    throw new Error(`/login: ${login.status} -> ${location}`);
  }
  ok(`GET /login redirects to SSO (${new URL(location).origin})`);

  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { name: /Instant Preview & Artifact Hosting/ }).waitFor(WAIT);
  await page.getByRole("link", { name: "Sign in with Google SSO" }).waitFor(WAIT);
  ok("logged-out dashboard renders the landing page");

  if (pageErrors.length > 0) throw new Error(`lỗi JS trên trang: ${pageErrors.join(" | ")}`);
  ok("no uncaught page errors");
} catch (error) {
  failed += 1;
  console.log("FAIL:", error.message);
  await page.screenshot({ path: "e2e-failure.png" }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

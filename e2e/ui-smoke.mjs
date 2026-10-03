// E2E đầy đủ (CÓ GHI DỮ LIỆU) cho app chạy local: đăng nhập bằng cookie SSO giả,
// đặt master password, upload qua dashboard + API (text, version 2, nhị phân),
// xem/ tải raw/ lịch sử version rồi xoá — qua UI và API thật.
// Chỉ chạy qua `pnpm e2e` (e2e/run.mjs cấp server local + E2E_SSO_TOKEN);
// từ chối mọi base URL không phải localhost để không bao giờ ghi vào prod.
//
// Biến môi trường:
// - E2E_BASE_URL: server local (run.mjs đặt sẵn)
// - E2E_SSO_TOKEN, E2E_EMAIL: cookie huyab_sso do e2e/sso-mock.mjs ký + email của nó
// - PLAYWRIGHT_CHROMIUM_PATH: xem e2e/chromium.mjs
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { findChromium } from "./chromium.mjs";

const BASE = (process.env.E2E_BASE_URL || "").replace(/\/$/, "");
const TOKEN = process.env.E2E_SSO_TOKEN;
const EMAIL = process.env.E2E_EMAIL;
const WAIT = { timeout: 15000 };
const MASTER_PASSWORD = "matkhau-e2e";
// PNG 1x1 hợp lệ: kiểm luồng lưu base64 + giải về bytes khi phục vụ.
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  throw new Error(`ui-smoke chỉ chạy với server local, nhận "${BASE}" — dùng \`pnpm e2e\``);
}
if (!TOKEN || !EMAIL) throw new Error("thiếu E2E_SSO_TOKEN/E2E_EMAIL — dùng `pnpm e2e`");

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

/** Upload kiểu agent/CLI: JSON + Bearer master password, không cookie. */
async function apiUpload(body, password = MASTER_PASSWORD) {
  const response = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${password}`, "X-Email": EMAIL },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const browser = await chromium.launch({ executablePath: findChromium() });
const context = await browser.newContext();
await context.addCookies([{ name: "huyab_sso", value: TOKEN, url: BASE }]);
const page = await context.newPage();
page.on("pageerror", (error) => console.log("PAGE ERROR:", error.message));
page.on("dialog", (dialog) => dialog.accept());

try {
  const stamp = `e2e${Date.now()}`;
  const filename = `${stamp}.html`;

  // 1. Cookie SSO hợp lệ -> dashboard của đúng user.
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { name: "Master Password" }).waitFor(WAIT);
  await page.getByText(EMAIL).first().waitFor(WAIT);
  ok("SSO cookie opens the dashboard");

  // 2. Đặt master password qua form.
  await page.getByPlaceholder("At least 6 characters").fill(MASTER_PASSWORD);
  await page.getByRole("button", { name: "Save Master Password" }).click();
  await page.getByText("Master password saved successfully!").waitFor(WAIT);
  await page.getByText("Active & Configured").waitFor(WAIT);
  ok("master password saves from the dashboard");

  // 3. Upload file HTML qua "Manual Quick Upload".
  const htmlPath = join(tmpdir(), filename);
  writeFileSync(htmlPath, `<!doctype html><title>${stamp}</title><h1>Hello ${stamp} v1</h1>`);
  await page.locator('input[type="file"]').setInputFiles(htmlPath);
  await page.getByRole("button", { name: "Upload File" }).click();
  const published = page.getByText(`Published: ${BASE}/artifact/`);
  await published.waitFor(WAIT);
  const artifactUrl = (await published.textContent()).replace("Published:", "").trim();
  await page.locator("tr", { hasText: filename }).waitFor(WAIT);
  ok("dashboard upload publishes and lists the artifact");

  // 4. Link công khai mở được ở phiên không đăng nhập.
  const anonymous = await browser.newContext();
  const viewer = await anonymous.newPage();
  const viewResponse = await viewer.goto(artifactUrl);
  await viewer.getByRole("heading", { name: `Hello ${stamp} v1` }).waitFor(WAIT);
  if (viewResponse.headers()["x-artifact-version"] !== "1") throw new Error("thiếu X-Artifact-Version 1");
  await anonymous.close();
  ok("public artifact link renders without login");

  // 5. Agent upload cùng filename -> version 2; sai mật khẩu -> 401.
  const v2 = await apiUpload({ filename, content: `<h1>Hello ${stamp} v2</h1>` });
  if (v2.status !== 200 || v2.body.version !== 2 || v2.body.isNew !== false || v2.body.url !== artifactUrl) {
    throw new Error(`upload v2: ${v2.status} ${JSON.stringify(v2.body)}`);
  }
  const denied = await apiUpload({ filename, content: "x" }, "sai-mat-khau");
  if (denied.status !== 401) throw new Error(`mật khẩu sai phải 401, nhận ${denied.status}`);
  ok("API upload versions the artifact and rejects a wrong password");

  // 6. Phục vụ đúng từng version + raw tải về.
  const current = await fetch(artifactUrl);
  const old = await fetch(`${artifactUrl}?v=1`);
  const raw = await fetch(`${artifactUrl}/raw`);
  if (!(await current.text()).includes("v2") || current.headers.get("x-artifact-version") !== "2") {
    throw new Error("bản hiện tại phải là v2");
  }
  if (!(await old.text()).includes("v1") || old.headers.get("x-artifact-version") !== "1") {
    throw new Error("?v=1 phải trả bản cũ");
  }
  if (!(raw.headers.get("content-disposition") ?? "").includes(`filename="${filename}"`) || !(await raw.text()).includes("v2")) {
    throw new Error("raw phải tải v2 kèm Content-Disposition");
  }
  ok("artifact serves current, ?v=1 history and raw download");

  // 7. Dashboard: badge v2 + lịch sử 2 version.
  await page.reload();
  const row = page.locator("tr", { hasText: filename });
  await row.getByRole("button", { name: "v2" }).click();
  const history = page.getByRole("heading", { name: "Version History" });
  await history.waitFor(WAIT);
  await page.getByText("Version 2").waitFor(WAIT);
  await page.getByText("Version 1").waitFor(WAIT);
  await page.getByRole("button", { name: "Close" }).click();
  ok("dashboard shows v2 and its version history");

  // 8. Artifact nhị phân (PNG) giải base64 về đúng bytes.
  const png = await apiUpload({
    filename: `${stamp}.png`,
    content: PNG_BASE64,
    contentType: "image/png",
    isBinary: true,
  });
  const pngResponse = await fetch(png.body.url);
  const pngBytes = Buffer.from(await pngResponse.arrayBuffer());
  if (pngResponse.headers.get("content-type") !== "image/png" || !pngBytes.equals(Buffer.from(PNG_BASE64, "base64"))) {
    throw new Error("PNG phục vụ không khớp bytes đã upload");
  }
  ok("binary artifact round-trips byte for byte");

  // 9. Xoá qua dashboard (confirm() được chấp nhận) -> link công khai thành 404.
  await page.reload();
  await page.locator("tr", { hasText: filename }).locator('button[title="Delete Artifact"]').click();
  await page.locator("tr", { hasText: filename }).waitFor({ state: "detached", timeout: WAIT.timeout });
  if ((await fetch(artifactUrl)).status !== 404) throw new Error("artifact đã xoá vẫn mở được");
  ok("delete from dashboard removes the artifact");
} catch (error) {
  failed += 1;
  console.log("FAIL:", error.message);
  await page.screenshot({ path: "e2e-failure.png" }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

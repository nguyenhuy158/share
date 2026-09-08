# Plan: Share (share.huyab.click)

Hệ thống chia sẻ Artifacts/Previews nhanh (HTML, Single-Page Apps, Markdown, Images, Text) tối ưu cho AI Agents (Claude Code, Cursor, Codex, MCP tools) và local sessions.

---

## 1. Mục tiêu & Pain Points giải quyết
- **Pain Point:** Sau khi AI code xong file HTML/mockup/prototype, dev mất nhiều thời gian cấu hình git/hosting chỉ để gửi link cho người khác xem hoặc mở trên điện thoại.
- **Giải pháp:**
  - AI đẩy file lên `share.huyab.click/api/upload` bằng 1 tool call bash/curl hoặc MCP skill.
  - Link preview public ngay lập tức: `https://share.huyab.click/artifact/<uuid>`.
  - Không cần tạo repo git, không cần build pipeline phức tạp, có gắn header `X-Robots-Tag: noindex, nofollow`.
  - Xác thực đẩy file qua `email` + `master password` tự cấu hình.
  - Dashboard web tích hợp SSO (`auth.huyab.click`) để quản lý file đã upload, xóa file, và cấu hình Master Password.

---

## 2. Kiến trúc Hệ thống

### A. Luồng người dùng & Agent
1. **Người dùng (Web UI):**
   - Truy cập `https://share.huyab.click/`.
   - Đăng nhập qua SSO Google OAuth (`https://auth.huyab.click/login?redirect_uri=...`).
   - Thiết lập **Master Password** một lần trên web (lưu dạng PBKDF2 salt + hash trong Cloudflare D1).
   - Xem bảng danh sách Artifacts đã upload: link public, thời gian, dung lượng, lượt xem, xóa artifact.
   - Nhận cheatsheet mẫu lệnh `curl`, biến môi trường, và file cấu hình Agent Skill.

2. **AI Agent / CLI Session (Local):**
   - Chạy lệnh upload qua API:
     - `POST https://share.huyab.click/api/upload`
     - Header hoặc body chứa: `email` + `password` (master password) + nội dung file.
   - API trả về:
     ```json
     {
       "id": "uuid",
       "url": "https://share.huyab.click/artifact/uuid",
       "rawUrl": "https://share.huyab.click/artifact/uuid/raw",
       "title": "Index Preview",
       "size": 15420,
       "contentType": "text/html"
     }
     ```

3. **Public Viewer:**
   - Truy cập `https://share.huyab.click/artifact/<uuid>`.
   - Server stream trực tiếp file HTML/SVG/ảnh với `Content-Type` chuẩn.
   - Trình duyệt hiển thị nguyên vẹn giao diện mà AI tạo ra.

---

## 3. Cấu trúc Kỹ thuật

- **Hosting & Runtime:** Cloudflare Workers (Fullstack với `@cloudflare/workers-types` + Hono + Vite Static Assets).
- **Database:** Cloudflare D1 (Database `db` dùng chung, ID: `6eb9cfce-f6f3-4476-8e46-7c8e954d93c1`).
  - `share_users`: Lưu thông tin user SSO và password hash + salt.
  - `share_artifacts`: Lưu artifact id, user_id, title, filename, content_type, size, content, views, created_at.
- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + Lucide React.
- **Custom Domain:** `share.huyab.click`.
- **SSO Integration:** Verifier JWT RS256 từ `https://auth.huyab.click/.well-known/jwks.json`, cookie `huyab_sso`.

---

## 4. Danh sách Endpoint API

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| `GET` | `/api/me` | Lấy thông tin session SSO hiện tại + trạng thái master password | SSO Cookie (`huyab_sso`) |
| `POST` | `/api/user/master-password` | Đặt hoặc thay đổi Master Password | SSO Cookie (`huyab_sso`) |
| `GET` | `/api/artifacts` | Lấy danh sách artifacts của user hiện tại | SSO Cookie (`huyab_sso`) |
| `DELETE` | `/api/artifacts/:id` | Xóa 1 artifact | SSO Cookie (`huyab_sso`) |
| `POST` | `/api/upload` | Upload artifact từ AI Agent / CLI | `email` + `password` (Master Password) |
| `GET` | `/artifact/:id` | Render trực tiếp file artifact ra trình duyệt | Public (No auth) |
| `GET` | `/artifact/:id/raw` | Download raw file content | Public (No auth) |

---

## 5. Agent Skills & Tooling
- `skills/share-artifact/SKILL.md`: Skill chuẩn cho Claude Code, Cursor, Codex.
- `scripts/share.sh`: Script CLI 1 dòng tiện lợi cho terminal hoặc agent execute bash.

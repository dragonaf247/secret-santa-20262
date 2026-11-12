# Secret Santa 2026 — Full-stack (Node.js + SheetDB)

## Có gì trong dự án?
- Frontend: HTML/CSS/JavaScript, giao diện Secret Santa, màn hình mở hộp quà và nhạc nền.
- Backend: Node.js + Express.
- Đăng ký/đăng nhập bằng email hoặc username.
- Mật khẩu được hash bằng bcryptjs (cost 12).
- Phiên đăng nhập dùng JWT trong cookie HttpOnly, SameSite=Lax; Secure bật khi production.
- User mới luôn được gán `role=user` ở backend.
- Admin ban đầu được tạo từ biến môi trường, không thể tự đăng ký Admin.
- User chỉ đọc đăng ký của chính mình.
- Admin xem danh sách user, thông tin riêng và đăng ký Secret Santa.
- SheetDB API ID/token chỉ nằm ở backend, không đưa vào frontend.

## 1. Chuẩn bị Google Sheets
Tạo một Google Spreadsheet có 3 tab. Dòng đầu tiên mỗi tab phải là các cột sau, đúng tên:

**Users**
`user_id | username | email | password_hash | role | full_name | status | created_at`

**Registrations**
`registration_id | user_id | thoigian | hoten | phongban | wishlist | blacklist | status`

**Admins**
`admin_id | user_id | admin_note | created_at`

Lưu ý:
- Không nhập mật khẩu thật vào `password_hash`. Backend tự hash khi tạo tài khoản.
- Không cấp role admin cho user tự đăng ký.
- `phongban` được để trống trong bản này để giữ tên trường tương thích dữ liệu đăng ký cũ. Không lưu ảnh Base64 lớn trong Sheets.

## 2. Tạo SheetDB
1. Mở https://sheetdb.io/ và tạo API kết nối đến Google Spreadsheet ở trên.
2. Copy API ID từ URL API.
3. Nếu tài khoản hỗ trợ, bật Bearer Token trong cấu hình SheetDB và copy token.
4. Trong quyền API, bật ít nhất Read, Search và Create cho các sheet cần dùng. Chỉ cấp đúng quyền cần thiết.
5. Không đưa API ID/token vào `public/app.js`; chỉ điền trong `.env` trên server.

Tài liệu chính thức:
- https://docs.sheetdb.io/
- Search: https://docs.sheetdb.io/sheetdb-api/search
- Create: https://docs.sheetdb.io/sheetdb-api/create

## 3. Chạy local trên Windows
Cài Node.js 20 trở lên: https://nodejs.org/

Mở terminal tại thư mục dự án:
```powershell
npm install
Copy-Item .env.example .env
```

Mở `.env`, điền:
- `SHEETDB_API_ID`
- `SHEETDB_API_TOKEN` (nếu đã bật Bearer Token; nếu không thì để trống)
- `JWT_SECRET` (chuỗi ngẫu nhiên dài tối thiểu 32 ký tự)
- `APP_ORIGIN=http://localhost:3000`
- `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`

Tạo secret ngẫu nhiên nhanh bằng PowerShell:
```powershell
-join ((1..48) | ForEach-Object { [char](Get-Random -Minimum 33 -Maximum 127) })
```

Chạy:
```powershell
npm run dev
```
Mở http://localhost:3000

Lần đầu server chạy, backend tự tạo admin từ `.env` vào hai sheet Users và Admins. Dùng email/username và mật khẩu đó để đăng nhập. Nếu email đã tồn tại trong Users, hãy kiểm tra role của dòng đó trước; server sẽ không tự nâng quyền một user có sẵn thành admin.

## 4. Đưa code lên GitHub
1. Giải nén ZIP.
2. Mở thư mục `secret-santa-2026`.
3. Không upload file `.env` (chỉ upload `.env.example`).
4. Tạo repository GitHub và push toàn bộ thư mục.
5. Không commit `node_modules`.

Lệnh Git:
```bash
git init
git add .
git commit -m "Initial Secret Santa 2026 full-stack app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

## 5. Deploy backend
GitHub Pages chỉ host static files, không chạy được Express. Dùng Render, Railway hoặc VPS có Node.js.

Ví dụ cấu hình host:
- Build command: `npm install`
- Start command: `npm start`
- Runtime: Node.js 20+
- Environment variables: nhập các biến tương tự `.env` trong Dashboard của host.
- Khi đã có domain HTTPS: đặt `NODE_ENV=production`, `APP_ORIGIN=https://your-domain.example`.
- Không commit `.env` lên GitHub.

## 6. Kiểm tra
- Mở `/api/health`: trả `{ "ok": true, ... }`.
- Đăng ký tài khoản mới: role phải là `user`.
- Đăng nhập user rồi gọi `/api/admin/overview`: phải trả HTTP 403.
- User xem `/api/user/registrations`: chỉ thấy đăng ký của chính mình.
- Đăng nhập Admin: xem được bảng điều khiển.
- Đăng xuất: API cần đăng nhập phải trả HTTP 401.

## 7. Giới hạn và bảo mật
- Đây là starter project chạy cùng origin (frontend và backend cùng domain). Không tách frontend ra GitHub Pages nếu vẫn dùng cookie phiên như cấu hình này.
- SheetDB/Google Sheets phù hợp website sự kiện nhỏ hoặc demo. Nó không phải database giao dịch; kiểm tra trùng đăng ký qua Sheets không bảo đảm chống được hai request đồng thời. Với lượng người dùng lớn, nên dùng PostgreSQL cho tài khoản/đăng ký.
- Bản hiện tại chưa có xác minh email, quên mật khẩu, upload ảnh, chỉnh sửa hồ sơ, khóa user qua UI hay cấp thêm admin qua UI.
- Admin đầu tiên được bootstrap bằng `.env`. Đổi mật khẩu mặc định trước khi deploy thật.

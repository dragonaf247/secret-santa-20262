import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { db } from "./sheetdb.js";
import { clearSession, issueSession, publicUser, requireAdmin, requireAuth } from "./auth.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === "production";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET phải dài ít nhất 32 ký tự.");
}
if (!process.env.SHEETDB_API_ID || process.env.SHEETDB_API_ID === "YOUR_SHEETDB_API_ID") {
  throw new Error("Hãy điền SHEETDB_API_ID trong .env.");
}

app.disable("x-powered-by");
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      mediaSrc: ["'self'", "https://raw.githubusercontent.com"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(express.static("public"));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Bạn thử quá nhiều lần. Vui lòng đợi 15 phút." }
});

// Same-origin check for cookie-authenticated write requests.
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");
    const expected = process.env.APP_ORIGIN;
    if (origin && expected && origin !== expected) {
      return res.status(403).json({ error: "Nguồn gửi yêu cầu không hợp lệ." });
    }
  }
  next();
});

const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function bootstrapAdmin() {
  const email = clean(process.env.ADMIN_EMAIL, 160).toLowerCase();
  const username = clean(process.env.ADMIN_USERNAME, 40);
  const password = process.env.ADMIN_PASSWORD || "";
  if (!validEmail(email) || !username || password.length < 12) {
    throw new Error("Cấu hình ADMIN_EMAIL, ADMIN_USERNAME và ADMIN_PASSWORD (tối thiểu 12 ký tự) trong .env.");
  }

  const existing = await db.find("Users", "email", email);
  if (existing.length) {
    if (existing[0].role !== "admin") {
      throw new Error("ADMIN_EMAIL đã có trong Users nhưng role chưa phải admin. Kiểm tra Google Sheets.");
    }
    return;
  }

  if ((await db.find("Users", "username", username)).length) {
    throw new Error("ADMIN_USERNAME đã tồn tại. Chọn username khác trong .env.");
  }

  const id = randomUUID();
  const row = {
    user_id: id,
    username,
    email,
    password_hash: await bcrypt.hash(password, 12),
    role: "admin",
    full_name: clean(process.env.ADMIN_FULL_NAME || "Secret Santa Admin", 100),
    status: "active",
    created_at: new Date().toISOString()
  };
  await db.insert("Users", row);
  await db.insert("Admins", {
    admin_id: randomUUID(),
    user_id: id,
    admin_note: "Tài khoản quản trị được khởi tạo từ biến môi trường",
    created_at: new Date().toISOString()
  });
  console.log("Đã tạo tài khoản Admin ban đầu.");
}

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Secret Santa 2026" }));

app.post("/api/auth/register", authLimiter, async (req, res, next) => {
  try {
    const username = clean(req.body.username, 40);
    const email = clean(req.body.email, 160).toLowerCase();
    const fullName = clean(req.body.full_name, 100);
    const password = String(req.body.password || "");

    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) {
      return res.status(400).json({ error: "Username cần 3–40 ký tự, gồm chữ, số, _, . hoặc -." });
    }
    if (!validEmail(email)) return res.status(400).json({ error: "Email không hợp lệ." });
    if (fullName.length < 2) return res.status(400).json({ error: "Vui lòng nhập họ tên." });
    if (password.length < 10 || password.length > 72) {
      return res.status(400).json({ error: "Mật khẩu phải từ 10 đến 72 ký tự." });
    }

    const [emailRows, usernameRows] = await Promise.all([
      db.find("Users", "email", email),
      db.find("Users", "username", username)
    ]);
    if (emailRows.length) return res.status(409).json({ error: "Email đã được sử dụng." });
    if (usernameRows.length) return res.status(409).json({ error: "Username đã tồn tại." });

    const user = {
      user_id: randomUUID(),
      username,
      email,
      password_hash: await bcrypt.hash(password, 12),
      role: "user", // Do not accept role from the client.
      full_name: fullName,
      status: "active",
      created_at: new Date().toISOString()
    };
    await db.insert("Users", user);
    issueSession(res, user.user_id);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post("/api/auth/login", authLimiter, async (req, res, next) => {
  try {
    const identifier = clean(req.body.identifier, 160).toLowerCase();
    const password = String(req.body.password || "");
    if (!identifier || !password) {
      return res.status(400).json({ error: "Nhập email/username và mật khẩu." });
    }

    let rows = await db.find("Users", "email", identifier);
    if (!rows.length) rows = await db.find("Users", "username", identifier);
    const user = rows[0];

    if (!user || user.status !== "active" ||
        !(await bcrypt.compare(password, user.password_hash || ""))) {
      return res.status(401).json({ error: "Thông tin đăng nhập không chính xác." });
    }
    issueSession(res, user.user_id);
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post("/api/auth/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// User may only read their own registration rows.
app.get("/api/user/registrations", requireAuth, async (req, res, next) => {
  try {
    const rows = await db.find("Registrations", "user_id", req.user.user_id);
    res.json({ registrations: rows });
  } catch (error) { next(error); }
});

app.post("/api/registrations", requireAuth, async (req, res, next) => {
  try {
    const wishlist = clean(req.body.wishlist, 1200);
    const blacklist = clean(req.body.blacklist, 1200);
    if (!wishlist || !blacklist) {
      return res.status(400).json({ error: "Wishlist và Blacklist không được để trống." });
    }
    const existing = await db.find("Registrations", "user_id", req.user.user_id);
    if (existing.length) return res.status(409).json({ error: "Bạn đã đăng ký Secret Santa." });

    const row = {
      registration_id: randomUUID(),
      user_id: req.user.user_id,
      thoigian: new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
      hoten: req.user.full_name,
      phongban: "",
      wishlist,
      blacklist,
      status: "submitted"
    };
    await db.insert("Registrations", row);
    res.status(201).json({ registration: row });
  } catch (error) { next(error); }
});

// Admin-only endpoints. No password_hash is ever returned.
app.get("/api/admin/overview", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [users, registrations, admins] = await Promise.all([
      db.all("Users"),
      db.all("Registrations"),
      db.all("Admins")
    ]);
    res.json({
      users: users.map(publicUser),
      registrations,
      admins
    });
  } catch (error) { next(error); }
});

app.get("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rows = await db.find("Users", "user_id", clean(req.params.id, 80));
    if (!rows.length) return res.status(404).json({ error: "Không tìm thấy người dùng." });
    const registrations = await db.find("Registrations", "user_id", rows[0].user_id);
    res.json({ user: publicUser(rows[0]), registrations });
  } catch (error) { next(error); }
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API không tồn tại." }));
app.use((error, _req, res, _next) => {
  console.error("[API]", error.message);
  const status = error.status && error.status < 500 ? error.status : 500;
  res.status(status).json({
    error: production ? "Máy chủ gặp lỗi. Vui lòng thử lại." : error.message
  });
});

await bootstrapAdmin();
app.listen(PORT, () => console.log(`Secret Santa chạy tại http://localhost:${PORT}`));

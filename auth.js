import jwt from "jsonwebtoken";
import { db } from "./sheetdb.js";

const COOKIE = "ss2026_session";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/"
};

export function issueSession(res, userId) {
  const token = jwt.sign(
    { sub: userId },
    process.env.JWT_SECRET,
    { expiresIn: "8h", issuer: "secret-santa-2026" }
  );
  res.cookie(COOKIE, token, { ...COOKIE_OPTIONS, maxAge: 8 * 60 * 60 * 1000 });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, COOKIE_OPTIONS);
}

export function publicUser(user) {
  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    status: user.status,
    created_at: user.created_at
  };
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: "Bạn cần đăng nhập." });

    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "secret-santa-2026"
    });
    const matches = await db.find("Users", "user_id", payload.sub);
    const user = matches[0];

    if (!user || user.status !== "active") {
      clearSession(res);
      return res.status(401).json({ error: "Tài khoản không tồn tại hoặc đã bị khóa." });
    }

    // Always read role from the server-side data store; never trust a browser-supplied role.
    req.user = user;
    next();
  } catch (error) {
    if (["JsonWebTokenError", "TokenExpiredError"].includes(error.name)) {
      clearSession(res);
      return res.status(401).json({ error: "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại." });
    }
    next(error);
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Bạn không có quyền truy cập khu vực Admin." });
  }
  next();
}

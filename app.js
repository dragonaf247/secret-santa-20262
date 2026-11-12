const $ = (s) => document.querySelector(s);
let adminData = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Có lỗi xảy ra.");
  return data;
}
function message(el, text, ok = false) {
  el.textContent = text;
  el.classList.toggle("success", ok);
}
function setBusy(form, busy) {
  const button = form.querySelector('button[type="submit"],button:not([type])');
  if (!button) return;
  if (busy) { button.dataset.label = button.textContent; button.disabled = true; button.textContent = "Đang xử lý..."; }
  else { button.disabled = false; button.textContent = button.dataset.label || button.textContent; }
}
function view(name) {
  $("#authView").classList.toggle("hidden", name !== "auth");
  $("#userView").classList.toggle("hidden", name !== "user");
  $("#adminView").classList.toggle("hidden", name !== "admin");
}
function tab(name) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  $("#loginForm").classList.toggle("hidden", name !== "login");
  $("#registerForm").classList.toggle("hidden", name !== "register");
  message($("#authMessage"), "");
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => tab(b.dataset.tab)));

async function enter(user) {
  $("#navUser").textContent = `${user.full_name} · ${user.role}`;
  $("#logoutButton").classList.remove("hidden");
  if (user.role === "admin") {
    view("admin");
    await loadAdmin();
  } else {
    view("user");
    $("#welcomeName").textContent = user.full_name;
    await loadMyRegistrations();
  }
}
async function loadMe() {
  try { const data = await api("/api/auth/me"); await enter(data.user); }
  catch { $("#navUser").textContent = ""; $("#logoutButton").classList.add("hidden"); view("auth"); }
}

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget; setBusy(form, true); message($("#authMessage"), "");
  try {
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset(); await enter(data.user);
  } catch (err) { message($("#authMessage"), err.message); }
  finally { setBusy(form, false); }
});

$("#registerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget; setBusy(form, true); message($("#authMessage"), "");
  try {
    const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset(); await enter(data.user);
  } catch (err) { message($("#authMessage"), err.message); }
  finally { setBusy(form, false); }
});

$("#logoutButton").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch {}
  $("#logoutButton").classList.add("hidden"); $("#navUser").textContent = "";
  view("auth"); tab("login");
});

async function loadMyRegistrations() {
  try {
    const { registrations } = await api("/api/user/registrations");
    const host = $("#myRegistrations"); host.replaceChildren();
    if (!registrations.length) {
      host.textContent = "Bạn chưa gửi đăng ký Secret Santa.";
      $("#registrationForm").classList.remove("hidden");
      return;
    }
    $("#registrationForm").classList.add("hidden");
    registrations.forEach(item => {
      const box = document.createElement("div"); box.className = "record";
      const title = document.createElement("strong"); title.textContent = `Đã gửi đăng ký · ${item.thoigian || ""}`;
      const wish = document.createElement("p"); wish.textContent = `🎁 Wishlist: ${item.wishlist || ""}`;
      const avoid = document.createElement("p"); avoid.textContent = `🚫 Blacklist: ${item.blacklist || ""}`;
      box.append(title, wish, avoid); host.append(box);
    });
  } catch (err) { $("#myRegistrations").textContent = err.message; }
}
$("#registrationForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget; setBusy(form, true); message($("#registrationMessage"), "");
  try {
    await api("/api/registrations", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    message($("#registrationMessage"), "Đăng ký thành công! 🎉", true);
    form.reset(); await loadMyRegistrations();
  } catch (err) { message($("#registrationMessage"), err.message); }
  finally { setBusy(form, false); }
});

async function loadAdmin() {
  try {
    adminData = await api("/api/admin/overview");
    $("#statUsers").textContent = adminData.users.length;
    $("#statRegs").textContent = adminData.registrations.length;
    $("#statAdmins").textContent = adminData.admins.length;
    renderUsers(adminData.users);
    renderRegistrations(adminData.registrations);
  } catch (err) { message($("#adminMessage"), err.message); }
}
function renderUsers(users) {
  const body = $("#usersTable"); body.replaceChildren();
  users.forEach(user => {
    const tr = document.createElement("tr");
    [user.full_name, user.username, user.email, user.role, user.status, user.created_at].forEach(value => {
      const td = document.createElement("td"); td.textContent = value || ""; tr.append(td);
    });
    const td = document.createElement("td");
    const button = document.createElement("button"); button.className = "link-btn"; button.textContent = "Chi tiết";
    button.addEventListener("click", () => userDetails(user.user_id));
    td.append(button); tr.append(td); body.append(tr);
  });
}
function renderRegistrations(rows) {
  const body = $("#registrationsTable"); body.replaceChildren();
  rows.forEach(row => {
    const tr = document.createElement("tr");
    [row.hoten, row.thoigian, row.wishlist, row.blacklist, row.status].forEach(value => {
      const td = document.createElement("td"); td.textContent = value || ""; tr.append(td);
    });
    body.append(tr);
  });
}
$("#userSearch").addEventListener("input", e => {
  if (!adminData) return;
  const q = e.target.value.toLowerCase();
  renderUsers(adminData.users.filter(u => [u.full_name, u.username, u.email].some(v => String(v || "").toLowerCase().includes(q))));
});
async function userDetails(id) {
  const host = $("#userDetail"); host.textContent = "Đang tải...";
  $("#userDialog").showModal();
  try {
    const data = await api(`/api/admin/users/${encodeURIComponent(id)}`);
    host.replaceChildren();
    const h = document.createElement("h3"); h.textContent = "Thông tin người dùng"; host.append(h);
    [["Họ tên", data.user.full_name], ["Username", data.user.username], ["Email", data.user.email],
     ["Vai trò", data.user.role], ["Trạng thái", data.user.status], ["Ngày tạo", data.user.created_at]]
      .forEach(([label, value]) => { const p = document.createElement("p"); p.textContent = `${label}: ${value || ""}`; host.append(p); });
    const rh = document.createElement("h3"); rh.textContent = `Đăng ký Secret Santa (${data.registrations.length})`; host.append(rh);
    data.registrations.forEach(r => {
      const p = document.createElement("p"); p.className = "record";
      p.textContent = `Wishlist: ${r.wishlist || ""} | Blacklist: ${r.blacklist || ""}`; host.append(p);
    });
  } catch (err) { host.textContent = err.message; }
}
$("#userDialog").addEventListener("click", e => { if (e.target === $("#userDialog")) $("#userDialog").close(); });

// Music only starts after the visitor clicks the gift button, as browsers block autoplay.
const music = $("#bgMusic"); let musicOn = true;
$("#startButton").addEventListener("click", async () => {
  $("#startOverlay").style.opacity = "0";
  setTimeout(() => $("#startOverlay").classList.add("hidden"), 500);
  if (musicOn) {
    music.volume = 0.45;
    try { await music.play(); $("#musicToggle").textContent = "🔊 Nhạc: Bật"; }
    catch { $("#musicToggle").textContent = "⚠️ Không phát được"; }
  }
});
$("#musicToggle").addEventListener("click", async () => {
  musicOn = !musicOn;
  if (musicOn) {
    try { await music.play(); $("#musicToggle").textContent = "🔊 Nhạc: Bật"; }
    catch { musicOn = false; $("#musicToggle").textContent = "🔇 Nhạc: Tắt"; }
  } else {
    music.pause(); $("#musicToggle").textContent = "🔇 Nhạc: Tắt";
  }
});

loadMe();

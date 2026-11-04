// Accounts for login.html / register.html. There is no backend yet: users are kept in a small
// SQLite database (sql.js) saved to this browser's localStorage. Passwords are never stored —
// only a salted PBKDF2-SHA256 hash of them.

const AUTH_DB_KEY = "users_db_v1";
const SESSION_KEY = "auth_user";
const PBKDF2_ITERATIONS = 210000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

// ---------- Field checks (return an error message, or "" when the value is fine) ----------
const USERNAME_RE = /^[A-Za-z0-9._-]+$/;
function validateUsername(u) {
  u = String(u ?? "").trim();
  if (!u) return "Vui lòng nhập tên đăng nhập.";
  if (u.length < 3 || u.length > 32)
    return "Tên đăng nhập phải dài từ 3 đến 32 ký tự.";
  if (!USERNAME_RE.test(u))
    return "Tên đăng nhập chỉ gồm chữ không dấu, số và các ký tự . _ -";
  if (!/^[A-Za-z]/.test(u)) return "Tên đăng nhập phải bắt đầu bằng một chữ cái.";
  return "";
}
function validatePassword(p, username = "") {
  p = String(p ?? "");
  if (!p) return "Vui lòng nhập mật khẩu.";
  if (p.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự.";
  if (p.length > 64) return "Mật khẩu không được dài quá 64 ký tự.";
  if (/^\s|\s$/.test(p)) return "Mật khẩu không được bắt đầu hoặc kết thúc bằng khoảng trắng.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p))
    return "Mật khẩu phải có cả chữ cái và chữ số.";
  if (username && p.toLowerCase() === String(username).trim().toLowerCase())
    return "Mật khẩu không được trùng với tên đăng nhập.";
  return "";
}

// ---------- Hashing ----------
// byte array <-> base64, in chunks so a large database doesn't overflow the call stack
function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function hashPassword(password, saltB64, iterations = PBKDF2_ITERATIONS) {
  if (!globalThis.crypto?.subtle)
    throw new Error("Trình duyệt không hỗ trợ mã hoá (Web Crypto).");
  const salt = saltB64
    ? fromB64(saltB64)
    : crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password).normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BITS,
  );
  return { salt: toB64(salt), hash: toB64(new Uint8Array(bits)), iterations };
}
// compares every character so the time taken doesn't reveal where the hashes differ
function sameHash(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function verifyPassword(password, rec) {
  const { hash } = await hashPassword(password, rec.salt, rec.iterations);
  return sameHash(hash, rec.hash);
}

// ---------- User store (sql.js database kept in localStorage) ----------
// Default account "admin" / "admin", added to every user database. Only the PBKDF2 hash of
// the password is in this file; it is exempt from the register-time password rules.
const DEFAULT_USER = {
  username: "admin",
  salt: "stVvn/2PLNRs/A8iLJVaRA==",
  hash: "G1ZQ59N24OeDukj9jvERyLwZ6Xpnvi6/WByYAOV8Rm4=",
  iterations: 210000,
};
function openUserDb(SQL) {
  let saved = null;
  try {
    saved = localStorage.getItem(AUTH_DB_KEY);
  } catch (e) {}
  const udb = saved ? new SQL.Database(fromB64(saved)) : new SQL.Database();
  udb.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    iterations INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // built-in account, present in every browser (kept as a hash like any other user)
  udb.run(
    "INSERT OR IGNORE INTO users (username, password_hash, salt, iterations) VALUES (?, ?, ?, ?)",
    [DEFAULT_USER.username, DEFAULT_USER.hash, DEFAULT_USER.salt, DEFAULT_USER.iterations],
  );
  return udb;
}
function saveUserDb(udb) {
  localStorage.setItem(AUTH_DB_KEY, toB64(udb.export()));
}
function findUser(udb, username) {
  const st = udb.prepare(
    "SELECT username, password_hash AS hash, salt, iterations FROM users WHERE username = ?",
  );
  try {
    st.bind([String(username).trim()]);
    return st.step() ? st.getAsObject() : null;
  } finally {
    st.free();
  }
}

// Both return { ok: true, username } or { ok: false, field, error }
async function registerUser(udb, username, password, confirm) {
  username = String(username ?? "").trim();
  let error = validateUsername(username);
  if (error) return { ok: false, field: "username", error };
  error = validatePassword(password, username);
  if (error) return { ok: false, field: "password", error };
  if (password !== confirm)
    return { ok: false, field: "confirm", error: "Mật khẩu nhập lại không khớp." };
  if (findUser(udb, username))
    return { ok: false, field: "username", error: "Tên đăng nhập đã tồn tại." };
  const h = await hashPassword(password);
  udb.run(
    "INSERT INTO users (username, password_hash, salt, iterations) VALUES (?, ?, ?, ?)",
    [username, h.hash, h.salt, h.iterations],
  );
  saveUserDb(udb);
  return { ok: true, username };
}

// A dummy record so an unknown username takes as long to reject as a wrong password
const DUMMY_USER = {
  salt: "AAAAAAAAAAAAAAAAAAAAAA==",
  hash: "",
  iterations: PBKDF2_ITERATIONS,
};
async function loginUser(udb, username, password) {
  username = String(username ?? "").trim();
  if (!username)
    return { ok: false, field: "username", error: "Vui lòng nhập tên đăng nhập." };
  if (!password)
    return { ok: false, field: "password", error: "Vui lòng nhập mật khẩu." };
  const rec = findUser(udb, username);
  const ok = await verifyPassword(password, rec || DUMMY_USER);
  if (!rec || !ok)
    return { ok: false, field: "password", error: "Sai tên đăng nhập hoặc mật khẩu." };
  return { ok: true, username: rec.username };
}

// ---------- Session (this browser tab only) ----------
function startSession(username) {
  sessionStorage.setItem(SESSION_KEY, username);
}

// ---------- Page wiring shared by login.html and register.html ----------
// Loads sql.js (WebAssembly, falling back to asm.js) and opens the user database
const AUTH_SQL_CDN = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/";
function loadUserDb() {
  return initSqlJs({ locateFile: (f) => AUTH_SQL_CDN + f })
    .catch(
      () =>
        new Promise((ok, fail) => {
          const s = document.createElement("script");
          s.src = AUTH_SQL_CDN + "sql-asm.js";
          s.onload = () => initSqlJs().then(ok, fail);
          s.onerror = fail;
          document.head.appendChild(s);
        }),
    )
    .then(openUserDb);
}

// Hooks up an auth form: `submit(udb, values)` returns the result of registerUser / loginUser
function wireAuthForm(form, submit) {
  const msg = form.querySelector(".msg"),
    btn = form.querySelector("button[type=submit]"),
    label = btn.textContent;
  const show = (text, kind = "er") => {
    msg.textContent = text;
    msg.className = "msg " + kind;
    msg.hidden = !text;
  };
  const clearMarks = () =>
    form.querySelectorAll("input").forEach((i) => i.removeAttribute("aria-invalid"));
  form.addEventListener("input", () => {
    clearMarks();
    show("");
  });

  let udb = null;
  btn.disabled = true;
  btn.textContent = "Đang tải...";
  loadUserDb()
    .then((d) => {
      udb = d;
      btn.disabled = false;
      btn.textContent = label;
    })
    .catch((e) => {
      btn.textContent = label;
      show("Không tải được thư viện SQLite (cần kết nối mạng lần đầu): " + e);
    });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!udb) return;
    clearMarks();
    show("");
    const values = Object.fromEntries(new FormData(form));
    btn.disabled = true;
    btn.textContent = "Đang xử lý...";
    try {
      const r = await submit(udb, values);
      if (r.ok) return startSession(r.username), location.replace("index.html");
      const f = form.elements[r.field];
      if (f) f.setAttribute("aria-invalid", "true"), f.focus();
      show(r.error);
    } catch (err) {
      show("Có lỗi xảy ra: " + (err.message || err));
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}

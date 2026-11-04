// Checks the login / register field rules, password hashing and the user store logic.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => (store[k] = String(v)),
};
const auth = new Function(
  fs.readFileSync(path.join(__dirname, "..", "js/auth.js"), "utf8") +
    "\nreturn { validateUsername, validatePassword, hashPassword, verifyPassword, registerUser, loginUser, AUTH_DB_KEY, DEFAULT_USER };",
)();

// fake sql.js database: just enough of prepare / run / export for the users table
function fakeDb() {
  const rows = [];
  return {
    rows,
    run: (sql, p) => {
      if (/^INSERT/.test(sql))
        rows.push({ username: p[0], hash: p[1], salt: p[2], iterations: p[3] });
    },
    prepare: () => {
      let key, hit;
      return {
        bind: (p) => (key = p[0].toLowerCase()),
        step: () => !!(hit = rows.find((r) => r.username.toLowerCase() === key)),
        getAsObject: () => ({ ...hit }),
        free: () => {},
      };
    },
    export: () => new Uint8Array([1, 2, 3]),
  };
}

test("validateUsername", () => {
  assert.strictEqual(auth.validateUsername("bacsi.an_01"), "");
  assert.strictEqual(auth.validateUsername("  admin  "), "");
  assert.match(auth.validateUsername(""), /nhập tên/);
  assert.match(auth.validateUsername("ab"), /3 đến 32/);
  assert.match(auth.validateUsername("a".repeat(33)), /3 đến 32/);
  assert.match(auth.validateUsername("nguyễn"), /không dấu/);
  assert.match(auth.validateUsername("có cách"), /không dấu/);
  assert.match(auth.validateUsername("1abc"), /bắt đầu/);
});

test("validatePassword", () => {
  assert.strictEqual(auth.validatePassword("matkhau123"), "");
  assert.match(auth.validatePassword(""), /nhập mật khẩu/);
  assert.match(auth.validatePassword("abc123"), /ít nhất 8/);
  assert.match(auth.validatePassword("a1".repeat(33)), /64/);
  assert.match(auth.validatePassword("abcdefgh"), /chữ cái và chữ số/);
  assert.match(auth.validatePassword("12345678"), /chữ cái và chữ số/);
  assert.match(auth.validatePassword(" matkhau123"), /khoảng trắng/);
  assert.match(auth.validatePassword("Admin123", "admin123"), /trùng/);
});

test("hashPassword salts every hash and verifyPassword checks it", async () => {
  const a = await auth.hashPassword("matkhau123");
  const b = await auth.hashPassword("matkhau123");
  assert.notStrictEqual(a.salt, b.salt);
  assert.notStrictEqual(a.hash, b.hash);
  assert.ok(!a.hash.includes("matkhau123"));
  assert.ok(await auth.verifyPassword("matkhau123", a));
  assert.ok(!(await auth.verifyPassword("matkhau124", a)));
});

test("registerUser stores only a hash, and loginUser checks it", async () => {
  const db = fakeDb();
  let r = await auth.registerUser(db, " bacsi01 ", "matkhau123", "matkhau123");
  assert.deepStrictEqual(r, { ok: true, username: "bacsi01" });
  assert.strictEqual(db.rows.length, 1);
  assert.ok(!JSON.stringify(db.rows).includes("matkhau123"));
  assert.ok(store[auth.AUTH_DB_KEY], "database saved to localStorage");

  r = await auth.registerUser(db, "BACSI01", "matkhau456", "matkhau456");
  assert.strictEqual(r.field, "username");
  assert.match(r.error, /đã tồn tại/);
  r = await auth.registerUser(db, "bacsi02", "matkhau123", "matkhau12");
  assert.strictEqual(r.field, "confirm");
  r = await auth.registerUser(db, "bacsi02", "short1", "short1");
  assert.strictEqual(r.field, "password");

  assert.deepStrictEqual(await auth.loginUser(db, "Bacsi01", "matkhau123"), {
    ok: true,
    username: "bacsi01",
  });
  const wrong = await auth.loginUser(db, "bacsi01", "sai12345");
  const unknown = await auth.loginUser(db, "khongco", "matkhau123");
  assert.strictEqual(wrong.ok, false);
  // same message either way, so it doesn't reveal which usernames exist
  assert.strictEqual(wrong.error, unknown.error);
});

test("default admin account logs in with admin / admin", async () => {
  const db = fakeDb();
  db.rows.push({ ...auth.DEFAULT_USER });
  assert.deepStrictEqual(await auth.loginUser(db, "admin", "admin"), { ok: true, username: "admin" });
  assert.strictEqual((await auth.loginUser(db, "admin", "admin1")).ok, false);
  const r = await auth.registerUser(db, "Admin", "matkhau123", "matkhau123");
  assert.match(r.error, /đã tồn tại/);
});

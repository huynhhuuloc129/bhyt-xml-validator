// Run from the project folder with: node --test
// Checks the Access → SQLite conversion and the Access functions registered on SQLite.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

// Load the browser scripts (plain globals) into one function scope
const load = (...files) =>
  new Function(
    files.map((f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8")).join("\n") +
      "\nreturn { accessCriteria, a2s, fnRen, fixDots, regFns, fmt, fmtDate, isDateCol, isDurationCol, timesPerDay, isXmlDateTime, fmtXmlDateTimes };",
  )();
const { accessCriteria, a2s, fnRen, fixDots, regFns, fmt, fmtDate, isDateCol, isDurationCol, timesPerDay, isXmlDateTime, fmtXmlDateTimes } = load("js/utils.js", "js/access-convert.js", "js/access-functions.js");
const fn = {};
regFns({ create_function: (name, f) => (fn[name] = f) });

test("a2s converts Access syntax", () => {
  assert.strictEqual(
    a2s('SELECT TOP 5 [a] & "x" FROM [T] WHERE b LIKE "a*?" AND d > #2024-01-02#;'),
    `SELECT "a" || 'x' FROM "T" WHERE b LIKE 'a%_' AND d > CDate('2024-01-02') LIMIT 5`,
  );
  assert.strictEqual(a2s("SELECT Nz(a,0), Mid(b,1,2), Left(c,3) FROM t"), "SELECT coalesce(a,0), substr(b,1,2), xLeft(c,3) FROM t");
});

test("fnRen + fixDots prepare rules for SQLite", () => {
  assert.strictEqual(fnRen("Left$(a,1) Mod 2, IsNull(b), Format(c,'x'), Int(d)"), "xLeft(a,1) % 2, xIsNull(b), xFormat(c,'x'), xInt(d)");
  assert.strictEqual(fixDots(`a.b.c, "x.y".z, 'q.w.e'`), `a.c, x.z, 'q.w.e'`);
});

test("fmt formats dates from Excel", () => {
  assert.strictEqual(fmt(new Date(Date.UTC(2024, 0, 2))), "2024-01-02");
  assert.strictEqual(fmt(new Date(Date.UTC(2024, 0, 2, 3, 4, 5))), "2024-01-02 03:04:05");
  assert.strictEqual(fmt("abc"), "abc");
});

test("fmtDate shows XML text and Access serials the same way", () => {
  assert.strictEqual(fmtDate("202610102206"), "2026-10-10 22:06:00");
  assert.strictEqual(fmtDate(46305.92361111111), "2026-10-10 22:10:00");
  assert.strictEqual(fmtDate("20261010"), "2026-10-10");
  assert.strictEqual(fmtDate(202610111048), "2026-10-11 10:48:00"); // number cell in the xlsx
  assert.strictEqual(fmtDate(2.0833333333333335), 2.0833333333333335); // duration in hours
  assert.strictEqual(fmtDate("abc"), "abc");
  assert.ok(isDateCol("NGAY_VAO") && isDateCol("GioRaVien") && isDateCol("NgayKT_Oxy"));
  assert.ok(isXmlDateTime("202610071200") && isXmlDateTime(20261007120030));
  assert.ok(!isXmlDateTime("079090001234") && !isXmlDateTime("202613071200") && !isXmlDateTime("3916459"));
  assert.strictEqual(
    fmtXmlDateTimes("YL 202610071200 - 202610081230; the 079090001234"),
    "YL 2026-10-07 12:00:00 - 2026-10-08 12:30:00; the 079090001234",
  );
  assert.ok(!isDateCol("GIOI_TINH") && !isDateCol("SO_LUONG"));
});

test("a date-named column of minutes is a duration, not dates", () => {
  // DAUVAO: TIME = DateDiff('n', NGAY_VAO, NGAY_RA); 14412 minutes must not become 1939-06-16
  assert.ok(isDurationCol([[14412], [491], [242]], 0));
  assert.ok(!isDurationCol([[46305.92361111111], ["202610102206"], [202610111048], [null]], 0));
});

test("date functions accept all supported input formats", () => {
  for (const v of ["2024-03-15", "20240315", "15/03/2024", "2024-03-15 10:20:30"]) {
    assert.strictEqual(fn.Year(v), 2024, v);
    assert.strictEqual(fn.Month(v), 3, v);
    assert.strictEqual(fn.Day(v), 15, v);
  }
  assert.strictEqual(fn.IsDate("abc"), 0);
  assert.strictEqual(fn.Year(null), null);
});

test("DateDiff / DateAdd / DatePart", () => {
  assert.strictEqual(fn.DateDiff("d", "2024-01-01", "2024-03-01"), 60);
  assert.strictEqual(fn.DateDiff("m", "2024-01-31", "2024-03-01"), 2);
  assert.strictEqual(fn.DateDiff("h", "2024-01-01 00:00", "2024-01-02 06:00"), 30);
  assert.strictEqual(fn.DateAdd("m", 1, "2024-01-15"), fn.CDate("2024-02-15"));
  assert.strictEqual(fn.DatePart("q", "2024-08-01"), 3);
  assert.strictEqual(fn.DatePart("y", "2024-02-01"), 32);
});

test("xFormat", () => {
  assert.strictEqual(fn.xFormat("2024-03-05 07:08:09", "dd/mm/yyyy hh:mm:ss"), "05/03/2024 07:08:09");
  assert.strictEqual(fn.xFormat(1234.5, "#,##0.00"), "1,234.50");
  assert.strictEqual(fn.xFormat(7, "000"), "007");
});

test("misc functions", () => {
  assert.strictEqual(fn.Val("12abc"), 12);
  assert.strictEqual(fn.IsNumeric(" "), 0);
  assert.strictEqual(fn.CInt("2.6"), 3);
  assert.strictEqual(fn.Switch(0, "a", 1, "b"), "b");
  assert.strictEqual(fn.xRight("abcdef", 2), "ef");
  assert.strictEqual(fn.like("nguy_n%", "NGUYỄN Văn A"), 1);
  assert.strictEqual(fn.like("a%", "ba"), 0);
});

test("timesPerDay reads doses per day from LIEU_DUNG", () => {
  assert.strictEqual(timesPerDay("1 Viên/lần * 1 lần/ngày * 40 ngày [1 Viên/ngày]"), 1);
  assert.strictEqual(timesPerDay("1 Viên/lần * 2 lần/ngày * 30 ngày [2 Viên/ngày]"), 2);
  assert.strictEqual(timesPerDay("1 Viên/lần * 3 lan / ngay"), 3);
  assert.strictEqual(timesPerDay("Uống sáng"), null);
});

test("accessCriteria lists criteria per column like the Access designer", () => {
  assert.strictEqual(
    accessCriteria(
      a2s(
        'SELECT XML1.MA_BN FROM XML1 INNER JOIN XML3 ON XML1.MA_LK = XML3.MA_LK ' +
          'WHERE (((XML3.MA_DICH_VU)="23.1" Or (XML3.MA_DICH_VU)="23.2") AND ' +
          '((XML1.CHAN_DOAN_RV) Not Like "*gan*" And (XML1.CHAN_DOAN_RV) Not Like "*suy (gan)*") AND ((XML1.MA_KHOA)<>"K01"));',
      ),
    ),
    'MA_DICH_VU: 23.1; 23.2\nCHAN_DOAN_RV: gan; suy (gan)\nMA_KHOA: <> K01',
  );
  assert.strictEqual(
    accessCriteria("SELECT a FROM T GROUP BY a HAVING (((T.a) In ('x','y','x')))"),
    "a: x; y",
  );
  assert.strictEqual(
    accessCriteria("SELECT a FROM T WHERE (((T.a) Is Not Null And (T.a)<>''))"),
    'a: Is Not Null; <> ""',
  );
  // hand-written conditions are shown as written
  assert.strictEqual(
    accessCriteria("SELECT * FROM T WHERE a = 'x' AND EXISTS (SELECT 1 FROM U WHERE U.b = T.b)"),
    'a = "x" AND EXISTS (SELECT 1 FROM U WHERE U.b = T.b)',
  );
  assert.strictEqual(accessCriteria("SELECT * FROM T"), "");
});

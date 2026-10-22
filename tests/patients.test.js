// Checks how error rows are linked to patients (keyed by MA_BN, via MA_LK / MA_BN / row_num / HO_TEN).
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const load = (...files) =>
  new Function(
    files.map((f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8")).join("\n") +
      "\nreturn { indexPatients, soleTable, rowKeys, get: () => pidx };",
  )();
const { indexPatients, soleTable, rowKeys, get } = load("js/state.js", "js/utils.js", "js/patients.js");

// fake sql.js db: rows are [row_num, MA_LK, MA_BN, HO_TEN, NGAY_SINH] of the table in the FROM clause
const tables = {
  XML1: [
    [2, "LK1", "BN1", "NGUYỄN VĂN A", "1990-01-01"],
    [3, 1002, "BN2", "TRẦN THỊ B", 19850615], // raw XML date
    [4, "LK3", "BN1", "NGUYỄN VĂN A", "1990-01-01"], // second visit of BN1
    [5, "LK4", "BN4", "LÊ VĂN C", null],
    [6, "LK5", "BN5", "LÊ VĂN C", null], // same name, different patient
  ],
  XML3: [[2, "LK1", null, null, null], [3, "1002", null, null, null], [4, "", null, null, null]],
};
const db = { exec: (sql) => [{ values: tables[sql.match(/FROM "(\w+)"/)[1]] }] };
// XML3 listed first: sheets with MA_BN must still be indexed first
indexPatients(db, [
  { sn: "XML3", cols: ["ma_lk", "MA_DICH_VU"] },
  { sn: "XML1", cols: ["MA_LK", "HO_TEN", "MA_BN", "NGAY_SINH"] },
  { sn: "XML2", cols: ["MA_THUOC"] },
]);
const idx = get();

test("indexPatients groups visits by MA_BN and maps row_num to the patient", () => {
  const p = idx.patients.get("BN1");
  assert.strictEqual(p.name, "NGUYỄN VĂN A");
  assert.deepStrictEqual([...p.lks], ["LK1", "LK3"]);
  assert.strictEqual(p.birth, "1990-01-01");
  assert.strictEqual(idx.patients.get("BN2").birth, "1985-06-15");
  assert.strictEqual(idx.lk.get("1002"), "BN2");
  assert.deepStrictEqual(Object.keys(idx.sheets).sort(), ["XML1", "XML3"]);
  assert.strictEqual(idx.sheets.XML3.get(2), "BN1");
  assert.strictEqual(idx.sheets.XML3.has(4), false);
  assert.strictEqual(idx.name.get("nguyễn văn a"), "BN1");
  assert.strictEqual(idx.name.has("lê văn c"), false); // ambiguous name
});

test("soleTable finds the single sheet a query reads", () => {
  const s = ["XML1", "XML3"];
  assert.strictEqual(soleTable('SELECT row_num FROM "XML3" WHERE x', s), "XML3");
  assert.strictEqual(soleTable("SELECT row_num FROM [xml3] t", s), "XML3");
  assert.strictEqual(soleTable("SELECT a.row_num FROM XML3 a, XML1 b", s), null);
  assert.strictEqual(soleTable("SELECT row_num FROM XML10", s), null);
  assert.strictEqual(soleTable("SELECT row_num FROM v1 JOIN XML3", s, ["v1"]), null);
});

test("rowKeys links by MA_LK, MA_BN, row_num, then unique HO_TEN", () => {
  const keys = (cols, rows, sql = "") => rowKeys({ cols, rows, sql }, idx, []);
  assert.deepStrictEqual(keys(["Ma_Lk", "X"], [["LK3", 1], [1002, 2], ["LKX", 3], [null, 4]]), ["BN1", "BN2", "LKX", null]);
  assert.deepStrictEqual(keys(["MA_BN", "HO_TEN"], [["BN2", "x"], [" BN9 ", "y"]]), ["BN2", "BN9"]);
  assert.deepStrictEqual(keys(["row_num"], [[2], [3], [9]], 'SELECT row_num FROM "XML3"'), ["BN1", "BN2", null]);
  assert.deepStrictEqual(keys(["row_num"], [[2]], "SELECT row_num FROM XML1 JOIN XML3"), [null]);
  assert.deepStrictEqual(keys(["HO_TEN"], [["Nguyễn Văn A"], ["LÊ VĂN C"]]), ["BN1", null]);
});

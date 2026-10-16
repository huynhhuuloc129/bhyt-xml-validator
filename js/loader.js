// Reads dropped/selected files: .xlsx data becomes SQLite tables, .sql/.txt files become rules.

async function loadFile(f) {
  if (!SQL)
    return alert("Thư viện SQLite chưa sẵn sàng, thử lại sau vài giây.");
  setStatus("Đang đọc file...");
  await new Promise((r) => setTimeout(r, 30));
  try {
    const wb = XLSX.read(await f.arrayBuffer(), {
      type: "array",
      cellDates: true,
    });
    if (db) db.close();
    db = new SQL.Database();
    regFns(db);
    const info = [];
    for (const sn of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], {
        header: 1,
        defval: null,
        raw: true,
      });
      if (!aoa.length) continue;
      // column names: blank -> colN, duplicates -> name_2, name_3...
      const seen = {};
      const cols = aoa[0].map((h, i) => {
        const n =
          h == null || String(h).trim() === ""
            ? "col" + (i + 1)
            : String(h).trim();
        seen[n] = (seen[n] || 0) + 1;
        return seen[n] > 1 ? n + "_" + seen[n] : n;
      });
      db.run(
        `CREATE TABLE ${qi(sn)} (row_num INTEGER,${cols.map((c) => qi(c) + " COLLATE NOCASE").join(",")})`,
      );
      const st = db.prepare(
        `INSERT INTO ${qi(sn)} VALUES (${Array(cols.length + 1)
          .fill("?")
          .join(",")})`,
      );
      db.run("BEGIN");
      let n = 0;
      for (let r = 1; r < aoa.length; r++) {
        const row = aoa[r];
        if (!row || row.every((c) => c == null || c === "")) continue;
        st.run([r + 1, ...cols.map((_, c) => fmt(row[c] ?? null))]);
        n++;
      }
      db.run("COMMIT");
      st.free();
      info.push({ sn, cols, n });
    }
    indexPatients(db, info);
    selectedPatient = null;
    fileName = f.name;
    $("fn").textContent = `${f.name} (${Math.round(f.size / 1024)} KB)`;
    $("schema").innerHTML =
      "<b>Các bảng đã nạp:</b><br>" +
      info.map((t) => `• <b>${esc(t.sn)}</b> (${t.n} dòng)`).join("<br>");
    $("run").disabled = false;
    runAll();
  } catch (e) {
    setStatus("Lỗi đọc file: " + e.message);
    console.error(e);
  }
}

// Decode a text file: UTF-16LE (BOM), UTF-8, or fall back to Windows-1258 (Vietnamese)
async function readTxt(f) {
  const b = new Uint8Array(await f.arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(b);
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(b)
      .replace(/^﻿/, "");
  } catch (e) {
    return new TextDecoder("windows-1258").decode(b);
  }
}

async function importSql(files) {
  if (!files?.length) return;
  const convert = $("conv").checked;
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const parts = [],
    errors = [];
  let nFiles = 0,
    nRules = 0;

  for (const file of sorted) {
    try {
      const raw = await readTxt(file);
      if (!raw.trim()) {
        errors.push(`${file.name}: file is empty`);
        continue;
      }
      if (/^\s*--\s*@rule\s+/m.test(raw)) {
        // file already has rule headers: keep it as-is
        const content = raw.trim();
        parts.push(content);
        nRules += countRules(content);
      } else {
        // plain SQL file becomes one rule
        const name = file.name.replace(/\.[^.]+$/, "");
        const sql = (convert ? a2s(raw) : raw.trim()).replace(/;\s*$/, "");
        parts.push(`-- @rule ${name} | error | as=${name}\n${sql};`);
        nRules++;
      }
      nFiles++;
    } catch (e) {
      errors.push(`${file.name}: ${e.message}`);
    }
  }
  if (errors.length) console.error("SQL import errors:", errors);
  if (!parts.length)
    return setStatus("No SQL files were imported. Check the selected files.");

  // append to existing rules
  const combined =
    [$("rules").value.trim(), ...parts].filter(Boolean).join("\n\n") + "\n";
  saveRules(combined);
  $("rd").open = true;
  setStatus(
    `Imported ${nFiles}/${sorted.length} file(s). ${nRules} rule(s) imported. ` +
      `${countRules(combined)} rule header(s) now in the editor.` +
      (errors.length
        ? ` ${errors.length} file(s) failed. Check the console.`
        : ""),
  );
  if (db) runAll();
}

// .sql/.txt files go to the rule editor, the first other file is loaded as data
async function route(list) {
  const all = [...list],
    isSql = (f) => /\.(sql|txt)$/i.test(f.name);
  const sqlFiles = all.filter(isSql),
    dataFile = all.find((f) => !isSql(f));
  if (sqlFiles.length) await importSql(sqlFiles);
  if (dataFile) loadFile(dataFile);
}

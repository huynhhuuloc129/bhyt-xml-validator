// Links error rows to patients so the results can be filtered to one patient.
// A patient is keyed by MA_BN (falls back to MA_LK when a visit has no MA_BN).

const findCol = (cols, name) =>
  cols.findIndex((c) => String(c).toLowerCase() === name.toLowerCase());
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (v) =>
  v == null || String(v).trim() === "" ? null : String(v).trim();
const normName = (v) => norm(v)?.normalize("NFC").toLowerCase() ?? null;

// After the xlsx is loaded: patient info, MA_LK -> patient, unique HO_TEN -> patient,
// and per sheet row_num -> patient
function indexPatients(d, sheets) {
  pidx = { patients: new Map(), lk: new Map(), name: new Map(), sheets: {} };
  const ambiguous = new Set();
  const read = (sn, cols) => {
    const pick = (n) => {
      const i = findCol(cols, n);
      return i < 0 ? "NULL" : qi(cols[i]);
    };
    return (
      d.exec(
        `SELECT row_num, ${pick("MA_LK")}, ${pick("MA_BN")}, ${pick("HO_TEN")}, ${pick("NGAY_SINH")} FROM ${qi(sn)}`,
      )[0]?.values || []
    );
  };
  const withLk = sheets.filter((s) => findCol(s.cols, "MA_LK") >= 0);
  // sheets that have MA_BN (XML1) first, so every visit maps to its patient
  withLk.sort(
    (a, b) => (findCol(b.cols, "MA_BN") >= 0) - (findCol(a.cols, "MA_BN") >= 0),
  );
  for (const { sn, cols } of withLk) {
    const rows = new Map();
    for (const [rn, lk0, bn0, name, birth] of read(sn, cols)) {
      const lk = norm(lk0),
        bn = norm(bn0);
      if (!lk && !bn) continue;
      const key = (lk && pidx.lk.get(lk)) || bn || lk;
      if (lk && !pidx.lk.has(lk)) pidx.lk.set(lk, key);
      rows.set(rn, key);
      const p = pidx.patients.get(key) || { lks: new Set() };
      if (lk) p.lks.add(lk);
      pidx.patients.set(key, {
        ...p,
        name: p.name || norm(name),
        maBn: p.maBn || bn,
        birth: p.birth || norm(birth),
      });
      const nm = normName(name);
      if (nm && !ambiguous.has(nm)) {
        if (pidx.name.has(nm) && pidx.name.get(nm) !== key) {
          ambiguous.add(nm);
          pidx.name.delete(nm);
        } else pidx.name.set(nm, key);
      }
    }
    pidx.sheets[sn] = rows;
  }
}

// The one sheet a query reads from, or null if it uses none / several / other views
function soleTable(sql, sheets, views = []) {
  const uses = (n) =>
    new RegExp(
      `(?:^|[^\\w$"\`\\[])(?:"${escRe(n)}"|\\[${escRe(n)}\\]|\`${escRe(n)}\`|${escRe(n)})(?![\\w$])`,
      "i",
    ).test(sql);
  if (views.some(uses)) return null;
  const hit = sheets.filter(uses);
  return hit.length === 1 ? hit[0] : null;
}

// Patient key for each result row, from the first usable column:
// MA_LK, MA_BN, row_num of the single sheet queried, then HO_TEN (only if the name is unique)
function rowKeys(r, idx, views) {
  const lk = findCol(r.cols, "MA_LK"),
    bn = findCol(r.cols, "MA_BN"),
    nm = findCol(r.cols, "HO_TEN"),
    rn = findCol(r.cols, "row_num");
  const t = rn >= 0 ? soleTable(r.sql, Object.keys(idx.sheets), views) : null;
  return r.rows.map((x) => {
    const l = lk >= 0 ? norm(x[lk]) : null;
    if (l) return idx.lk.get(l) ?? l;
    const b = bn >= 0 ? norm(x[bn]) : null;
    if (b) return b;
    const k = t ? idx.sheets[t].get(x[rn]) : null;
    if (k) return k;
    return (nm >= 0 && idx.name.get(normName(x[nm]))) || null;
  });
}

// results with rows narrowed to the selected patient (all results when none selected)
const patientView = () =>
  selectedPatient
    ? results.map((r) => ({
        ...r,
        rows: r.rows.filter((_, i) => r.keys?.[i] === selectedPatient),
      }))
    : results;

// patients that have errors, most errors first
function patientStats() {
  const s = new Map();
  for (const r of results)
    (r.keys || []).forEach((k) => {
      if (k == null) return;
      if (!s.has(k)) s.set(k, { n: 0, rules: new Set() });
      s.get(k).n++;
      s.get(k).rules.add(r.name);
    });
  return [...s]
    .map(([key, e]) => {
      const p = pidx.patients.get(key) || {};
      return {
        key,
        name: p.name,
        maBn: p.maBn || key,
        birth: p.birth,
        lks: [...(p.lks || [])].join(", "),
        n: e.n,
        rules: e.rules.size,
      };
    })
    .sort((a, b) => b.n - a.n);
}

const patientLabel = (k) => {
  const p = pidx.patients.get(k);
  return (p?.name ? p.name + " — " : "") + "MA_BN " + (p?.maBn || k);
};

function renderPatients() {
  const card = $("pcard");
  card.hidden = !results.length;
  if (!results.length) return;
  const list = patientStats();
  $("pcnt").textContent = list.length ? `(${list.length} bệnh nhân có lỗi)` : "";
  $("psel").innerHTML = selectedPatient
    ? `Đang xem: <b>${esc(patientLabel(selectedPatient))}</b> <button class="g" id="pclr">✕ Bỏ chọn</button>`
    : "";
  if (selectedPatient)
    $("pclr").onclick = (e) => {
      e.preventDefault(); // don't toggle the panel
      selectPatient(null);
    };
  if (!list.length) {
    $("plist").innerHTML =
      `<div class="m">Không gắn được dòng lỗi nào với bệnh nhân (kết quả rule cần có cột MA_LK, MA_BN, HO_TEN, hoặc row_num của một bảng có MA_LK).</div>`;
    return;
  }
  const q = $("pq").value.trim().toLowerCase();
  const shown = q
    ? list.filter((p) =>
        [p.name, p.maBn, p.lks].join(" ").toLowerCase().includes(q),
      )
    : list;
  $("plist").innerHTML =
    `<div class="tw pt"><table><thead>${tr(["Họ tên", "MA_BN", "Ngày sinh", "MA_LK", "Số dòng lỗi", "Số rule"], "th")}</thead><tbody>` +
    shown
      .slice(0, 300)
      .map(
        (p) =>
          `<tr data-k="${esc(p.key)}"${p.key === selectedPatient ? ' class="sel"' : ""}>` +
          [p.name, p.maBn, p.birth, p.lks, p.n, p.rules]
            .map((v) => `<td>${esc(v)}</td>`)
            .join("") +
          "</tr>",
      )
      .join("") +
    `</tbody></table></div>` +
    `<div class="m">${shown.length > 300 ? `Hiển thị 300/${shown.length}. Gõ để tìm thêm. ` : ""}Bấm một dòng để xem tất cả lỗi của bệnh nhân đó, bấm lại để bỏ chọn.</div>`;
}

function selectPatient(k) {
  selectedPatient = k && k !== selectedPatient ? k : null;
  render();
}

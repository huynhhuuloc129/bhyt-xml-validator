function lsGet(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch (e) {}
}
function saveRules(v) {
  $("rules").value = v;
  lsSet("rules_v1", v);
  showRuleCount();
}
const showRuleCount = () => {
  const n = countRules($("rules").value);
  $("rcnt").textContent = n ? `(${n})` : "";
};
// Show tab t (its panel has id "tab-" + t) and hide the other tabs in the same bar
function showTab(t) {
  const bar = document.querySelector(`.tab[data-tab="${t}"]`).parentElement;
  bar.querySelectorAll(".tab").forEach((b) => {
    const on = b.dataset.tab === t;
    b.classList.toggle("on", on);
    $("tab-" + b.dataset.tab).hidden = !on;
  });
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}
const qi = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const p2 = (n) => String(n).padStart(2, "0");
// true if SQL has something besides line comments
const hasSql = (s) => !!s.replace(/^\s*--.*$/gm, "").trim();
const countRules = (s) => (s.match(RULE_HEAD) || []).length;

function fmt(v) {
  if (!(v instanceof Date)) return v;
  const date = `${v.getUTCFullYear()}-${p2(v.getUTCMonth() + 1)}-${p2(v.getUTCDate())}`;
  return v.getUTCHours() || v.getUTCMinutes() || v.getUTCSeconds()
    ? `${date} ${p2(v.getUTCHours())}:${p2(v.getUTCMinutes())}:${p2(v.getUTCSeconds())}`
    : date;
}

// parse a date-ish value to UTC ms (yyyymmdd[hhmm[ss]], yyyy-mm-dd[ hh:mm[:ss]], dd/mm/yyyy[ hh:mm[:ss]], Excel serial)
function parseDate(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const m =
    s.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?$/) ||
    s.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
    );
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31)
    return Date.UTC(
      +m[1],
      m[2] - 1,
      +m[3],
      +(m[4] || 0),
      +(m[5] || 0),
      +(m[6] || 0),
    );
  const k = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (k)
    return Date.UTC(
      +k[3],
      k[2] - 1,
      +k[1],
      +(k[4] || 0),
      +(k[5] || 0),
      +(k[6] || 0),
    );
  if (/^\d+(\.\d+)?$/.test(s) && +s < 200000)
    return Math.round((+s - 25569) * 864e5);
  return null;
}

// Result columns named like a date/time (NGAY_VAO, GioRaVien, NgayBD_Oxy...) but not GIOI_TINH
const isDateCol = (c) => /ngay|gio(?!i)|date|time|thoi_?gian/i.test(c);
// XML date-time text (yyyymmddhhmm[ss]) in any column, e.g. 202610071200
// also when it sits inside longer text, e.g. "202610071200 - 202610081200"
const XML_DT =
  /(?<!\d)(?:19|20)\d\d(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?:[01]\d|2[0-3])[0-5]\d(?:[0-5]\d)?(?!\d)/g;
const isXmlDateTime = (v) =>
  v != null && new RegExp(`^${XML_DT.source}$`).test(String(v).trim());
const fmtXmlDateTimes = (v) =>
  typeof v === "string" ? v.replace(XML_DT, (m) => fmt(new Date(parseDate(m)))) : v;
// Show one format for a date column whether it holds XML text (202610102206)
// or an Access serial from CDate/DateAdd (46305.9236); small numbers (durations) are left alone
function fmtDate(v) {
  if (v == null || v === "") return v;
  // numbers are Access serials (1927..2100 only), unless they are XML date-times stored as numbers
  const n = typeof v === "number" && !isXmlDateTime(v) ? v : null;
  if (n != null && (n < 10000 || n > 73051)) return v;
  const t = parseDate(v);
  return t == null ? v : fmt(new Date(t));
}

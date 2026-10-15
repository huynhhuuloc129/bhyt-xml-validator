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

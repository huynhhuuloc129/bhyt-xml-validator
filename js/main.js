// Startup and event wiring. Loaded last.

$("rules").value = lsGet("rules_v1") || SAMPLE;
showRuleCount();
$("rules").addEventListener("input", () => {
  lsSet("rules_v1", $("rules").value);
  showRuleCount();
});

initSqlJs()
  .then((s) => {
    SQL = s;
    setStatus("SQLite đã sẵn sàng");
  })
  .catch((e) => setStatus("Lỗi tải SQLite: " + e));

// ---------- Upload ----------
const drop = $("drop"),
  fi = $("file");
drop.onclick = $("pick").onclick = () => fi.click();
fi.onchange = () => {
  route(fi.files);
  fi.value = "";
};
const dragState = (on) => (ev) => {
  ev.preventDefault();
  drop.classList.toggle("on", on);
};
drop.addEventListener("dragover", dragState(true));
drop.addEventListener("dragenter", dragState(true));
drop.addEventListener("dragleave", dragState(false));
drop.addEventListener("drop", (ev) => {
  dragState(false)(ev);
  route(ev.dataTransfer.files);
});

$("run").onclick = runAll;
$("q").oninput = render;
$("onlyerr").onchange = render;
$("exp").onclick = exportExcel;
// open all rules, or close all if they are all open already
$("xall").onclick = () => {
  const rs = [...document.querySelectorAll("#out .rule")];
  const open = rs.some((r) => !r.classList.contains("open"));
  rs.forEach((r) => r.classList.toggle("open", open));
};
$("pq").oninput = renderPatients;
$("opt").onclick = () => {
  const show = $("opts").hidden;
  $("opts").hidden = !show;
  $("opt").setAttribute("aria-expanded", show);
};

// ---------- Tabs ----------
document.querySelectorAll(".tabs").forEach(
  (bar) =>
    (bar.onclick = (e) => {
      const b = e.target.closest(".tab");
      if (b) showTab(b.dataset.tab);
    }),
);
// picking a patient jumps to their errors; unpicking stays on the list
$("plist").onclick = (e) => {
  const row = e.target.closest("tr[data-k]");
  if (!row) return;
  selectPatient(row.dataset.k);
  if (selectedPatient) showTab("rules");
};

// ---------- Theme: light by default, choice remembered per browser ----------
const ICON_SUN =
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>';
const ICON_MOON =
  '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>';
const setTheme = (t) => {
  document.documentElement.dataset.theme = t;
  $("theme").innerHTML = t === "dark" ? ICON_SUN : ICON_MOON;
  lsSet("theme", t);
};
setTheme(lsGet("theme") === "dark" ? "dark" : "light");
$("theme").onclick = () =>
  setTheme(
    document.documentElement.dataset.theme === "dark" ? "light" : "dark",
  );

$("ldr").onclick = () => $("rf").click();
$("rf").onchange = (e) => {
  route(e.target.files);
  e.target.value = "";
};
$("svr").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([$("rules").value], { type: "text/plain" }),
  );
  a.download = "rules.sql";
  a.click();
};
$("rst").onclick = () => {
  if (confirm("Khôi phục rule mẫu? Rule hiện tại sẽ bị ghi đè."))
    saveRules(SAMPLE);
};

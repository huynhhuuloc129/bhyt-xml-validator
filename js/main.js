// Startup and event wiring. Loaded last.

$("rules").value = lsGet("rules_v1") || SAMPLE;
$("rules").addEventListener("input", () =>
  lsSet("rules_v1", $("rules").value),
);



initSqlJs()
  .then((s) => {
    SQL = s;
    setStatus("Sẵn sàng. Hãy chọn file.");
  })
  .catch((e) => setStatus("Lỗi tải SQLite: " + e));

// ---------- Upload ----------
const drop = $("drop"),
  fi = $("file");
drop.onclick = () => fi.click();
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

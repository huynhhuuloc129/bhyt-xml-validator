// Draws the summary, the grouped SQL errors and each rule's result table; exports results to Excel.

const stat = (n, label, color) =>
  `<div class="card st"><b${color ? ` style="color:var(--${color})"` : ""}>${n}</b>${label}</div>`;
const sqlDetails = (sql) =>
  `<details><summary>Xem SQL đã chạy</summary><pre class="sql">${esc(sql)}</pre></details>`;
const tr = (cells, tag) =>
  "<tr>" + cells.map((v) => `<${tag}>${esc(v)}</${tag}>`).join("") + "</tr>";

function render() {
  const q = $("q").value.trim().toLowerCase(),
    only = $("onlyerr").checked;
  const withErr = results.filter((r) => r.rows.length && !r.err);
  const total = withErr.reduce((a, r) => a + r.rows.length, 0);
  const bad = results.filter((r) => r.err).length;
  const passed = results.filter((r) => !r.err && !r.rows.length).length;
  $("sum").innerHTML =
    stat(results.length, "Rule đã chạy") +
    stat(total, "Tổng dòng lỗi", "er") +
    stat(withErr.length, "Rule vi phạm", "er") +
    stat(passed, "Rule đạt", "ok") +
    (bad ? stat(bad, "Rule lỗi SQL", "wn") : "");

  // failed rules grouped by error message
  const em = {};
  results.forEach((r) => r.err && (em[r.err] ||= []).push(r.name));
  const groups = Object.entries(em).sort((a, b) => b[1].length - a[1].length);
  $("miss").innerHTML = groups.length
    ? `<div class="card"><b>Rule không chạy được (${bad}) — gom theo nguyên nhân</b>` +
      groups
        .map(
          ([m, n]) =>
            `<div class="err">• ${esc(m)} — ${n.length} rule <span class="m">(${esc(n.slice(0, 6).join(", "))}${n.length > 6 ? "…" : ""})</span></div>`,
        )
        .join("") +
      "</div>"
    : "";

  const out = $("out");
  out.innerHTML = "";
  for (const r of results) {
    const has = r.rows.length > 0;
    if (r.skip || (only && !has && !r.err)) continue;
    if (
      q &&
      !(r.name + " " + r.desc + " " + r.rows.map((x) => x.join(" ")).join(" "))
        .toLowerCase()
        .includes(q)
    )
      continue;
    const rows = q
      ? r.rows.filter((x) => (r.name + x.join(" ")).toLowerCase().includes(q))
      : r.rows;
    const color = `var(--${r.err ? "wn" : !has ? "ok" : r.sev === "warn" ? "wn" : "er"})`;
    let body = "";
    if (r.err)
      body =
        `<div class="err">⚠ Lỗi SQL: ${esc(r.err)}</div>` + sqlDetails(r.sql);
    else if (has)
      body =
        `<div class="tw"><table><thead>${tr(r.cols, "th")}</thead><tbody>` +
        rows
          .slice(0, 500)
          .map((x) => tr(x, "td"))
          .join("") +
        `</tbody></table></div>` +
        (rows.length > 500
          ? `<div class="m">Hiển thị 500/${rows.length} dòng. Xuất Excel để xem đủ.</div>`
          : "") +
        sqlDetails(r.sql);
    const d = document.createElement("div");
    d.className = "rule" + (has && results.length <= 12 ? " open" : "");
    d.innerHTML =
      `<div class="rh"><span class="dot" style="background:${color}"></span><b>${esc(r.name)}</b>` +
      `<span class="m">${r.sev === "warn" ? "cảnh báo" : "lỗi"}</span>` +
      `<span class="cnt" style="color:${color}">${r.err ? "lỗi SQL" : has ? rows.length + " dòng" : "✓"}</span></div>` +
      (r.desc ? `<div class="desc">${esc(r.desc)}</div>` : "") +
      `<div class="rb">${body}</div>`;
    d.querySelector(".rh").onclick = () => d.classList.toggle("open");
    out.appendChild(d);
  }
  if (!out.children.length)
    out.innerHTML = `<div class="card m">${results.length ? "🎉 Không có lỗi nào (hoặc không khớp bộ lọc)." : "Chưa có kết quả."}</div>`;
}

function exportExcel() {
  const wb = XLSX.utils.book_new();
  const sum = [["Rule", "Mức độ", "Số dòng lỗi", "Ghi chú"]];
  for (const r of results)
    if (!r.skip)
      sum.push([
        r.name,
        r.sev === "warn" ? "Cảnh báo" : "Lỗi",
        r.rows.length,
        r.err || r.desc,
      ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Tong hop");
  const used = { "Tong hop": 1 };
  results.forEach((r, i) => {
    if (!r.rows.length) return;
    let n = r.name.replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 28) || "Rule" + i;
    while (used[n]) n = n.slice(0, 26) + "_" + i;
    used[n] = 1;
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([r.cols, ...r.rows]),
      n,
    );
  });
  XLSX.writeFile(
    wb,
    "loi_" + (fileName.replace(/\.[^.]+$/, "") || "ketqua") + ".xlsx",
  );
}

// Kéo dãn cột: tự thêm tay nắm vào mọi tiêu đề bảng
new MutationObserver(() => {
  document.querySelectorAll("th:not([data-rz])").forEach((th) => {
    th.dataset.rz = 1;
    const s = document.createElement("span");
    s.className = "rz";
    th.appendChild(s);
  });
}).observe(document.body, { childList: true, subtree: true });

document.addEventListener("pointerdown", (e) => {
  const h = e.target.closest && e.target.closest(".rz");
  if (!h) return;
  e.preventDefault();
  const th = h.parentElement,
    table = th.closest("table");
  const ths = [...table.querySelectorAll("th")];
  if (!table.classList.contains("fx")) {
    ths.forEach(
      (t) => (t.style.width = t.getBoundingClientRect().width + "px"),
    );
    table.classList.add("fx");
  }
  const nx =
    th.nextElementSibling && th.nextElementSibling.tagName === "TH"
      ? th.nextElementSibling
      : null;
  const x0 = e.clientX,
    w0 = parseFloat(th.style.width),
    w1 = nx ? parseFloat(nx.style.width) : 0,
    MIN = 50;
  const total = () => ths.reduce((a, t) => a + parseFloat(t.style.width), 0);
  table.style.width = total() + "px";
  h.classList.add("on");
  const mv = (ev) => {
    let dx = ev.clientX - x0;
    if (nx) {
      dx = Math.max(MIN - w0, Math.min(w1 - MIN, dx));
      th.style.width = w0 + dx + "px";
      nx.style.width = w1 - dx + "px";
    } else {
      th.style.width = Math.max(MIN, w0 + dx) + "px";
    }
    table.style.width = total() + "px";
  };
  const up = () => {
    h.classList.remove("on");
    document.removeEventListener("pointermove", mv);
    document.removeEventListener("pointerup", up);
  };
  document.addEventListener("pointermove", mv);
  document.addEventListener("pointerup", up);
});

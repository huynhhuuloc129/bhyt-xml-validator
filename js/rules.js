// Parses the rule editor text and runs every rule against the loaded database.
// Rule format: `-- @rule Name | error|warn [| as=view_name]`, then `-- description` lines, then the SQL.

function parseRules(text) {
  const parts = text.split(/^--\s*@rule\s+/m);
  const setup = parts.shift();
  const rules = parts.map((p, i) => {
    const lines = p.split("\n");
    const head = lines
      .shift()
      .split("|")
      .map((s) => s.trim());
    const desc = [],
      sql = [];
    let inDesc = true;
    for (const l of lines) {
      if (
        inDesc &&
        /^--\s?/.test(l) &&
        !/^--\s*(SELECT|WITH|CREATE)\b/i.test(l)
      ) {
        desc.push(l.replace(/^--\s?/, ""));
      } else {
        inDesc = false;
        sql.push(l);
      }
    }
    return {
      name: head[0] || "Rule " + (i + 1),
      sev: /warn/i.test(head[1] || "") ? "warn" : "error",
      as: (head.find((h) => /^as=/i.test(h)) || "").slice(3) || null,
      desc: desc.join(" ").trim(),
      sql: sql.join("\n").trim(),
    };
  });
  return { setup, rules };
}

// Extra conditions applied on top of a rule's own SQL, keyed by rule name (case-insensitive)
const RULE_FILTERS = {
  DAUVAO: `"TIME" < 3`, // only stays less than 3 minutes
  // GIO_NGAY_TH_YL is "H giờ M phút": only less than 4 hours
  DVKT_THAN_4T: `CAST("GIO_NGAY_TH_YL" AS INTEGER) < 4`,
};
const ruleFilter = (name) =>
  Object.entries(RULE_FILTERS).find(
    ([k]) => k.toLowerCase() === name.toLowerCase(),
  )?.[1];

// Row filters run on a rule's result rows instead of the default LIEU_DUNG one, keyed by rule
// name ignoring case, spaces and Vietnamese accents; `get(col)` reads a column of the row
const ROW_FILTERS = {
  // daily dose (HAM_LUONG mg × times per day) more than 180 mg
  THUOC_LD_Fexofenadin_120mg_1v_ngay: (get) =>
    parseFloat(get("HAM_LUONG")) * timesPerDay(get("LIEU_DUNG")) > 180,
};
const ruleKey = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ\s]/g, "").replace(/đ/gi, "d").toLowerCase();
const rowFilter = (name) =>
  Object.entries(ROW_FILTERS).find(([k]) => ruleKey(k) === ruleKey(name))?.[1];

// Rules whose results have no GHI_CHU column, matched like ROW_FILTERS
const NO_NOTE_RULES = ["DVKT_KHONGTHUOC", "DVKT_dieutrituyrang_2"].map(ruleKey);

// Extra results listing the rows of rule `a` or `b` whose visit (`key` columns) is missing from
// the other rule; shown right after the later of the two
const DIFF_RULES = [
  {
    name: "DVKT_NS_XNmobenhhoc_KHONG_KHOP",
    desc: "Nội soi sinh thiết mà không có XN mô bệnh học (hoặc ngược lại) trong cùng đợt điều trị",
    a: "DVKT_NS_XNmobenhhoc_NS",
    b: "DVKT_NS_XNmobenhhoc_XNMBH",
    key: ["MA_BN", "NGAY_VAO", "NGAY_RA"],
  },
];
function addDiffResults(results) {
  const find = (n) => results.find((r) => ruleKey(r.name) === ruleKey(n));
  for (const d of DIFF_RULES) {
    const a = find(d.a),
      b = find(d.b);
    if (!a || !b) continue;
    const o = {
      name: d.name,
      sev: "error",
      desc: d.desc,
      as: null,
      sql: `-- dòng của ${d.a} / ${d.b} không có trong bảng còn lại (so theo ${d.key.join(", ")})`,
      cols: ["CHI_CO_TRONG", ...a.cols],
      rows: [],
      err: a.err || b.err ? `${d.a} hoặc ${d.b} bị lỗi SQL` : null,
    };
    if (!o.err) {
      const keyOf = (r) => (x) =>
        d.key.map((c) => x[r.cols.findIndex((n) => n.toUpperCase() === c)]).join("|");
      const keysA = new Set(a.rows.map(keyOf(a))),
        keysB = new Set(b.rows.map(keyOf(b)));
      // b's rows are laid out in a's column order
      const toA = a.cols.map((c) => b.cols.indexOf(c));
      o.rows = [
        ...a.rows.filter((x) => !keysB.has(keyOf(a)(x))).map((x) => [d.a, ...x]),
        ...b.rows
          .filter((x) => !keysA.has(keyOf(b)(x)))
          .map((x) => [d.b, ...toA.map((i) => (i < 0 ? null : x[i]))]),
      ];
    }
    results.splice(Math.max(results.indexOf(a), results.indexOf(b)) + 1, 0, o);
  }
}

function runAll() {
  if (!db) return;
  setStatus("Đang chạy...");
  setTimeout(() => {
    const t0 = performance.now();
    const { setup, rules } = parseRules($("rules").value);
    rules.forEach((r) => {
      r.note = accessCriteria(r.sql);
      r.sql = fixDots(fnRen(r.sql));
    });
    results = [];
    try {
      if (hasSql(setup)) db.exec(setup);
    } catch (e) {
      results.push({
        name: "Script khởi tạo",
        sev: "error",
        desc: "",
        err: e.message,
        cols: [],
        rows: [],
      });
    }
    // drop views from the previous run, then create one per `as=` rule
    for (const v of createdViews.reverse()) {
      try {
        db.run("DROP VIEW IF EXISTS " + qi(v));
      } catch (e) {}
    }
    createdViews = [];
    const views = new Set(),
      verr = {};
    for (const r of rules) {
      if (!r.as || !hasSql(r.sql)) continue;
      try {
        db.run(`CREATE VIEW ${qi(r.as)} AS ${r.sql.replace(/;\s*$/, "")}`);
        views.add(r.as);
        createdViews.push(r.as);
      } catch (e) {
        verr[r.as] = e.message;
      }
    }
    for (const r of rules) {
      const o = { ...r, cols: [], rows: [], err: null };
      if (!hasSql(r.sql)) {
        results.push({
          ...o,
          err: "Rule chưa có câu SQL (đang bị comment?)",
          skip: true,
        });
        continue;
      }
      try {
        const isView = r.as && views.has(r.as);
        if (r.as && verr[r.as] && !isView) throw new Error(verr[r.as]);
        let sql = isView ? "SELECT * FROM " + qi(r.as) : r.sql;
        const where = ruleFilter(r.name);
        if (where)
          sql = `SELECT * FROM (${sql.replace(/;\s*$/, "")}) WHERE ${where}`;
        const last = db.exec(sql).at(-1);
        if (last) {
          o.cols = last.columns;
          const dc = o.cols.map(
            (c, i) => isDateCol(c) && !isDurationCol(last.values, i),
          );
          o.rows = last.values.map((x) =>
            x.map((v, i) =>
              dc[i] || isXmlDateTime(v) ? fmtDate(v) : fmtXmlDateTimes(v),
            ),
          );
          const keep = rowFilter(r.name);
          // any other rule with a LIEU_DUNG column: only doses taken 2 or more times a day
          const ld = o.cols.findIndex((c) => /^lieu_?dung$/i.test(c));
          if (keep)
            o.rows = o.rows.filter((x) =>
              keep((c) => x[o.cols.findIndex((n) => n.toUpperCase() === c)]),
            );
          else if (ld >= 0)
            o.rows = o.rows.filter((x) => timesPerDay(x[ld]) >= 2);
          // GHI_CHU: the rule's criteria, as in the Access query designer
          const gc = o.cols.findIndex((c) => /^ghi_?chu$/i.test(c));
          if (NO_NOTE_RULES.includes(ruleKey(r.name))) {
            if (gc >= 0) {
              o.cols = o.cols.filter((_, i) => i !== gc);
              o.rows = o.rows.map((x) => x.filter((_, i) => i !== gc));
            }
          } else if (r.note) {
            if (gc < 0) o.cols = [...o.cols, "GHI_CHU"];
            o.rows = o.rows.map((x) =>
              gc < 0 ? [...x, r.note] : x.map((v, i) => (i === gc ? r.note : v)),
            );
          }
        }
      } catch (e) {
        o.err = e.message;
      }
      results.push(o);
    }
    addDiffResults(results);
    for (const o of results) o.keys = rowKeys(o, pidx, createdViews);
    setStatus(
      "Xong trong " + ((performance.now() - t0) / 1000).toFixed(2) + "s",
    );
    $("exp").disabled = false;
    render();
  }, 20);
}

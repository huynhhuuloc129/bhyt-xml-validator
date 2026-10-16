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

function runAll() {
  if (!db) return;
  setStatus("Đang chạy...");
  setTimeout(() => {
    const t0 = performance.now();
    const { setup, rules } = parseRules($("rules").value);
    rules.forEach((r) => (r.sql = fixDots(fnRen(r.sql))));
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
        db.run(
          `CREATE VIEW ${qi(r.as)} AS ${r.sql.replace(/;\s*$/, "")}`,
        );
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
        const last = db
          .exec(isView ? "SELECT * FROM " + qi(r.as) : r.sql)
          .at(-1);
        if (last) {
          o.cols = last.columns;
          o.rows = last.values;
        }
      } catch (e) {
        o.err = e.message;
      }
      results.push(o);
    }
    for (const o of results) o.keys = rowKeys(o, pidx, createdViews);
    setStatus(
      "Xong trong " + ((performance.now() - t0) / 1000).toFixed(2) + "s",
    );
    $("exp").disabled = false;
    render();
  }, 20);
}

// Converts Access SQL (as exported from .accdb queries) into SQLite-compatible SQL.
// a2s runs once when a plain .sql file is imported; fnRen + fixDots run on every rule before executing.

const FN_RENAMES = [
  ["Nz", "coalesce"],
  ["Mid", "substr"],
  ["Len", "length"],
  ["UCase", "upper"],
  ["LCase", "lower"],
  ["InStr", "instr"],
  ["Left", "xLeft"],
  ["Right", "xRight"],
];
const FN_RENAMES_ALL = [
  ...FN_RENAMES,
  ["Format", "xFormat"],
  ["Int", "xInt"],
];
const renameFns = (s, list) =>
  list.reduce(
    (acc, [from, to]) =>
      acc.replace(new RegExp(`\\b${from}\\s*\\(`, "gi"), to + "("),
    s,
  );

function a2s(sql) {
  let s = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .replace(/;\s*$/, "");
  s = s
    .replace(/"([^"]*)"/g, (m, x) => "'" + x.replace(/'/g, "''") + "'")
    .replace(
      /\bLIKE\s+'([^']*)'/gi,
      (m, p) =>
        "LIKE '" + p.replace(/\*/g, "%").replace(/[?#]/g, "_") + "'",
    )
    .replace(/\[\s*(SELECT[\s\S]*?);?\s*\]\.\s*AS\s+/gi, "($1) AS ")
    .replace(/\[([^\]]+)\]/g, '"$1"')
    .replace(/\s*&\s*/g, " || ")
    .replace(/#(\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4})#/g, "CDate('$1')")
    .replace(/\bDISTINCTROW\b/gi, "DISTINCT")
    .replace(/\bDate\(\)/gi, "CDate(date('now'))")
    .replace(/\bNow\(\)/gi, "CDate(datetime('now'))");
  return renameFns(s, FN_RENAMES).replace(
    /^(\s*SELECT\s+(?:DISTINCT\s+)?)TOP\s+(\d+)\s+([\s\S]*)$/i,
    "$1$3 LIMIT $2",
  );
}

// a.b.c -> a.c and "a.b".c -> a.c, outside string literals
function fixDots(s) {
  return s
    .split(/('(?:[^']|'')*')/)
    .map((p, i) =>
      i % 2
        ? p
        : p
            .replace(
              /(?<![\w".])([A-Za-z_]\w*)\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)(?![\w(])/g,
              "$1.$3",
            )
            .replace(
              /"([A-Za-z_]\w*)\.([A-Za-z_]\w*)"\.([A-Za-z_]\w*)/g,
              "$1.$3",
            ),
    )
    .join("");
}

function fnRen(s) {
  s = s
    .replace(
      /\b(Left|Right|Mid|Trim|UCase|LCase|Format|Chr|Str|Space)\$\s*\(/gi,
      "$1(",
    )
    .replace(/\s+Mod\s+/gi, " % ")
    .replace(/\bIsNull\s*\(/gi, "xIsNull(");
  return renameFns(s, FN_RENAMES_ALL);
}

// s with 'strings' blanked out, same length; if `nested`, also "names" and anything inside parentheses
function maskSql(s, nested) {
  let d = 0,
    out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || (nested && c === '"')) {
      const j = s.indexOf(c, i + 1) < 0 ? s.length - 1 : s.indexOf(c, i + 1);
      out += " ".repeat(j - i + 1);
      i = j;
      continue;
    }
    if (c === "(") d++;
    out += nested && d > 0 ? " " : c;
    if (c === ")") d--;
  }
  return out;
}

// SQLite criteria back in Access notation: "x" strings, Like "*x*", no leading "="
const toAccessCrit = (s) =>
  s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|\b(?:Or|And) )=\s*/gi, "$1")
    .split(/('(?:[^']|'')*')/)
    .map((p, i, a) => {
      if (!(i % 2)) return p.replace(/\bLIKE\b/g, "Like");
      const v = p.slice(1, -1).replace(/''/g, "'");
      return /\bLIKE\s*$/i.test(a[i - 1])
        ? '"' + v.replace(/%/g, "*").replace(/_/g, "?") + '"'
        : '"' + v + '"';
    })
    .join("");

// Just the values of one column's criteria, "; "-separated: drops And / Or / Not Like / Like / In / =,
// quotes and wildcards; keeps other operators (<>, >=, Is Null…) in front of their value
function critValues(s) {
  const items = [];
  let op = "";
  s.replace(/\s+/g, " ")
    .split(/('(?:[^']|'')*')/)
    .forEach((p, i) => {
      if (i % 2) {
        const v =
          p.slice(1, -1).replace(/''/g, "'").replace(/%/g, "").replace(/\s+/g, " ").trim() || '""';
        items.push(op ? op + " " + v : v);
        op = "";
        return;
      }
      for (const t of p.split(/\b(?:AND|OR)\b/i)) {
        const w = t.replace(/\b(?:NOT\s+LIKE|LIKE|IN)\b|[=(),]/gi, "").trim();
        if (op && w) items.push(op);
        op = w ? w.replace(/\bIs\b/gi, "Is").replace(/\bNot\b/gi, "Not").replace(/\bNull\b/gi, "Null") : op;
      }
    });
  if (op) items.push(op);
  return [...new Set(items.filter(Boolean))].join("; ");
}

// The criteria of a query's top-level WHERE / HAVING, one "COLUMN: values" line per column (the
// Criteria row of the Access query designer, values only); clauses not in that form are shown as-is
function accessCriteria(sql) {
  const masked = maskSql(sql, true),
    out = [];
  const kw =
    /\b(WHERE|HAVING)\b([\s\S]*?)(?=\b(?:WHERE|HAVING|GROUP\s+BY|ORDER\s+BY|UNION|LIMIT)\b|;|$)/gi;
  for (const m of masked.matchAll(kw)) {
    const start = m.index + m[0].length - m[2].length;
    let s = sql.slice(start, start + m[2].length).trim();
    while (s[0] === "(" && !maskSql(s, true).trim()) s = s.slice(1, -1).trim();
    const top = maskSql(s, true),
      parts = [];
    let from = 0;
    for (const a of top.matchAll(/\bAND\b/gi)) {
      parts.push(s.slice(from, a.index));
      from = a.index + a[0].length;
    }
    parts.push(s.slice(from));
    const cols = new Map();
    const ok = parts.every((p) => {
      p = p.trim();
      while (p[0] === "(" && !maskSql(p, true).trim()) p = p.slice(1, -1).trim();
      // field references in the designer's "(Table.Field)" form, outside quoted text
      const refs = [
        ...maskSql(p).matchAll(/(?<![\w"])\((?:(?:"[^"]+"|\w+)\.)?("[^"]+"|\w+)\)/g),
      ].filter((r) => !/^\d+$/.test(r[1]));
      const names = new Set(refs.map((r) => r[1].replace(/"/g, "").toUpperCase()));
      if (names.size !== 1) return false;
      let crit = "";
      let last = 0;
      for (const r of refs) {
        crit += p.slice(last, r.index);
        last = r.index + r[0].length;
      }
      crit += p.slice(last);
      const col = refs[0][1].replace(/"/g, "");
      const key = col.toUpperCase();
      cols.set(key, [...(cols.get(key) || [col]), critValues(crit)]);
      return true;
    });
    if (ok)
      for (const [col, ...c] of cols.values()) out.push(`${col}: ${c.filter(Boolean).join("; ")}`);
    else out.push(toAccessCrit(s));
  }
  return out.join("\n");
}

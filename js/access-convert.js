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

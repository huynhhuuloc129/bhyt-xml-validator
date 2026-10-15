# BHYT XML validator

Checks an `XML.xlsx` export against a set of SQL rules, entirely in the browser — no data leaves the machine.

## Using it

1. Double-click `index.html` (needs internet once to load the xlsx / sql.js libraries from cdnjs).
2. Drop the `.xlsx` file (optionally together with `.sql` rule files) onto the page.
3. Review the results and use **⬇ Xuất Excel** to export them.

When sharing with others, send the **whole folder** (zip it) — `index.html` needs `css/` and `js/` next to it.

## Rule format

```sql
-- anything before the first rule runs first (helper views etc.)

-- @rule Rule name | error            (or: warn)   optional: | as=view_name
-- description line(s)
SELECT row_num, ... FROM "SheetName" WHERE ...;
```

Each sheet becomes a table (same name as the sheet) with an extra `row_num` column.
Plain `.sql` files (e.g. exported Access queries) are imported as one rule each and converted from Access syntax.

## Project layout

| File | What it does |
|---|---|
| `index.html` | Page markup; loads the CSS and scripts in order |
| `css/style.css` | Styles (light/dark) |
| `js/state.js` | Shared state (`db`, `results`…) and `$` / `setStatus` |
| `js/utils.js` | Small helpers: HTML escaping, localStorage, date formatting |
| `js/access-convert.js` | Rewrites Access SQL into SQLite SQL (`a2s`, `fnRen`, `fixDots`) |
| `js/access-functions.js` | Access/VBA functions added to SQLite (`Year`, `DateAdd`, `Format`, `LIKE`…) |
| `js/rules.js` | Parses the rule text and runs the rules |
| `js/render.js` | Draws the results and exports them to Excel |
| `js/loader.js` | Reads dropped files: xlsx → tables, sql → rules |
| `js/main.js` | Startup and button / drag-drop wiring (loaded last) |
| `tests/` | Node tests for the conversion and SQL functions |

The scripts are plain `<script>` files sharing globals (not ES modules) so the page works when opened directly from disk.
Script order in `index.html` matters only for `state.js` (first) and `main.js` (last).

## Tests

```sh
node --test
```

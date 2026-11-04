# Kiểm tra hồ sơ bệnh án điện tử

(BHYT XML validator)

Checks an `XML.xlsx` export against a set of SQL rules, entirely in the browser — no data leaves the machine.

## Using it

1. Double-click `index.html`. You are sent to `login.html` first; use **Đăng ký** (`register.html`) to create an account — see [Accounts](#accounts). The xlsx / sql.js libraries need internet the first time they load from cdnjs.
2. Drop the `.xlsx` file (optionally together with `.sql` rule files) onto the page in the **📂 File XML** tab. Rules are edited or imported in the **📜 Rule SQL** tab.
3. Review the results and use **⬇ Xuất Excel** to export them. Every result table (except `DVKT_KHONGTHUOC` and `DVKT_dieutrituyrang_2`) ends with a `GHI_CHU` column holding the rule's criteria, one `COLUMN: value; value…` line per column, taken from the Access query designer's Criteria row with the `Like` / `Not Like` / `And` / `Or` words, quotes and `*` removed (hand-written conditions are shown as written).
4. To see one patient's errors across all tables, open the **Lọc theo bệnh nhân** tab and click the patient — the page switches back to the rule results, filtered to that patient. Click the row again or press ✕ to clear the selection.

A patient is identified by `MA_BN`, so several visits (`MA_LK`) of one person are grouped together. Each error row is linked using the first of these columns in the rule's result: `MA_LK`, `MA_BN`, `row_num` (only when the rule reads exactly one sheet), or `HO_TEN` (only when the name belongs to one patient). In patient view, rules whose rows can't be linked are listed so they aren't silently missed.

The page opens in light mode; the 🌙 / ☀️ button in the top-right switches theme and is remembered per browser.

When sharing with others, send the **whole folder** (zip it) — `index.html` needs `css/` and `js/` next to it.

## Accounts

There is no backend yet. Accounts are stored in a small SQLite database (sql.js) kept in the browser's `localStorage` under `users_db_v1`, so they exist only in that browser on that machine.

- Username: 3–32 characters, starts with a letter, only `A–Z a–z 0–9 . _ -` (case-insensitive, must be unique).
- Password: 8–64 characters, at least one letter and one digit, no leading/trailing spaces, not the same as the username.
- Passwords are never stored: only a PBKDF2-SHA256 hash (210,000 iterations, random 16-byte salt per user, via Web Crypto).
- A built-in account **`admin` / `admin`** is added to every browser's user database the first time a login/register page opens, so it works on any computer. Its password doesn't follow the rules above, and nobody can register another `admin`.
- Logging in lasts for the browser tab (`sessionStorage`); the ⎋ button in the nav logs out.

This only keeps casual users out — anyone with the files can bypass a check that runs in their own browser. Move it to a server before relying on it.

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

| File                     | What it does                                                                |
| ------------------------ | --------------------------------------------------------------------------- |
| `index.html`             | Page markup; loads the CSS and scripts in order                             |
| `css/style.css`          | Styles (light/dark)                                                         |
| `js/state.js`            | Shared state (`db`, `results`…) and `$` / `setStatus`                       |
| `js/utils.js`            | Small helpers: HTML escaping, localStorage, date formatting                 |
| `js/access-convert.js`   | Rewrites Access SQL into SQLite SQL (`a2s`, `fnRen`, `fixDots`)             |
| `js/access-functions.js` | Access/VBA functions added to SQLite (`Year`, `DateAdd`, `Format`, `LIKE`…) |
| `js/rules.js`            | Parses the rule text and runs the rules                                     |
| `js/patients.js`         | Links error rows to patients (`MA_LK`) and draws the patient filter         |
| `js/render.js`           | Draws the results and exports them to Excel                                 |
| `js/loader.js`           | Reads dropped files: xlsx → tables, sql → rules                             |
| `js/main.js`             | Startup and button / drag-drop wiring (loaded last)                         |
| `js/guard.js`            | Discourages DevTools                                                        |
| `login.html` / `register.html` | Login and sign-up pages                                                |
| `js/auth.js`             | Field checks, password hashing and the user store for the auth pages       |
| `js/session.js`          | Sends visitors who aren't logged in to `login.html`; logout button          |
| `css/auth.css`           | Styles for the auth pages and the nav username                              |
| `tests/`                 | Node tests for the conversion and SQL functions                             |

The scripts are plain `<script>` files sharing globals (not ES modules) so the page works when opened directly from disk.
Script order in `index.html` matters only for `state.js` (first) and `main.js` (last).

## Tests

```sh
node --test
```

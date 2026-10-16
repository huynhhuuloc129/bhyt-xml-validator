// Shared app state and DOM shortcuts (loaded first; other scripts use these globals)

const SAMPLE = ``;
const RULE_HEAD = /^--\s*@rule\s+/gm;
const $ = (id) => document.getElementById(id);
const setStatus = (s) => ($("status").textContent = s);
let SQL = null,
  db = null,
  results = [],
  fileName = "",
  createdViews = [],
  // patient index (see patients.js): key -> info, MA_LK -> key, unique HO_TEN -> key, sheet -> Map(row_num -> key)
  pidx = { patients: new Map(), lk: new Map(), name: new Map(), sheets: {} },
  selectedPatient = null;

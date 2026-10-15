// Registers Access/VBA functions (Year, DateAdd, Format, IsNull...) on a sql.js database
// so converted Access queries can run in SQLite.

function regFns(d) {
  const f = (n, fn) => {
    try {
      Object.defineProperty(fn, "length", { value: -1 }); // variadic
      d.create_function(n, fn);
    } catch (e) {
      console.error("fn " + n, e);
    }
  };
  const nn = (fn) => (v) => (v == null ? null : fn(v)); // null-passthrough
  const isNull = (v) => (v == null ? 1 : 0);

  f("xLeft", (s, n) => (s == null ? null : String(s).slice(0, n)));
  f("xRight", (s, n) =>
    s == null ? null : n > 0 ? String(s).slice(-n) : "",
  );
  f("CStr", nn(String));
  for (const n of ["CInt", "CLng"])
    f(
      n,
      nn((s) => Math.round(parseFloat(s))),
    );
  for (const n of ["CDbl", "CCur", "CSng"])
    f(
      n,
      nn((s) => parseFloat(s)),
    );
  f("Val", (s) => {
    const m = String(s ?? "")
      .trim()
      .match(/^[-+]?\d*\.?\d+/);
    return m ? parseFloat(m[0]) : 0;
  });
  f("IsNumeric", (s) =>
    s != null && String(s).trim() !== "" && !isNaN(Number(s)) ? 1 : 0,
  );

  // parse a date-ish value to UTC ms (yyyymmdd[hhmm[ss]], yyyy-mm-dd[ hh:mm[:ss]], dd/mm/yyyy[ hh:mm[:ss]], Excel serial)
  const pd = (v) => {
    if (v == null || v === "") return null;
    const s = String(v).trim();
    const m =
      s.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?$/) ||
      s.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
      );
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31)
      return Date.UTC(
        +m[1],
        m[2] - 1,
        +m[3],
        +(m[4] || 0),
        +(m[5] || 0),
        +(m[6] || 0),
      );
    const k = s.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (k)
      return Date.UTC(
        +k[3],
        k[2] - 1,
        +k[1],
        +(k[4] || 0),
        +(k[5] || 0),
        +(k[6] || 0),
      );
    if (/^\d+(\.\d+)?$/.test(s) && +s < 200000)
      return Math.round((+s - 25569) * 864e5);
    return null;
  };
  const g = (v, fn) => {
    const t = pd(v);
    return t == null ? null : fn(new Date(t), t);
  };
  const ser = (t) => t / 864e5 + 25569; // UTC ms -> Excel/Access serial

  f("Year", (v) => g(v, (d) => d.getUTCFullYear()));
  f("Month", (v) => g(v, (d) => d.getUTCMonth() + 1));
  f("Day", (v) => g(v, (d) => d.getUTCDate()));
  f("Hour", (v) => g(v, (d) => d.getUTCHours()));
  f("Minute", (v) => g(v, (d) => d.getUTCMinutes()));
  f("Second", (v) => g(v, (d) => d.getUTCSeconds()));
  f("Weekday", (v) => g(v, (d) => d.getUTCDay() + 1));
  f("IsDate", (v) => (pd(v) == null ? 0 : 1));
  f("DateValue", (v) => g(v, (d, t) => Math.floor(ser(t))));
  f("CDate", (v) => g(v, (d, t) => ser(t)));
  f("DateSerial", (y, m, d) => ser(Date.UTC(y, m - 1, d)));
  f(
    "TimeSerial",
    (h, m, s) => ((+h || 0) * 3600 + (+m || 0) * 60 + (+s || 0)) / 86400,
  );
  f("TimeValue", (v) => g(v, (d, t) => ser(t) - Math.floor(ser(t))));
  f("DateDiff", (i, a, b) => {
    const x = pd(a),
      y = pd(b);
    if (x == null || y == null) return null;
    const A = new Date(x),
      B = new Date(y);
    const per = (ms) => Math.floor(y / ms) - Math.floor(x / ms);
    switch (String(i).toLowerCase()) {
      case "yyyy":
        return B.getUTCFullYear() - A.getUTCFullYear();
      case "q": {
        const q = (D) =>
          D.getUTCFullYear() * 4 + Math.floor(D.getUTCMonth() / 3);
        return q(B) - q(A);
      }
      case "m":
        return (
          B.getUTCFullYear() * 12 +
          B.getUTCMonth() -
          (A.getUTCFullYear() * 12 + A.getUTCMonth())
        );
      case "ww":
        return (
          Math.floor((Math.floor(y / 864e5) + 4) / 7) -
          Math.floor((Math.floor(x / 864e5) + 4) / 7)
        );
      case "h":
        return per(36e5);
      case "n":
        return per(6e4);
      case "s":
        return per(1e3);
      default:
        return per(864e5);
    }
  });
  f("DateAdd", (i, n, v) => {
    const t = pd(v);
    if (t == null || n == null) return null;
    i = String(i).toLowerCase();
    const months = { m: 1, q: 3, yyyy: 12 }[i];
    if (months) {
      const d = new Date(t);
      d.setUTCMonth(d.getUTCMonth() + n * months);
      return ser(d.getTime());
    }
    return ser(
      t + n * ({ ww: 6048e5, h: 36e5, n: 6e4, s: 1e3 }[i] || 864e5),
    );
  });
  f("DatePart", (i, v) =>
    g(v, (d, t) => {
      switch (String(i).toLowerCase()) {
        case "yyyy":
          return d.getUTCFullYear();
        case "q":
          return Math.floor(d.getUTCMonth() / 3) + 1;
        case "m":
          return d.getUTCMonth() + 1;
        case "d":
          return d.getUTCDate();
        case "h":
          return d.getUTCHours();
        case "n":
          return d.getUTCMinutes();
        case "s":
          return d.getUTCSeconds();
        case "w":
          return d.getUTCDay() + 1;
        case "y":
          return (
            Math.floor((t - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) +
            1
          );
        default:
          return null;
      }
    }),
  );

  f("xIsNull", isNull);
  f("IsNull", isNull);
  f("Switch", (...a) => {
    for (let i = 0; i + 1 < a.length; i += 2) if (a[i]) return a[i + 1];
    return null;
  });
  f(
    "Fix",
    nn((v) => Math.trunc(Number(v))),
  );
  f(
    "Sgn",
    nn((v) => Math.sign(Number(v))),
  );
  f(
    "xInt",
    nn((v) => Math.floor(Number(v))),
  );
  for (const n of ["Chr", "ChrW"])
    f(
      n,
      nn((c) => String.fromCharCode(c)),
    );
  f("Asc", (s) => (s ? String(s).charCodeAt(0) : null));
  f("Space", (n) => " ".repeat(Math.max(0, n | 0)));
  f(
    "StrReverse",
    nn((s) => [...String(s)].reverse().join("")),
  );
  f("xFormat", (v, fm) => {
    if (v == null) return null;
    fm = String(fm || "");
    if (/yy|mm|dd|hh|nn|ss/i.test(fm)) {
      const t = pd(v);
      if (t == null) return String(v);
      const d = new Date(t);
      const parts = {
        yyyy: d.getUTCFullYear(),
        yy: String(d.getUTCFullYear()).slice(2),
        mm: p2(d.getUTCMonth() + 1),
        dd: p2(d.getUTCDate()),
        hh: p2(d.getUTCHours()),
        nn: p2(d.getUTCMinutes()),
        ss: p2(d.getUTCSeconds()),
      };
      // "hh:mm" means minutes, not month
      return fm
        .replace(/(hh[:.]?)mm/gi, "$1nn")
        .replace(
          /yyyy|yy|mm|dd|hh|nn|ss/gi,
          (k) => parts[k.toLowerCase()],
        );
    }
    const n = Number(v);
    if (isNaN(n)) return String(v);
    const [intFmt, decFmt = ""] = fm.split(".");
    const zeros = (intFmt.match(/0/g) || []).length;
    let [ip, fr] = Math.abs(n).toFixed(decFmt.length).split(".");
    ip = ip.padStart(zeros, "0");
    if (intFmt.includes(","))
      ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (n < 0 ? "-" : "") + ip + (fr ? "." + fr : "");
  });

  // case-insensitive, Unicode-normalized LIKE
  const likeCache = new Map();
  const reEsc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nz = (s) => String(s).normalize("NFC").toLowerCase();
  d.create_function("like", function (p, s) {
    if (p == null || s == null) return null;
    p = nz(p);
    let re = likeCache.get(p);
    if (!re) {
      re = new RegExp(
        "^" +
          [...p]
            .map((c) =>
              c === "%" ? "[\\s\\S]*" : c === "_" ? "[\\s\\S]" : reEsc(c),
            )
            .join("") +
          "$",
      );
      likeCache.set(p, re);
    }
    return re.test(nz(s)) ? 1 : 0;
  });
}

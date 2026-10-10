/* VarStat — analysis of variance for fixed-effects linear models.
   Model language (compatible with the Sisvar conventions):
     A            main effect
     A*B          interaction
     A(B)  A(B*C) nested effect (one level of parentheses)
     error=TERM   an intermediate error term; effects listed before it (and after
                  the previous error) are tested against it. The last error is
                  always obtained by difference (residual).
   Column names containing spaces/operators can be written in [square brackets]. */
(function (root) {
  'use strict';
  const D = root.Dist || require('./dist.js');
  const T = (s, ...a) => (root.I18N ? root.I18N.t(s, ...a) : s.replace(/\{(\d+)\}/g, (m, i) => a[i]));
  const L = root.LinAlg || require('./linalg.js');

  // ---------------- helpers ----------------
  const isMissing = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v));
  function naturalCompare(a, b) {
    const na = Number(a), nb = Number(b);
    const aNum = typeof a === 'number' || (a !== '' && !isNaN(na)), bNum = typeof b === 'number' || (b !== '' && !isNaN(nb));
    if (aNum && bNum) return na - nb;
    if (aNum) return -1; if (bNum) return 1;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }
  function levelsOf(values) {
    const seen = new Map();
    for (const v of values) if (!isMissing(v)) { const k = String(v); if (!seen.has(k)) seen.set(k, v); }
    return [...seen.values()].sort(naturalCompare);
  }

  const TRANSFORMS = {
    none: { label: 'None', f: (x) => x, ok: () => true },
    sqrt: { label: 'X^0.5', f: (x) => Math.sqrt(x), ok: (x) => x >= 0 },
    sqrt05: { label: '(X + 0.5)^0.5', f: (x) => Math.sqrt(x + 0.5), ok: (x) => x >= -0.5 },
    sqrt1: { label: '(X + 1)^0.5', f: (x) => Math.sqrt(x + 1), ok: (x) => x >= -1 },
    log10: { label: 'Log10(X)', f: (x) => Math.log10(x), ok: (x) => x > 0 },
    ln: { label: 'Ln(X)', f: (x) => Math.log(x), ok: (x) => x > 0 },
  };

  // ---------------- model parsing ----------------
  function tokenizeFactorList(s) {
    // split by '*' outside brackets
    const out = []; let cur = '', br = 0;
    for (const ch of s) {
      if (ch === '[') br++;
      if (ch === ']') br--;
      if (ch === '*' && br === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim().replace(/^\[(.*)\]$/, '$1').trim()).filter((x) => x.length);
  }
  function parseTerm(text, columnNames) {
    let s = text.trim();
    let type = 'effect';
    const m = /^(erro|error)\s*=\s*(.*)$/i.exec(s);
    if (m) { type = 'error'; s = m[2]; }
    // find nesting parentheses outside brackets
    let depth = 0, br = 0, open = -1, close = -1;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '[') br++; else if (ch === ']') br--;
      else if (br === 0 && ch === '(') { if (depth === 0 && open < 0) open = i; depth++; if (depth > 1) throw new Error(T('Only one level of parentheses is allowed: {0}', text)); }
      else if (br === 0 && ch === ')') { depth--; if (depth === 0) close = i; }
    }
    if (depth !== 0) throw new Error(T('Unbalanced parentheses in: {0}', text));
    let main = s, within = '';
    if (open >= 0) {
      main = s.slice(0, open); within = s.slice(open + 1, close);
      if (s.slice(close + 1).trim()) throw new Error(T('Unexpected text after ")" in: {0}', text));
    }
    const factors = tokenizeFactorList(main), win = within ? tokenizeFactorList(within) : [];
    if (!factors.length) throw new Error(T('Empty source of variation: {0}', text));
    for (const f of [...factors, ...win]) {
      if (columnNames && !columnNames.includes(f)) {
        const ci = columnNames.find((c) => c.toLowerCase() === f.toLowerCase());
        if (!ci) throw new Error(T('Unknown variable "{0}" in: {1}', f, text));
      }
    }
    const fix = (f) => columnNames ? (columnNames.includes(f) ? f : columnNames.find((c) => c.toLowerCase() === f.toLowerCase())) : f;
    return makeTerm(type, factors.map(fix), win.map(fix));
  }
  const q = (n) => /[\s*()=\[\]]/.test(n) ? '[' + n + ']' : n;
  function makeTerm(type, factors, within = []) {
    const label = factors.map(q).join('*') + (within.length ? '(' + within.map(q).join('*') + ')' : '');
    const t = { type, factors, within, all: [...factors, ...within], label };
    Object.defineProperty(t, 'display', { enumerable: true, get: () => (type === 'error' ? T('error') + ' = ' : '') + label });
    return t;
  }
  function parseModel(lines, columnNames) {
    return lines.map((l) => l.trim()).filter((l) => l && !/^(fim|end)$/i.test(l)).map((l) => parseTerm(l, columnNames));
  }

  // ---------------- core fit ----------------
  function fitModel(data, terms, yName, transform = 'none') {
    const col = (n) => { const c = data.columns.find((c) => c.name === n); if (!c) throw new Error(T('Variable not found: {0}', n)); return c.values; };
    const Y = col(yName);
    const facNames = [...new Set(terms.flatMap((t) => t.all))];
    if (facNames.includes(yName)) throw new Error(T('The response "{0}" is also used as a source of variation.', yName));
    const F = Object.fromEntries(facNames.map((n) => [n, col(n)]));
    const tf = TRANSFORMS[transform] || TRANSFORMS.none;
    const idx = [];
    for (let i = 0; i < Y.length; i++) {
      const v = typeof Y[i] === 'number' ? Y[i] : (isMissing(Y[i]) ? NaN : Number(Y[i]));
      if (!isFinite(v)) continue;
      if (facNames.some((n) => isMissing(F[n][i]))) continue;
      if (!tf.ok(v)) throw new Error(T('Transformation {0} cannot be applied: "{1}" has value {2} (row {3}).', tf.label, yName, v, i + 1));
      idx.push(i);
    }
    const n = idx.length;
    if (n < 2) throw new Error(T('Not enough valid observations for "{0}".', yName));
    const yOrig = Float64Array.from(idx, (i) => Number(Y[i]));
    const y = Float64Array.from(yOrig, tf.f);
    const ybar = L.mean(y);
    const yc = Float64Array.from(y, (v) => v - ybar);
    const sst = L.dot(yc, yc);
    const basis = new L.SeqBasis(n);
    basis.add([new Float64Array(n).fill(1)], y);
    const keyOf = (i, names) => names.map((nm) => String(F[nm][idx[i]])).join('\u0001');
    const rows = [];
    let ssAcc = 0;
    for (const t of terms) {
      const map = new Map();
      for (let i = 0; i < n; i++) { const k = keyOf(i, t.all); let v = map.get(k); if (!v) { v = new Float64Array(n); map.set(k, v); } v[i] = 1; }
      const r = basis.add([...map.values()], y);
      rows.push({ term: t, label: t.display, df: r.df, ss: r.ss });
      ssAcc += r.ss;
    }
    const dfRes = n - basis.Q.length;
    const ssRes = Math.max(0, sst - ssAcc);
    // attach error terms
    const errors = [];
    rows.forEach((r, i) => { if (r.term.type === 'error') errors.push(i); });
    const resName = errors.length ? T('Error {0}', errors.length + 1) : T('Error');
    const residual = { label: resName, errorName: resName, df: dfRes, ss: ssRes, ms: dfRes > 0 ? ssRes / dfRes : NaN, isResidual: true };
    const errorObjs = errors.map((ri, k) => { const r = rows[ri]; r.ms = r.df > 0 ? r.ss / r.df : NaN; r.errorName = T('Error {0}', k + 1); return r; });
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      r.ms = r.df > 0 ? r.ss / r.df : NaN;
      if (r.term.type === 'error') continue;
      const nextErr = errors.find((e) => e > i);
      const E = nextErr !== undefined ? rows[nextErr] : residual;
      r.error = E;
      if (r.df > 0 && E.df > 0 && E.ms > 0) { r.F = r.ms / E.ms; r.p = D.pf(r.F, r.df, E.df, true); }
      else if (r.df > 0 && E.df > 0 && E.ms === 0) { r.F = Infinity; r.p = 0; }
    }
    const errorList = [...errorObjs, residual];
    const cv = errorList.map((e) => ({ name: e.errorName || e.label, cv: 100 * Math.sqrt(e.ms) / Math.abs(ybar) }));
    return { yName, transform, tfLabel: tf.label, n, idx, y, yOrig, ybar, ybarOrig: L.mean(yOrig), sst, rows, residual, errorList, cv, F, terms };
  }

  // Group means for a set of factor names
  function cellStats(fit, names, filter) {
    const map = new Map();
    for (let i = 0; i < fit.n; i++) {
      if (filter && !filter(i)) continue;
      const levels = names.map((nm) => fit.F[nm][fit.idx[i]]);
      const k = levels.map(String).join('\u0001');
      let c = map.get(k);
      if (!c) { c = { levels, n: 0, sum: 0, sumO: 0 }; map.set(k, c); }
      c.n++; c.sum += fit.y[i]; c.sumO += fit.yOrig[i];
    }
    const out = [...map.values()].map((c) => ({ ...c, mean: c.sum / c.n, origMean: c.sumO / c.n }));
    out.sort((a, b) => { for (let j = 0; j < names.length; j++) { const d = naturalCompare(a.levels[j], b.levels[j]); if (d) return d; } return 0; });
    return out;
  }

  // ---------------- multiple comparisons ----------------
  const harmonic = (ns) => ns.length / ns.reduce((s, v) => s + 1 / v, 0);
  function lettersFromIntervals(k, homogeneous) {
    const ivs = [];
    let lastJ = -1;
    for (let i = 0; i < k; i++) {
      let j = i;
      while (j + 1 < k && homogeneous(i, j + 1)) j++;
      if (j > lastJ) { ivs.push([i, j]); lastJ = j; }
    }
    const letters = Array.from({ length: k }, () => []);
    ivs.forEach(([a, b], g) => { for (let x = a; x <= b; x++) letters[x].push(letterName(g)); });
    return letters.map((l) => l.join(' '));
  }
  function letterName(g) { // a..z, then a1.. style beyond 26
    const base = 'abcdefghijklmnopqrstuvwxyz';
    return g < 26 ? base[g] : base[g % 26] + Math.floor(g / 26);
  }

  function scottKnottGroups(means, mse, r, df, alpha) {
    // means: ascending order. returns array of group ids per position.
    const s2y = mse / r; // variance of a mean
    const groups = [];
    const c = Math.PI / (2 * (Math.PI - 2));
    function rec(lo, hi) { // inclusive
      const k = hi - lo + 1;
      if (k === 1) { groups.push([lo, hi]); return; }
      let tot = 0; for (let i = lo; i <= hi; i++) tot += means[i];
      const gm = tot / k;
      let best = -1, bestB = -Infinity, t1 = 0;
      for (let s = lo; s < hi; s++) {
        t1 += means[s];
        const k1 = s - lo + 1, k2 = k - k1, t2 = tot - t1;
        const B = t1 * t1 / k1 + t2 * t2 / k2 - tot * tot / k;
        if (best < 0 || B > bestB + 1e-12 * Math.abs(bestB)) { bestB = B; best = s; }
      }
      let ssm = 0; for (let i = lo; i <= hi; i++) ssm += (means[i] - gm) ** 2;
      const sigma2 = (ssm + df * s2y) / (k + df);
      const lambda = sigma2 > 0 ? c * bestB / sigma2 : Infinity;
      const v0 = k / (Math.PI - 2);
      const crit = D.qchisq(1 - alpha, v0);
      if (lambda > crit) { rec(lo, best); rec(best + 1, hi); } else groups.push([lo, hi]);
    }
    rec(0, means.length - 1);
    return groups;
  }

  // Waller–Duncan Bayesian k-ratio t: solves ratio of integrals = K
  function wallerT(K, F, qdf, f) {
    const nu = qdf + f;
    const h = (z) => ((nu + z * z) / (nu - 1)) * D.dt(z, nu) + z * D.pt(z, nu);
    const GL = D.gaussLegendre(40), pieces = 24;
    const pts = [];
    for (let p = 0; p < pieces; p++) {
      const a = p / pieces, b = (p + 1) / pieces, c = (a + b) / 2, r = (b - a) / 2;
      for (let i = 0; i < GL.x.length; i++) {
        const w = c + r * GL.x[i];
        const lg = Math.log(2) + 0.5 * Math.log(1 - w * w) + (qdf - 1) * Math.log(w) - ((f + qdf - 1) / 2) * Math.log(f + qdf * F * w * w);
        const bb = Math.sqrt(nu * (1 - w * w) / (f + qdf * F * w * w));
        pts.push({ lw: lg + Math.log(GL.w[i] * r), bb });
      }
    }
    const mx = Math.max(...pts.map((p) => p.lw));
    pts.forEach((p) => { p.w = Math.exp(p.lw - mx); });
    const ratio = (t) => { let N = 0, Dd = 0; for (const p of pts) { N += p.w * h(t * p.bb); Dd += p.w * h(-t * p.bb); } return N / Dd; };
    return D.solveMonotone(ratio, K, 0.0001, 20, true, 1e-10);
  }

  /* items: [{label, mean, n, origMean}] ; returns result object */
  function compareMeans(items, { method, alpha = 0.05, mse, df, F, qdf, kratio, order = 'asc' }) {
    const k = items.length;
    const sorted = items.map((it) => ({ ...it })).sort((a, b) => a.mean - b.mean);
    const means = sorted.map((s) => s.mean);
    const r = harmonic(sorted.map((s) => s.n));
    const se = Math.sqrt(mse / r);
    const res = { method, alpha, k, r, se, mse, df, rows: sorted, info: [] };
    if (k < 2) { sorted.forEach((s) => (s.letters = 'a')); return res; }
    let homog;
    if (method === 'tukey') {
      const qv = D.qtukey(1 - alpha, k, df), dms = qv * se;
      res.info.push([T('Minimum significant difference (MSD)'), dms], [T('Studentized range q'), qv]);
      res.dms = dms; homog = (i, j) => means[j] - means[i] <= dms * (1 + 1e-12);
    } else if (method === 'snk') {
      const dmsP = [0, 0];
      for (let p = 2; p <= k; p++) { dmsP[p] = D.qtukey(1 - alpha, p, df) * se; res.info.push([T('MSD for {0} means', p), dmsP[p]]); }
      const H = Array.from({ length: k }, () => new Array(k).fill(false));
      for (let len = k; len >= 1; len--) for (let i = 0; i + len - 1 < k; i++) {
        const j = i + len - 1;
        H[i][j] = len === 1 || (means[j] - means[i] <= dmsP[len] * (1 + 1e-12)) || (i > 0 && H[i - 1][j]) || (j < k - 1 && H[i][j + 1]);
      }
      homog = (i, j) => H[i][j];
    } else if (method === 'lsd' || method === 'bonferroni') {
      const a = method === 'bonferroni' ? alpha / (k * (k - 1) / 2) : alpha;
      const tv = D.qt(1 - a / 2, df), dms = tv * Math.sqrt(2) * se;
      if (method === 'bonferroni') res.info.push([T('Per-comparison significance level'), a]);
      res.info.push([T('Minimum significant difference (MSD)'), dms], [T('Critical t'), tv]);
      res.dms = dms; homog = (i, j) => means[j] - means[i] <= dms * (1 + 1e-12);
    } else if (method === 'wallerduncan') {
      const K = kratio || (alpha <= 0.01 ? 500 : alpha >= 0.1 ? 50 : 100);
      if (!(F > 1)) {
        res.info.push([T('k-ratio'), K], [T('Note'), T('F ≤ 1: no differences are declared by the Waller–Duncan test')]);
        homog = () => true;
      } else {
        const tb = wallerT(K, F, qdf || k - 1, df), dms = tb * Math.sqrt(2) * se;
        res.info.push([T('k-ratio'), K], [T('F value'), F], [T('Critical value of t (Waller–Duncan)'), tb], [T('Minimum significant difference (MSD)'), dms]);
        res.dms = dms; homog = (i, j) => means[j] - means[i] <= dms * (1 + 1e-12);
      }
    } else if (method === 'scottknott') {
      const groups = scottKnottGroups(means, mse, r, df, alpha);
      groups.forEach(([a, b], g) => { for (let x = a; x <= b; x++) sorted[x].letters = letterName(g); });
      res.groups = groups.length;
      if (order === 'desc') res.rows = sorted.slice().reverse();
      return res;
    } else throw new Error('Unknown test: ' + method);
    const letters = lettersFromIntervals(k, homog);
    sorted.forEach((s, i) => (s.letters = letters[i]));
    if (order === 'desc') res.rows = sorted.slice().reverse();
    return res;
  }

  // ---------------- contrasts ----------------
  function contrasts(items, coefSets, { mse, df }) {
    const kq = items.length;
    return coefSets.map((cs) => {
      const c = cs.coefs;
      let est = 0, v = 0, sumc = 0;
      items.forEach((it, i) => { const ci = c[i] || 0; est += ci * it.mean; v += ci * ci / it.n; sumc += ci; });
      const varC = mse * v, se = Math.sqrt(varC), t = est / se;
      const pT = 2 * D.pt(-Math.abs(t), df);
      const Fv = t * t, ss = est * est / v;
      const scheffeF = Fv / (kq - 1), pS = D.pf(scheffeF, kq - 1, df, true);
      return { name: cs.name, coefs: c, estimate: est, variance: varC, se, t, pT, F: Fv, pF: pT, ss, scheffeF, pScheffe: pS, sumc };
    });
  }

  // ---------------- regression on quantitative levels ----------------
  const REG_TERMS = [
    null,
    { label: 'X', f: (x) => x }, { label: 'X^2', f: (x) => x ** 2 }, { label: 'X^3', f: (x) => x ** 3 },
    { label: 'X^4', f: (x) => x ** 4 }, { label: 'X^5', f: (x) => x ** 5 }, { label: 'X^6', f: (x) => x ** 6 },
    { label: 'SQRT(X)', f: Math.sqrt }, { label: 'X^(1/3)', f: Math.cbrt }, { label: '1/X', f: (x) => 1 / x },
    { label: 'Log(X)', f: Math.log10 }, { label: 'Ln(X)', f: Math.log }, { label: 'Sin(X)', f: Math.sin },
    { label: 'Cos(X)', f: Math.cos }, { label: 'Tan(X)', f: Math.tan }, { label: '1/(X + 0.5)', f: (x) => 1 / (x + 0.5) },
    { label: 'Exp(X)', f: Math.exp }, { label: 'Exp[-(X^2)/2]', f: (x) => Math.exp(-x * x / 2) }, { label: 'Log2(X)', f: Math.log2 },
    { label: 'Sinh(X)', f: Math.sinh }, { label: 'Cosh(X)', f: Math.cosh }, { label: 'Tanh(X)', f: Math.tanh },
    { label: 'Cot(X)', f: (x) => 1 / Math.tan(x) }, { label: 'Ln(X)*Tan(X)', f: (x) => Math.log(x) * Math.tan(x) },
    { label: 'Exp(X)*Sinh(X)', f: (x) => Math.exp(x) * Math.sinh(x) },
  ];
  function regressionOnLevels(items, termIds, { mse, df }) {
    // items: [{x, mean, n}]
    const X0 = items.map((it) => Number(it.x));
    if (X0.some((v) => !isFinite(v))) throw new Error(T('Regression requires a numeric (quantitative) factor.'));
    const w = items.map((it) => it.n), ym = items.map((it) => it.mean);
    const W = L.sum(w), gm = L.sum(items.map((it) => it.n * it.mean)) / W;
    const ssFactor = L.sum(items.map((it) => it.n * (it.mean - gm) ** 2));
    const dfFactor = items.length - 1;
    const cols = termIds.map((id) => { const T = REG_TERMS[id]; return { id, label: T.label, v: X0.map(T.f) }; });
    for (const c of cols) if (c.v.some((v) => !isFinite(v))) throw new Error(T('Term {0} is undefined for some level of X (e.g. log or 1/X of 0).', c.label));
    // sequential SS
    const seq = [];
    let prevSSR = 0;
    const models = [];
    const usable = [];
    for (let m = 1; m <= cols.length; m++) {
      const X = items.map((_, i) => [1, ...cols.slice(0, m).map((c) => c.v[i])]);
      const fit = L.lstsq(X, ym, w);
      const fitted = X.map((row) => L.dot(row, fit.b));
      const ssr = L.sum(items.map((it, i) => it.n * (fitted[i] - gm) ** 2));
      const dSS = Math.max(0, ssr - prevSSR);
      const aliased = fit.aliased[m];
      seq.push({ label: cols[m - 1].label, df: aliased ? 0 : 1, ss: aliased ? 0 : dSS });
      if (!aliased) {
        prevSSR = ssr;
        usable.push(m - 1);
        const coefs = Array.from(fit.b).map((b, j) => {
          const se = Math.sqrt(mse * fit.ginv[j][j]);
          const t = b / se;
          return { name: j === 0 ? 'b0' : 'b' + j, term: j === 0 ? T('Intercept') : cols[j - 1].label, estimate: b, se, t, p: fit.aliased[j] ? NaN : 2 * D.pt(-Math.abs(t), df), aliased: fit.aliased[j] };
        });
        const nTermsUsed = 1 + fit.aliased.slice(1).filter((a) => !a).length;
        const lackDf = dfFactor - (nTermsUsed - 1);
        models.push({ terms: cols.slice(0, m).map((c) => c.label), termIds: termIds.slice(0, m), coefs, r2: ssFactor > 0 ? ssr / ssFactor : NaN, ssr, fitted, lackDf, lackSS: Math.max(0, ssFactor - ssr), b: Array.from(fit.b) });
      }
    }
    const dfReg = seq.reduce((s, r) => s + r.df, 0);
    const devDf = dfFactor - dfReg, devSS = Math.max(0, ssFactor - prevSSR);
    const table = [...seq.map((r) => ({ ...r })), { label: T('Deviation from regression'), df: devDf, ss: devSS }];
    table.forEach((r) => { r.ms = r.df > 0 ? r.ss / r.df : NaN; if (r.df > 0 && df > 0) { r.F = r.ms / mse; r.p = D.pf(r.F, r.df, df, true); } });
    table.push({ label: T('Error'), df, ss: mse * df, ms: mse });
    return { ssFactor, dfFactor, table, models, x: X0, means: ym, ns: w };
  }

  // ---------------- complex variance (Satterthwaite) ----------------
  function complexVariance(fit, { b, k, ea, eb }) {
    const E = fit.errorList;
    const A = E[ea - 1], B = E[eb - 1];
    if (!A || !B) throw new Error(T('Complex variance: error number out of range (the analysis has {0} errors).', E.length));
    const num = A.ms + b * B.ms;
    const vc = num / k;
    const dfv = num * num / (A.ms * A.ms / A.df + (b * B.ms) ** 2 / B.df);
    // Sisvar convention: Satterthwaite DF rounded to the nearest integer
    return { mse: vc, df: Math.max(1, Math.round(dfv)), dfExact: dfv, A, B, b, k };
  }

  // Which error tests a given factor name (its main effect term), else fallback
  function errorForFactor(fit, name, fallbackRow) {
    const r = fit.rows.find((r) => r.term.type === 'effect' && r.term.all.length === 1 && r.term.all[0] === name);
    return (r && r.error) || (fallbackRow && fallbackRow.error) || fit.residual;
  }

  const fmtLevel = (v) => String(v);

  /* Build the report blocks for one response/transform. plan.options: { [termIndex]: [ {test, alpha, unfold, contrasts, regTerms, complex, kratio} ] } */
  function analyze(data, terms, yName, transform, plan, settings = {}) {
    const fit = fitModel(data, terms, yName, transform);
    const blocks = [];
    const tlabel = transform && transform !== 'none' ? ' — ' + T('transformation: {0}', fit.tfLabel) : '';
    blocks.push({ type: 'heading', level: 2, text: T('Response variable: {0}', yName) + tlabel });
    // ANOVA table
    const trows = [];
    for (const r of fit.rows) {
      trows.push([r.term.type === 'error' ? `${r.errorName} (${r.term.label})` : r.label, r.df, r.ss, r.ms, r.term.type === 'error' ? '' : r.F, r.term.type === 'error' ? '' : r.p]);
    }
    trows.push([fit.residual.label, fit.residual.df, fit.residual.ss, fit.residual.ms, '', '']);
    trows.push([T('Corrected total'), fit.n - 1, fit.sst, '', '', '']);
    blocks.push({ type: 'table', title: T('Analysis of variance'), columns: [T('Source of variation'), T('DF'), T('SS'), T('MS'), T('F'), T('Pr > F')], kinds: ['text', 'int', 'num', 'num', 'num', 'p'], rows: trows, emphasizeLast: true });
    const notes = fit.cv.map((c) => [fit.cv.length > 1 ? T('CV {0} (%)', '(' + c.name + ')') : T('CV (%)'), c.cv]);
    notes.push([T('Overall mean'), fit.ybar], [T('Number of observations'), fit.n]);
    if (transform && transform !== 'none') notes.push([T('Overall mean (original scale)'), fit.ybarOrig]);
    blocks.push({ type: 'kv', rows: notes });
    for (const r of fit.rows) if (r.term.type === 'error' && r.df === 0) blocks.push({ type: 'warning', text: T('{0} ({1}) has zero degrees of freedom — check the model.', r.errorName, r.term.label) });

    // options per source
    const opts = plan || {};
    fit.rows.forEach((row, ti) => {
      const list = opts[ti] || [];
      for (const op of list) {
        if (!op || op.test === 'none') continue;
        try { blocks.push(...runOption(fit, row, op, settings)); }
        catch (e) { blocks.push({ type: 'warning', text: `${row.label}: ${e.message}` }); }
      }
    });
    return { fit, blocks };
  }

  const TEST_NAMES = { tukey: 'Tukey test', snk: 'Student–Newman–Keuls (SNK) test', bonferroni: 'Bonferroni t test', lsd: 't test (LSD)', scottknott: 'Scott–Knott test', wallerduncan: 'Waller–Duncan k-ratio t test', contrasts: 'Contrasts', regression: 'Regression analysis' };

  function runOption(fit, row, op, settings) {
    const blocks = [];
    const transformed = fit.transform && fit.transform !== 'none';
    const term = row.term;
    const alpha = op.alpha > 0 && op.alpha < 1 ? op.alpha : 0.05;
    if (term.all.length === 1) {
      const E = row.error || fit.residual;
      const cs = cellStats(fit, term.all);
      const items = cs.map((c) => ({ label: fmtLevel(c.levels[0]), x: c.levels[0], mean: c.mean, n: c.n, origMean: c.origMean }));
      blocks.push({ type: 'heading', level: 3, text: T('{0} for source {1}', T(TEST_NAMES[op.test]), row.label) + (op.test === 'regression' || op.test === 'contrasts' ? '' : ' — ' + T('significance level {0}', alpha)) });
      blocks.push(...applyTest(items, op, { mse: E.ms, df: E.df, F: row.F, qdf: row.df, alpha, factor: term.all[0], transformed, errLabel: E.errorName || E.label }, settings));
      return blocks;
    }
    // interaction / nested: unfold
    const U = op.unfold && term.all.includes(op.unfold) ? op.unfold : term.factors[0];
    const others = term.all.filter((n) => n !== U);
    let mse, df, errLabel;
    if (op.complex && op.complex.use) {
      const cv = complexVariance(fit, op.complex);
      mse = cv.mse; df = cv.df; errLabel = T('Complex variance');
      blocks.push({ type: 'heading', level: 3, text: T('Unfolding {0} within each level of {1} (source {2})', U, others.join('*'), row.label) });
      blocks.push({ type: 'kv', rows: [
        [T('Complex variance VC = [MS({0}) + b·MS({1})] / k', cv.A.errorName, cv.B.errorName), cv.mse],
        ['b', cv.b], ['k', cv.k],
        [T('MS {0} (DF {1})', cv.A.errorName || cv.A.label, cv.A.df), cv.A.ms], [T('MS {0} (DF {1})', cv.B.errorName || cv.B.label, cv.B.df), cv.B.ms],
        [T('Satterthwaite degrees of freedom (exact)'), cv.dfExact], [T('Degrees of freedom used (rounded)'), cv.df]] });
    } else {
      const E = errorForFactor(fit, U, row);
      mse = E.ms; df = E.df; errLabel = E.errorName || E.label;
      blocks.push({ type: 'heading', level: 3, text: T('Unfolding {0} within each level of {1} (source {2})', U, others.join('*'), row.label) });
    }
    const combos = cellStats(fit, others);
    const slices = combos.map((c) => {
      const filt = (i) => others.every((nm, j) => String(fit.F[nm][fit.idx[i]]) === String(c.levels[j]));
      const cells = cellStats(fit, [U], filt);
      const tot = L.sum(cells.map((x) => x.sum)), nn = L.sum(cells.map((x) => x.n)), m = tot / nn;
      const ss = L.sum(cells.map((x) => x.n * (x.mean - m) ** 2));
      const dfS = cells.length - 1;
      const ms = dfS > 0 ? ss / dfS : NaN;
      const F = mse > 0 ? ms / mse : NaN;
      return { name: others.map((nm, j) => `${nm} = ${c.levels[j]}`).join(', '), cells, ss, df: dfS, ms, F, p: dfS > 0 ? D.pf(F, dfS, df, true) : NaN };
    });
    const arows = slices.map((s) => [T('{0} within {1}', U, s.name), s.df, s.ss, s.ms, s.F, s.p]);
    arows.push([errLabel, df, mse * df, mse, '', '']);
    blocks.push({ type: 'table', title: T('Analysis of variance of the unfolding of {0}', U), columns: [T('Source of variation'), T('DF'), T('SS'), T('MS'), T('F'), T('Pr > F')], kinds: ['text', 'num', 'num', 'num', 'num', 'p'], rows: arows });
    for (const s of slices) {
      if (s.cells.length < 2) continue;
      blocks.push({ type: 'heading', level: 4, text: T(TEST_NAMES[op.test]) + ' — ' + T('{0} within {1}', U, s.name) + (op.test === 'regression' || op.test === 'contrasts' ? '' : ' (' + T('significance level {0}', alpha) + ')') });
      const items = s.cells.map((c) => ({ label: fmtLevel(c.levels[0]), x: c.levels[0], mean: c.mean, n: c.n, origMean: c.origMean }));
      blocks.push(...applyTest(items, op, { mse, df, F: s.F, qdf: s.df, alpha, factor: U, transformed, errLabel, slice: s.name }, settings));
    }
    return blocks;
  }

  function applyTest(items, op, ctx, settings) {
    const blocks = [];
    const { mse, df, alpha, transformed } = ctx;
    if (op.test === 'contrasts') {
      const sets = (op.contrasts || []).map((c) => ({ name: c.name, coefs: items.map((it) => Number(c.coefs[String(it.x)] ?? c.coefs[it.label] ?? 0)) }));
      const res = contrasts(items, sets, { mse, df });
      blocks.push({ type: 'table', title: T('Contrast coefficients'), columns: [T('Level'), T('Mean'), 'n', ...sets.map((s) => s.name)], kinds: ['text', 'num', 'int', ...sets.map(() => 'num')], rows: items.map((it, i) => [it.label, it.mean, it.n, ...sets.map((s) => s.coefs[i])]) });
      blocks.push({ type: 'table', title: T('Contrast estimates and tests'), columns: [T('Contrast'), T('Estimate'), T('Variance'), T('Std. error'), 't', T('Pr > |t|'), 'F', T('Pr > F'), T('Scheffé F'), T('Pr (Scheffé)')], kinds: ['text', 'num', 'num', 'num', 'num', 'p', 'num', 'p', 'num', 'p'],
        rows: res.map((r) => [r.name, r.estimate, r.variance, r.se, r.t, r.pT, r.F, r.pF, r.scheffeF, r.pScheffe]) });
      res.forEach((r) => { if (Math.abs(r.sumc) > 1e-9) blocks.push({ type: 'warning', text: T('Coefficients of {0} do not sum to zero.', r.name) }); });
      blocks.push({ type: 'kv', rows: [[T('Error mean square'), mse], [T('Error degrees of freedom'), df]] });
      return blocks;
    }
    if (op.test === 'regression') {
      const reg = regressionOnLevels(items, op.regTerms && op.regTerms.length ? op.regTerms : [1, 2], { mse, df });
      blocks.push({ type: 'table', title: T('Regression analysis of variance (sequential sums of squares)'), columns: [T('Source of variation'), T('DF'), T('SS'), T('MS'), T('F'), T('Pr > F')], kinds: ['text', 'num', 'num', 'num', 'num', 'p'],
        rows: reg.table.map((r) => [r.label, r.df, r.ss, r.ms, r.F ?? '', r.p ?? '']) });
      reg.models.forEach((m, mi) => {
        blocks.push({ type: 'heading', level: 5, text: T('Model {0}', mi + 1) + `: Y = b0 + ${m.terms.map((t, j) => 'b' + (j + 1) + '·' + t).join(' + ')}` });
        blocks.push({ type: 'table', columns: [T('Parameter'), T('Term'), T('Estimate'), T('Std. error'), 't', T('Pr > |t|')], kinds: ['text', 'text', 'num', 'num', 'num', 'p'],
          rows: m.coefs.map((c) => [c.name, c.term, c.aliased ? T('aliased') : c.estimate, c.aliased ? '' : c.se, c.aliased ? '' : c.t, c.aliased ? '' : c.p]) });
        const kv = [[T('R² (%)'), 100 * m.r2], [T('Sum of squares of the model'), m.ssr]];
        if (m.lackDf > 0) { const msl = m.lackSS / m.lackDf, Fl = msl / mse; kv.push([T('Lack of fit (deviation): DF'), m.lackDf], [T('Lack of fit F'), Fl], [T('Lack of fit Pr > F'), D.pf(Fl, m.lackDf, df, true), 'p']); }
        blocks.push({ type: 'kv', rows: kv });
      });
      blocks.push({ type: 'table', title: T('Observed and fitted means'), columns: ['X', 'n', T('Observed mean'), ...reg.models.map((_, i) => T('Fitted (model {0})', i + 1))], kinds: ['text', 'int', 'num', ...reg.models.map(() => 'num')],
        rows: items.map((it, i) => [it.label, it.n, it.mean, ...reg.models.map((m) => m.fitted[i])]) });
      const last = reg.models[reg.models.length - 1];
      if (last) blocks.push({ type: 'chart', kind: 'regression', title: ctx.slice ? T('{0} within {1}', ctx.factor, ctx.slice) : ctx.factor, xLabel: ctx.factor, yLabel: T('Mean'), x: reg.x, y: reg.means, termIds: last.termIds, b: last.b });
      return blocks;
    }
    const res = compareMeans(items, { method: op.test, alpha, mse, df, F: ctx.F, qdf: ctx.qdf, kratio: op.kratio, order: settings.order });
    const head = [[T('Error mean square ({0})', ctx.errLabel), mse], [T('Error degrees of freedom'), df], [T('Harmonic mean of the number of replicates (r)'), res.r], [T('Standard error of a mean'), res.se], ...res.info];
    if (res.groups) head.push([T('Number of groups'), res.groups]);
    blocks.push({ type: 'kv', rows: head });
    const cols = [T('Level'), 'n', transformed ? T('Mean (transformed)') : T('Mean'), ...(transformed ? [T('Original mean')] : []), T('Groups')];
    const kinds = ['text', 'int', 'num', ...(transformed ? ['num'] : []), 'text'];
    blocks.push({ type: 'table', columns: cols, kinds, rows: res.rows.map((r) => [r.label, r.n, r.mean, ...(transformed ? [r.origMean] : []), r.letters]), groupsCol: cols.length - 1 });
    blocks.push({ type: 'note', text: T('Means followed by the same letter do not differ significantly.') });
    return blocks;
  }

  const Anova = { parseModel, parseTerm, makeTerm, fitModel, cellStats, compareMeans, scottKnottGroups, wallerT, contrasts, regressionOnLevels, complexVariance, analyze, levelsOf, naturalCompare, isMissing, TRANSFORMS, REG_TERMS, TEST_NAMES };
  root.Anova = Anova;
  if (typeof module !== 'undefined' && module.exports) module.exports = Anova;
})(typeof globalThis !== 'undefined' ? globalThis : this);

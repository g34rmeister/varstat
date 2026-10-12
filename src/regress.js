/* VarStat — multiple linear regression with user-built regressors,
   type I/II sums of squares, diagnostics and model selection. */
(function (root) {
  'use strict';
  const D = root.Dist || require('./dist.js');
  const L = root.LinAlg || require('./linalg.js');
  const T = (s, ...a) => (root.I18N ? root.I18N.t(s, ...a) : s.replace(/\{(\d+)\}/g, (m, i) => a[i]));

  // ---------- expression parser: + - * / ^ ( ) numbers, variables, [quoted names], functions ----------
  const FUNCS = { log: Math.log10, log10: Math.log10, ln: Math.log, log2: Math.log2, exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh };
  function tokenize(s) {
    const t = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if ('+-*/^(),'.includes(c)) { t.push({ k: c }); i++; continue; }
      if (c === '[') { const j = s.indexOf(']', i); if (j < 0) throw new Error(T('Missing "]" in {0}', s)); t.push({ k: 'id', v: s.slice(i + 1, j) }); i = j + 1; continue; }
      const num = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(s.slice(i));
      if (num) { t.push({ k: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
      const id = /^[A-Za-z_À-ɏ][\w.À-ɏ]*/.exec(s.slice(i));
      if (id) { t.push({ k: 'id', v: id[0] }); i += id[0].length; continue; }
      throw new Error(T('Unexpected character "{0}" in {1}', c, s));
    }
    return t;
  }
  function parseExpr(src, varNames) {
    const toks = tokenize(src); let p = 0;
    const peek = () => toks[p], eat = (k) => { if (!toks[p] || toks[p].k !== k) throw new Error(T('Expected "{0}" in {1}', k, src)); return toks[p++]; };
    const vars = new Set();
    function primary() {
      const t = peek();
      if (!t) throw new Error(T('Incomplete expression: {0}', src));
      if (t.k === 'num') { p++; return () => t.v; }
      if (t.k === '(') { p++; const e = expr(); eat(')'); return e; }
      if (t.k === '-') { p++; const e = power(); return (r) => -e(r); }
      if (t.k === '+') { p++; return power(); }
      if (t.k === 'id') {
        p++;
        if (peek() && peek().k === '(' && FUNCS[t.v.toLowerCase()] && !varNames.includes(t.v)) {
          p++; const a = expr(); eat(')'); const f = FUNCS[t.v.toLowerCase()]; return (r) => f(a(r));
        }
        let name = t.v;
        if (!varNames.includes(name)) { const m = varNames.find((v) => v.toLowerCase() === name.toLowerCase()); if (!m) throw new Error(T('Unknown variable "{0}"', name)); name = m; }
        vars.add(name); return (r) => r[name];
      }
      throw new Error(T('Unexpected "{0}" in {1}', t.k, src));
    }
    function power() { const b = primary(); if (peek() && peek().k === '^') { p++; const e = power(); return (r) => Math.pow(b(r), e(r)); } return b; }
    function term() { let a = power(); while (peek() && (peek().k === '*' || peek().k === '/')) { const op = toks[p++].k, b = power(); const a0 = a; a = op === '*' ? (r) => a0(r) * b(r) : (r) => a0(r) / b(r); } return a; }
    function expr() { let a = term(); while (peek() && (peek().k === '+' || peek().k === '-')) { const op = toks[p++].k, b = term(); const a0 = a; a = op === '+' ? (r) => a0(r) + b(r) : (r) => a0(r) - b(r); } return a; }
    const f = expr();
    if (p < toks.length) throw new Error(T('Unexpected text in expression: {0}', src));
    return { f, vars: [...vars], src };
  }

  function buildMatrix(data, termExprs, yName) {
    const names = data.columns.map((c) => c.name);
    const parsed = termExprs.map((t) => parseExpr(t, names));
    const yP = parseExpr(yName.includes(' ') && !yName.startsWith('[') ? '[' + yName + ']' : yName, names);
    const nr = Math.max(...data.columns.map((c) => c.values.length));
    const rows = [], X = [], y = [];
    for (let i = 0; i < nr; i++) {
      const rec = {};
      let ok = true;
      for (const c of data.columns) rec[c.name] = typeof c.values[i] === 'number' ? c.values[i] : Number.NaN;
      const yi = yP.f(rec);
      if (!isFinite(yi)) continue;
      const xi = parsed.map((pe) => pe.f(rec));
      if (xi.some((v) => !isFinite(v))) ok = false;
      if (!ok) continue;
      rows.push(i); X.push([1, ...xi]); y.push(yi);
    }
    return { rows, X, y, labels: [T('Intercept'), ...termExprs] };
  }

  function olsFit(X, y) {
    const n = y.length, p = X[0].length;
    const fit = L.lstsq(X, y);
    const ybar = L.mean(y);
    const sst = L.sum(y.map((v) => (v - ybar) ** 2));
    const rank = fit.rank, dfE = n - rank, sse = Math.max(0, fit.sse), mse = dfE > 0 ? sse / dfE : NaN;
    const ssr = sst - sse;
    return { n, p, b: Array.from(fit.b), ginv: fit.ginv, XtX: fit.XtX, aliased: fit.aliased, rank, dfE, sse, mse, ssr, sst, ybar };
  }

  function regression(data, termExprs, yName, opts = {}) {
    const alpha = opts.alpha || 0.05;
    const M = buildMatrix(data, termExprs, yName);
    const n = M.y.length, p = M.X[0].length;
    if (n <= p) throw new Error(T('Not enough complete observations ({0}) for {1} parameters.', n, p));
    const F = olsFit(M.X, M.y);
    const dfR = F.rank - 1;
    const res = { yName, n, terms: termExprs, labels: M.labels, fit: F, rows: M.rows };
    res.anova = [
      { source: T('Regression'), df: dfR, ss: F.ssr, ms: F.ssr / dfR, F: (F.ssr / dfR) / F.mse, p: D.pf((F.ssr / dfR) / F.mse, dfR, F.dfE, true) },
      { source: T('Error'), df: F.dfE, ss: F.sse, ms: F.mse },
      { source: T('Corrected total'), df: n - 1, ss: F.sst },
    ];
    res.r2 = F.ssr / F.sst; res.r2adj = 1 - (1 - res.r2) * (n - 1) / F.dfE; res.rootMSE = Math.sqrt(F.mse); res.cv = 100 * res.rootMSE / F.ybar;
    const tcrit = D.qt(1 - alpha / 2, F.dfE);
    const sdY = Math.sqrt(L.variance(M.y));
    const sdX = M.labels.map((_, j) => j === 0 ? NaN : Math.sqrt(L.variance(M.X.map((r) => r[j]))));
    res.coefs = F.b.map((b, j) => {
      const se = Math.sqrt(F.mse * F.ginv[j][j]), t = b / se;
      return { label: M.labels[j], estimate: b, se, t, p: F.aliased[j] ? NaN : 2 * D.pt(-Math.abs(t), F.dfE), low: b - tcrit * se, high: b + tcrit * se, std: j === 0 ? NaN : b * sdX[j] / sdY, aliased: F.aliased[j] };
    });
    // Type I (sequential) SS
    if (opts.type1 || opts.type2 || opts.partialR2) {
      const basis = new L.SeqBasis(n), yv = Float64Array.from(M.y);
      basis.add([new Float64Array(n).fill(1)], yv);
      res.type1 = termExprs.map((t, j) => { const r = basis.add([Float64Array.from(M.X, (row) => row[j + 1])], yv); return { label: t, df: r.df, ss: r.ss }; });
      res.type1.forEach((r) => { r.F = r.df ? r.ss / F.mse : NaN; r.p = r.df ? D.pf(r.F, 1, F.dfE, true) : NaN; });
    }
    if (opts.type2 || opts.partialR2) {
      res.type2 = termExprs.map((t, j) => {
        const Xr = M.X.map((row) => row.filter((_, c) => c !== j + 1));
        const fr = olsFit(Xr, M.y);
        const ss = Math.max(0, fr.sse - F.sse), df = F.rank - fr.rank;
        const Fv = df > 0 ? (ss / df) / F.mse : NaN;
        return { label: t, df, ss, F: Fv, p: df > 0 ? D.pf(Fv, df, F.dfE, true) : NaN, partialR2: ss / (ss + F.sse), semipartialR2: ss / F.sst };
      });
    }
    if (opts.diagnostics) {
      const G = F.ginv;
      res.diag = M.X.map((x, i) => {
        const yhat = L.dot(x, F.b);
        let h = 0; for (let a = 0; a < p; a++) for (let c = 0; c < p; c++) h += x[a] * G[a][c] * x[c];
        const e = M.y[i] - yhat, seFit = Math.sqrt(F.mse * h), seRes = Math.sqrt(F.mse * (1 - h));
        const stud = e / seRes;
        const s2i = ((F.dfE) * F.mse - e * e / (1 - h)) / (F.dfE - 1);
        const rstud = e / Math.sqrt(s2i * (1 - h));
        const cook = stud * stud * h / (F.rank * (1 - h));
        const dffits = rstud * Math.sqrt(h / (1 - h));
        const covratio = Math.pow(s2i / F.mse, F.rank) / (1 - h);
        return { row: M.rows[i] + 1, y: M.y[i], yhat, seFit, low: yhat - tcrit * seFit, high: yhat + tcrit * seFit, resid: e, seRes, stud, rstud, h, cook, dffits, covratio };
      });
    }
    return res;
  }

  // ---------- model selection ----------
  function selection(data, candidates, yName, { method = 'stepwise', alphaIn = 0.05, alphaOut = 0.05 } = {}) {
    const names = data.columns.map((c) => c.name);
    const parsed = candidates.map((t) => parseExpr(t, names));
    const M = buildMatrix(data, candidates, yName);
    const n = M.y.length;
    const fitWith = (set) => olsFit(M.X.map((r) => [1, ...set.map((j) => r[j + 1])]), M.y);
    const steps = [];
    let cur = method === 'backward' ? candidates.map((_, j) => j) : [];
    const partialF = (set, j) => { // F to remove j from set
      const full = fitWith(set), red = fitWith(set.filter((k) => k !== j));
      const ss = red.sse - full.sse, Fv = ss / full.mse;
      return { F: Fv, p: D.pf(Fv, 1, full.dfE, true), ss };
    };
    const enterF = (set, j) => { const r = partialF([...set, j], j); return r; };
    for (let iter = 0; iter < 200; iter++) {
      let changed = false;
      if (method === 'forward' || method === 'stepwise') {
        const out = candidates.map((_, j) => j).filter((j) => !cur.includes(j));
        let best = null;
        for (const j of out) { const r = enterF(cur, j); if (isFinite(r.p) && (!best || r.p < best.p)) best = { j, ...r }; }
        if (best && best.p <= alphaIn) { cur.push(best.j); steps.push({ action: T('Entered'), term: candidates[best.j], F: best.F, p: best.p, model: cur.map((k) => candidates[k]) }); changed = true; }
      }
      if (method === 'backward' || method === 'stepwise') {
        let worst = null;
        for (const j of cur) { const r = partialF(cur, j); if (!worst || r.p > worst.p) worst = { j, ...r }; }
        if (worst && worst.p > alphaOut && (method === 'backward' || cur.length > 0)) {
          if (!(method === 'stepwise' && steps.length && steps[steps.length - 1].term === candidates[worst.j] && steps[steps.length - 1].action === T('Entered'))) {
            cur = cur.filter((k) => k !== worst.j);
            steps.push({ action: T('Removed'), term: candidates[worst.j], F: worst.F, p: worst.p, model: cur.map((k) => candidates[k]) });
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    const finalTerms = cur.sort((a, b) => a - b).map((k) => candidates[k]);
    return { steps, finalTerms, n, final: finalTerms.length ? regression(data, finalTerms, yName, { type1: true, type2: true }) : null };
  }

  const Regress = { parseExpr, buildMatrix, regression, selection, olsFit };
  root.Regress = Regress;
  if (typeof module !== 'undefined' && module.exports) module.exports = Regress;
})(typeof globalThis !== 'undefined' ? globalThis : this);

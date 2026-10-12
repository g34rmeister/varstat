/* VarStat — descriptive statistics, frequency distributions, percentiles,
   Shapiro–Wilk (Royston 1992/1995 approximation), one-sample tests,
   bootstrap estimation of the mean and kernel density estimation. */
(function (root) {
  'use strict';
  const D = root.Dist || require('./dist.js');
  const L = root.LinAlg || require('./linalg.js');
  const T = (s, ...a) => (root.I18N ? root.I18N.t(s, ...a) : s.replace(/\{(\d+)\}/g, (m, i) => a[i]));

  // ---------- moments ----------
  function summary(x, alpha = 0.05) {
    const n = x.length;
    const s = Float64Array.from(x).sort();
    const sum = L.sum(s), mean = sum / n;
    let m2 = 0, m3 = 0, m4 = 0, ss = 0;
    for (const v of s) { const d = v - mean; m2 += d * d; m3 += d ** 3; m4 += d ** 4; ss += v * v; }
    const sc = m2; m2 /= n; m3 /= n; m4 /= n;
    const variance = n > 1 ? sc / (n - 1) : NaN, sd = Math.sqrt(variance), se = sd / Math.sqrt(n);
    const a3 = m3 / Math.pow(m2, 1.5), a4 = m4 / (m2 * m2);
    // sample-adjusted (SAS/Excel) coefficients
    const g1 = n > 2 ? (n / ((n - 1) * (n - 2))) * L.sum(Array.from(s, (v) => ((v - mean) / sd) ** 3)) : NaN;
    const g2 = n > 3 ? (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * L.sum(Array.from(s, (v) => ((v - mean) / sd) ** 4)) - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)) : NaN;
    const t = n > 1 ? D.qt(1 - alpha / 2, n - 1) : NaN;
    const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    return { n, sum, ss, mean, median, min: s[0], max: s[n - 1], range: s[n - 1] - s[0], variance, sd, se, cv: 100 * sd / mean,
      a3, a4, g1, g2, ciLow: mean - t * se, ciHigh: mean + t * se, t, sorted: s, q1: percentile(s, 0.25, 5), q3: percentile(s, 0.75, 5) };
  }

  // ---------- percentiles (SAS PCTLDEF 1–5) ----------
  function percentile(sorted, p, method = 5) {
    const n = sorted.length, x = (i) => sorted[Math.min(n, Math.max(1, i)) - 1];
    if (method === 4) {
      const np = (n + 1) * p, j = Math.floor(np), g = np - j;
      if (j < 1) return x(1); if (j >= n) return x(n);
      return (1 - g) * x(j) + g * x(j + 1);
    }
    const np = n * p, j = Math.floor(np), g = np - j;
    switch (method) {
      case 1: return j < 1 ? x(1) : (1 - g) * x(j) + g * x(j + 1);
      case 2: {
        if (Math.abs(g - 0.5) > 1e-12) { const i = Math.floor(np + 0.5); return x(Math.max(1, i)); }
        return j % 2 === 0 ? x(Math.max(1, j)) : x(j + 1);
      }
      case 3: return g > 1e-12 ? x(j + 1) : x(Math.max(1, j));
      default: return g > 1e-12 ? x(j + 1) : (j < 1 ? x(1) : j >= n ? x(n) : (x(j) + x(j + 1)) / 2);
    }
  }

  // ---------- frequency distribution ----------
  function freqDist(x, method = 'scott', kManual) {
    const s = summary(x);
    const n = s.n, A = s.range;
    let k;
    if (method === 'manual' && kManual >= 2) k = Math.round(kManual);
    else if (method === 'scott') k = Math.max(2, Math.round(A / (3.49 * s.sd * Math.pow(n, -1 / 3))));
    else k = Math.max(2, Math.round(n <= 100 ? Math.sqrt(n) : 5 * Math.log10(n)));
    if (!isFinite(k) || k < 2) k = 2;
    const c = A > 0 ? A / (k - 1) : 1;
    const lo0 = s.min - c / 2;
    const classes = [];
    for (let i = 0; i < k; i++) classes.push({ lo: lo0 + i * c, hi: lo0 + (i + 1) * c, f: 0 });
    for (const v of x) { let i = Math.floor((v - lo0) / c); if (i < 0) i = 0; if (i >= k) i = k - 1; classes[i].f++; }
    let cum = 0;
    classes.forEach((cl) => { cl.mid = (cl.lo + cl.hi) / 2; cl.fr = cl.f / n; cum += cl.f; cl.F = cum; cl.Fr = cum / n; });
    // grouped median & mode (Czuber)
    let medClass = classes.findIndex((cl) => cl.F >= n / 2);
    const FA = medClass > 0 ? classes[medClass - 1].F : 0;
    const gMedian = classes[medClass].lo + ((n / 2 - FA) / classes[medClass].f) * c;
    let mo = 0; classes.forEach((cl, i) => { if (cl.f > classes[mo].f) mo = i; });
    const d1 = classes[mo].f - (mo > 0 ? classes[mo - 1].f : 0), d2 = classes[mo].f - (mo < k - 1 ? classes[mo + 1].f : 0);
    const gMode = classes[mo].lo + (d1 + d2 > 0 ? d1 / (d1 + d2) : 0.5) * c;
    const gMean = L.sum(classes.map((cl) => cl.mid * cl.f)) / n;
    return { k, c, classes, gMedian, gMode, gMean, method };
  }

  // ---------- Shapiro–Wilk ----------
  const poly = (cc, x) => cc.reduce((acc, c, i) => acc + c * Math.pow(x, i), 0);
  function swCoefficients(n) {
    if (n < 3) throw new Error(T('Shapiro–Wilk requires n ≥ 3.'));
    if (n > 5000) throw new Error(T('Shapiro–Wilk is available for n ≤ 5000.'));
    const a = new Float64Array(n);
    if (n === 3) { a[0] = -Math.SQRT1_2; a[2] = Math.SQRT1_2; return a; }
    const m = Array.from({ length: n }, (_, i) => D.qnorm((i + 1 - 0.375) / (n + 0.25)));
    const mm = m.reduce((s, v) => s + v * v, 0);
    const u = 1 / Math.sqrt(n);
    const an = m[n - 1] / Math.sqrt(mm) + poly([0, 0.221157, -0.147981, -2.071190, 4.434685, -2.706056], u);
    let phi, an1;
    if (n > 5) {
      an1 = m[n - 2] / Math.sqrt(mm) + poly([0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633], u);
      phi = (mm - 2 * m[n - 1] ** 2 - 2 * m[n - 2] ** 2) / (1 - 2 * an * an - 2 * an1 * an1);
    } else phi = (mm - 2 * m[n - 1] ** 2) / (1 - 2 * an * an);
    for (let i = 0; i < n; i++) a[i] = m[i] / Math.sqrt(phi);
    a[n - 1] = an; a[0] = -an;
    if (n > 5) { a[n - 2] = an1; a[1] = -an1; }
    return a;
  }
  function swPValue(W, n) {
    if (n === 3) { const p = (6 / Math.PI) * (Math.asin(Math.sqrt(W)) - Math.asin(Math.sqrt(0.75))); return Math.max(0, Math.min(1, p)); }
    let z;
    if (n <= 11) {
      const gamma = poly([-2.273, 0.459], n);
      const y = Math.log(1 - W);
      if (y >= gamma) return 1e-99;
      const w1 = -Math.log(gamma - y);
      const mu = poly([0.5440, -0.39978, 0.025054, -6.714e-4], n);
      const sg = Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n));
      z = (w1 - mu) / sg;
    } else {
      const ln = Math.log(n);
      const mu = poly([-1.5861, -0.31082, -0.083751, 0.0038915], ln);
      const sg = Math.exp(poly([-0.4803, -0.082676, 0.0030302], ln));
      z = (Math.log(1 - W) - mu) / sg;
    }
    return D.pnorm(z, 0, 1, true);
  }
  function shapiroWilk(x) {
    const n = x.length;
    const s = Float64Array.from(x).sort();
    const a = swCoefficients(n);
    const mean = L.mean(s);
    let ss = 0, num = 0;
    for (let i = 0; i < n; i++) { ss += (s[i] - mean) ** 2; num += a[i] * s[i]; }
    if (ss === 0) throw new Error(T('All values are equal; Shapiro–Wilk is undefined.'));
    const W = Math.min(1, num * num / ss);
    return { n, W, p: swPValue(W, n), a };
  }

  // ---------- one-sample location tests ----------
  function tTestOne(x, mu0, alt = 'two') {
    const s = summary(x), t = (s.mean - mu0) / s.se, df = s.n - 1;
    const p = alt === 'two' ? 2 * D.pt(-Math.abs(t), df) : alt === 'greater' ? D.pt(t, df, true) : D.pt(t, df);
    return { t, df, p, mean: s.mean, se: s.se };
  }
  // exact distribution of Wilcoxon signed-rank V for n (no ties)
  function signrankDist(n) {
    const max = n * (n + 1) / 2; let c = new Float64Array(max + 1); c[0] = 1;
    for (let k = 1; k <= n; k++) { const nc = new Float64Array(max + 1); for (let v = 0; v <= max; v++) { nc[v] += c[v]; if (v + k <= max) nc[v + k] += c[v]; } c = nc; }
    const tot = Math.pow(2, n); return Array.from(c, (v) => v / tot);
  }
  function wilcoxonSignedRank(x, mu0, alt = 'two') {
    const d = x.map((v) => v - mu0).filter((v) => v !== 0);
    const n = d.length;
    if (n === 0) return { n, V: 0, p: 1, method: 'no non-zero differences' };
    const abs = d.map((v, i) => ({ v: Math.abs(v), i })).sort((a, b) => a.v - b.v);
    const ranks = new Float64Array(n);
    let ties = false, tieCorr = 0;
    for (let i = 0; i < n;) { let j = i; while (j + 1 < n && abs[j + 1].v === abs[i].v) j++; const r = (i + j + 2) / 2; for (let k = i; k <= j; k++) ranks[abs[k].i] = r; const t = j - i + 1; if (t > 1) { ties = true; tieCorr += t ** 3 - t; } i = j + 1; }
    let V = 0; d.forEach((v, i) => { if (v > 0) V += ranks[i]; });
    let p, method;
    if (n < 50 && !ties) {
      const dist = signrankDist(n);
      const cdf = (v) => { let s = 0; for (let k = 0; k <= Math.floor(v) && k < dist.length; k++) s += dist[k]; return s; };
      const upper = 1 - cdf(V - 1), lower = cdf(V);
      p = alt === 'two' ? Math.min(1, 2 * Math.min(upper, lower)) : alt === 'greater' ? upper : lower;
      method = T('exact');
    } else {
      const mu = n * (n + 1) / 4, sg = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - tieCorr / 48);
      const cc = alt === 'two' ? 0.5 * Math.sign(V - mu) : alt === 'greater' ? 0.5 : -0.5;
      const z = (V - mu - cc) / sg;
      p = alt === 'two' ? 2 * D.pnorm(-Math.abs(z)) : alt === 'greater' ? D.pnorm(z, 0, 1, true) : D.pnorm(z);
      method = T('normal approximation with continuity correction');
    }
    return { n, V, p, method };
  }
  function signTest(x, mu0, alt = 'two') {
    const pos = x.filter((v) => v > mu0).length, neg = x.filter((v) => v < mu0).length, n = pos + neg;
    const lower = D.pbinom(pos, n, 0.5), upper = 1 - D.pbinom(pos - 1, n, 0.5);
    const p = alt === 'two' ? Math.min(1, 2 * Math.min(lower, upper)) : alt === 'greater' ? upper : lower;
    return { n, pos, neg, p };
  }

  // ---------- bootstrap of the mean ----------
  function bootstrapMean(x, B = 2000, alpha = 0.05, seed = 12345) {
    const rnd = L.rng(seed), n = x.length, m = L.mean(x);
    const bs = new Float64Array(B);
    for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < n; i++) s += x[Math.floor(rnd() * n)]; bs[b] = s / n; }
    const sorted = Float64Array.from(bs).sort();
    const bm = L.mean(bs), se = Math.sqrt(L.variance(bs));
    const q = (p) => percentile(sorted, p, 5);
    // bias-corrected percentile
    const z0 = D.qnorm(Math.max(1e-10, Math.min(1 - 1e-10, bs.filter((v) => v < m).length / B)));
    const za = D.qnorm(alpha / 2), zb = D.qnorm(1 - alpha / 2);
    return { B, mean: m, bootMean: bm, bias: bm - m, se, pLow: q(alpha / 2), pHigh: q(1 - alpha / 2),
      bcLow: q(D.pnorm(2 * z0 + za)), bcHigh: q(D.pnorm(2 * z0 + zb)), distribution: bs };
  }

  // ---------- kernel density ----------
  const KERNELS = {
    uniform: { label: 'Uniform: K(u) = 0.5·I(|u| ≤ 1)', f: (u) => (Math.abs(u) <= 1 ? 0.5 : 0), support: 1 },
    triangular: { label: 'Triangular: K(u) = (1 − |u|)·I(|u| ≤ 1)', f: (u) => (Math.abs(u) <= 1 ? 1 - Math.abs(u) : 0), support: 1 },
    epanechnikov: { label: 'Epanechnikov: K(u) = 3(1 − u²)/4·I(|u| ≤ 1)', f: (u) => (Math.abs(u) <= 1 ? 0.75 * (1 - u * u) : 0), support: 1 },
    quartic: { label: 'Quartic: K(u) = 15(1 − u²)²/16·I(|u| ≤ 1)', f: (u) => (Math.abs(u) <= 1 ? 15 / 16 * (1 - u * u) ** 2 : 0), support: 1 },
    gaussian: { label: 'Gaussian: K(u) = exp(−u²/2)/√(2π)', f: (u) => Math.exp(-u * u / 2) / Math.sqrt(2 * Math.PI), support: 4 },
  };
  function bandwidths(x) {
    const s = summary(x), n = s.n, R = s.q3 - s.q1;
    return {
      h1: { label: 'h1 = (24√π / n)^(1/3) · S', v: Math.cbrt(24 * Math.sqrt(Math.PI) / n) * s.sd },
      h2: { label: 'h2 = 1.06 · S · n^(−1/5)', v: 1.06 * s.sd * Math.pow(n, -0.2) },
      h3: { label: 'h3 = 2.62 · 1.06 · S · n^(−1/5)', v: 2.62 * 1.06 * s.sd * Math.pow(n, -0.2) },
      h4: { label: 'h4 = 0.79 · R · n^(−1/5) (R = interquartile range)', v: 0.79 * R * Math.pow(n, -0.2) },
    };
  }
  function kde(x, kernel = 'gaussian', h, npts = 300) {
    const K = KERNELS[kernel] || KERNELS.gaussian;
    const n = x.length, min = Math.min(...x), max = Math.max(...x);
    const lo = min - K.support * h, hi = max + K.support * h;
    const xs = [], ys = [];
    for (let i = 0; i < npts; i++) {
      const t = lo + (hi - lo) * i / (npts - 1);
      let s = 0; for (const v of x) s += K.f((t - v) / h);
      xs.push(t); ys.push(s / (n * h));
    }
    return { x: xs, y: ys, h, kernel, label: K.label };
  }

  const Desc = { summary, percentile, freqDist, swCoefficients, swPValue, shapiroWilk, tTestOne, wilcoxonSignedRank, signTest, bootstrapMean, KERNELS, bandwidths, kde };
  root.Desc = Desc;
  if (typeof module !== 'undefined' && module.exports) module.exports = Desc;
})(typeof globalThis !== 'undefined' ? globalThis : this);

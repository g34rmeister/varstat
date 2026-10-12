/* VarStat — interval estimation and hypothesis tests from summary statistics. */
(function (root) {
  'use strict';
  const D = root.Dist || require('./dist.js');

  const pAlt = (stat, alt, cdfLower, cdfUpper) => alt === 'two' ? Math.min(1, 2 * Math.min(cdfLower(stat), cdfUpper(stat))) : alt === 'greater' ? cdfUpper(stat) : cdfLower(stat);

  // ---------- confidence intervals ----------
  function ciMean({ mean, sd, n, alpha = 0.05, N }) {
    const df = n - 1, t = D.qt(1 - alpha / 2, df);
    let se = sd / Math.sqrt(n);
    if (N && N > n) se *= Math.sqrt((N - n) / (N - 1));
    return { estimate: mean, se, df, t, low: mean - t * se, high: mean + t * se, finite: !!(N && N > n) };
  }
  function ciVariance({ variance, n, alpha = 0.05 }) {
    const df = n - 1, c1 = D.qchisq(1 - alpha / 2, df), c2 = D.qchisq(alpha / 2, df);
    return { estimate: variance, df, low: df * variance / c1, high: df * variance / c2, chiUpper: c1, chiLower: c2 };
  }
  function ciSD(o) { const v = ciVariance({ ...o, variance: o.sd * o.sd }); return { estimate: o.sd, df: v.df, low: Math.sqrt(v.low), high: Math.sqrt(v.high) }; }
  // Coefficient of variation: Vangel's (1996) modification of McKay's interval
  function ciCV({ cv, n, alpha = 0.05 }) {
    const K = cv / 100, df = n - 1;
    const u1 = D.qchisq(1 - alpha / 2, df), u2 = D.qchisq(alpha / 2, df);
    const f = (u) => K / Math.sqrt(((u + 2) / n - 1) * K * K + u / df);
    return { estimate: cv, low: 100 * f(u1), high: 100 * f(u2) };
  }
  function ciProportion({ y, n, alpha = 0.05, N }) {
    const p = y / n, z = D.qnorm(1 - alpha / 2);
    let se = Math.sqrt(p * (1 - p) / n);
    if (N && N > n) se *= Math.sqrt((N - n) / (N - 1));
    const out = { estimate: p, se, z, methods: [] };
    out.methods.push({ name: 'Normal approximation (Wald)', low: Math.max(0, p - z * se), high: Math.min(1, p + z * se) });
    // Wilson score
    const den = 1 + z * z / n, cen = (p + z * z / (2 * n)) / den, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
    out.methods.push({ name: 'Wilson score', low: Math.max(0, cen - half), high: Math.min(1, cen + half) });
    // Pratt (1968) approximation to the exact limits
    const prattUpper = (yy) => {
      if (yy === n) return 1;
      const A = ((yy + 1) / (n - yy)) ** 2, B = 81 * (yy + 1) * (n - yy) - 9 * n - 8;
      const C = -3 * z * Math.sqrt(9 * (yy + 1) * (n - yy) * (9 * n + 5 - z * z) + n + 1);
      const Dd = 81 * (yy + 1) ** 2 - 9 * (yy + 1) * (2 + z * z) + 1;
      return 1 / (1 + A * ((B + C) / Dd) ** 3);
    };
    const pratt = () => ({ low: y === 0 ? 0 : 1 - prattUpper(n - y), high: prattUpper(y) });
    out.methods.push({ name: 'Pratt approximation', ...pratt() });
    // Exact (Clopper–Pearson via F / beta quantiles)
    const lowE = y === 0 ? 0 : 1 / (1 + (n - y + 1) / (y * D.qf(alpha / 2, 2 * y, 2 * (n - y + 1))));
    const highE = y === n ? 1 : 1 / (1 + (n - y) / ((y + 1) * D.qf(1 - alpha / 2, 2 * (y + 1), 2 * (n - y))));
    out.methods.push({ name: 'Exact (F distribution, Clopper–Pearson)', low: lowE, high: highE });
    return out;
  }
  function varianceRatio({ s1, n1, s2, n2, alpha = 0.05 }) {
    const F = (s1 * s1) / (s2 * s2), d1 = n1 - 1, d2 = n2 - 1;
    const p = Math.min(1, 2 * Math.min(D.pf(F, d1, d2), D.pf(F, d1, d2, true)));
    return { F, d1, d2, p, low: F / D.qf(1 - alpha / 2, d1, d2), high: F / D.qf(alpha / 2, d1, d2) };
  }
  function ciDiffMeans({ m1, s1, n1, m2, s2, n2, alpha = 0.05 }) {
    const diff = m1 - m2;
    const vr = varianceRatio({ s1, n1, s2, n2, alpha });
    const df = n1 + n2 - 2, sp2 = ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / df;
    const seP = Math.sqrt(sp2 * (1 / n1 + 1 / n2)), tP = D.qt(1 - alpha / 2, df);
    const v1 = s1 * s1 / n1, v2 = s2 * s2 / n2, seW = Math.sqrt(v1 + v2);
    const dfW = (v1 + v2) ** 2 / (v1 * v1 / (n1 - 1) + v2 * v2 / (n2 - 1)), tW = D.qt(1 - alpha / 2, dfW);
    return { diff, varianceTest: vr, pooled: { sp2, se: seP, df, t: tP, low: diff - tP * seP, high: diff + tP * seP },
      welch: { se: seW, df: dfW, t: tW, low: diff - tW * seW, high: diff + tW * seW } };
  }

  // ---------- hypothesis tests ----------
  function testMean({ mean, sd, n, mu0, alt = 'two', alpha = 0.05 }) {
    const se = sd / Math.sqrt(n), t = (mean - mu0) / se, df = n - 1;
    const p = pAlt(t, alt, (v) => D.pt(v, df), (v) => D.pt(v, df, true));
    const crit = alt === 'two' ? D.qt(1 - alpha / 2, df) : D.qt(1 - alpha, df);
    return { stat: t, statName: 't', df, p, crit, reject: p < alpha, se };
  }
  function testProportion({ y, n, p0, alt = 'two', alpha = 0.05 }) {
    const p = y / n, se = Math.sqrt(p0 * (1 - p0) / n), z = (p - p0) / se;
    const pz = pAlt(z, alt, (v) => D.pnorm(v), (v) => D.pnorm(v, 0, 1, true));
    const lower = D.pbinom(y, n, p0), upper = 1 - D.pbinom(y - 1, n, p0);
    let pExact;
    if (alt === 'greater') pExact = upper; else if (alt === 'less') pExact = lower;
    else { // sum of probabilities ≤ P(Y=y)
      const py = D.dbinom(y, n, p0); pExact = 0;
      for (let k = 0; k <= n; k++) { const pk = D.dbinom(k, n, p0); if (pk <= py * (1 + 1e-7)) pExact += pk; }
      pExact = Math.min(1, pExact);
    }
    const crit = alt === 'two' ? D.qnorm(1 - alpha / 2) : D.qnorm(1 - alpha);
    return { estimate: p, stat: z, statName: 'Z', p: pz, pExact, crit, reject: pz < alpha };
  }
  function testVariance({ variance, n, sigma2, alt = 'two', alpha = 0.05 }) {
    const df = n - 1, x2 = df * variance / sigma2;
    const p = pAlt(x2, alt, (v) => D.pchisq(v, df), (v) => D.pchisq(v, df, true));
    return { stat: x2, statName: 'χ²', df, p, reject: p < alpha, critLow: D.qchisq(alt === 'two' ? alpha / 2 : alpha, df), critHigh: D.qchisq(1 - (alt === 'two' ? alpha / 2 : alpha), df) };
  }
  function testDiffMeans({ m1, s1, n1, m2, s2, n2, delta0 = 0, alt = 'two', alpha = 0.05 }) {
    const ci = ciDiffMeans({ m1, s1, n1, m2, s2, n2, alpha });
    const mk = (se, df) => { const t = (ci.diff - delta0) / se; return { t, df, se, p: pAlt(t, alt, (v) => D.pt(v, df), (v) => D.pt(v, df, true)) }; };
    const pooled = mk(ci.pooled.se, ci.pooled.df), welch = mk(ci.welch.se, ci.welch.df);
    const equalVar = ci.varianceTest.p >= alpha;
    return { diff: ci.diff, varianceTest: ci.varianceTest, pooled, welch, recommended: equalVar ? 'pooled' : 'welch', reject: (equalVar ? pooled.p : welch.p) < alpha };
  }

  const Inference = { ciMean, ciVariance, ciSD, ciCV, ciProportion, ciDiffMeans, varianceRatio, testMean, testProportion, testVariance, testDiffMeans };
  root.Inference = Inference;
  if (typeof module !== 'undefined' && module.exports) module.exports = Inference;
})(typeof globalThis !== 'undefined' ? globalThis : this);

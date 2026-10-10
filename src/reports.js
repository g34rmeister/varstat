/* VarStat — report builders: turn analysis results into report blocks. */
(function (root) {
  'use strict';
  const D = root.Dist || require('./dist.js');
  const L = root.LinAlg || require('./linalg.js');
  const S = root.Desc || require('./desc.js');
  const I = root.Inference || require('./inference.js');
  const R = root.Regress || require('./regress.js');
  const Z = root.Design || require('./design.js');
  const A = root.Anova || require('./anova.js');
  const T = (s, ...a) => (root.I18N ? root.I18N.t(s, ...a) : s.replace(/\{(\d+)\}/g, (m, i) => a[i]));

  const ALT = { two: T('≠'), greater: T('>'), less: T('<') };
  const col = (ds, name) => ds.columns.find((c) => c.name === name);
  const nums = (vals) => vals.filter((v) => typeof v === 'number' && isFinite(v));

  // ---------------- descriptive statistics ----------------
  function descriptive(ds, { vars, by, rowFrom, rowTo, alpha = 0.05, options = {}, typed }) {
    const blocks = [];
    const sets = [];
    if (typed) sets.push({ name: typed.name || T('Typed sample'), values: typed.values });
    else {
      const n = Math.max(...ds.columns.map((c) => c.values.length));
      const lo = Math.max(1, rowFrom || 1) - 1, hi = Math.min(n, rowTo || n);
      const byCol = by ? col(ds, by) : null;
      for (const v of vars) {
        const c = col(ds, v);
        if (!c) continue;
        if (byCol) {
          for (const lev of A.levelsOf(byCol.values.slice(lo, hi))) {
            const vals = []; for (let i = lo; i < hi; i++) if (String(byCol.values[i]) === String(lev) && typeof c.values[i] === 'number') vals.push(c.values[i]);
            sets.push({ name: `${v} — ${by} = ${lev}`, values: vals, varName: v });
          }
        } else sets.push({ name: v, values: nums(c.values.slice(lo, hi)), varName: v, rows: (rowFrom || rowTo) ? T('rows {0}–{1}', lo + 1, hi) : null });
      }
    }
    blocks.push({ type: 'heading', level: 2, text: T('Descriptive statistics') });
    for (const s of sets) {
      const x = s.values;
      blocks.push({ type: 'heading', level: 3, text: s.name + (s.rows ? ` (${s.rows})` : '') });
      if (x.length < 2) { blocks.push({ type: 'warning', text: T('Fewer than two numeric observations.') }); continue; }
      const m = S.summary(x, alpha);
      blocks.push({ type: 'kv', cols: 2, rows: [
        [T('Sample size (n)'), m.n], [T('Sum'), m.sum], [T('Mean'), m.mean], [T('Median'), m.median],
        [T('Minimum'), m.min], [T('Maximum'), m.max], [T('Range'), m.range], [T('Variance'), m.variance],
        [T('Standard deviation'), m.sd], [T('Standard error of the mean'), m.se], [T('Coefficient of variation (%)'), m.cv],
        [T('First quartile'), m.q1], [T('Third quartile'), m.q3], [T('Uncorrected sum of squares'), m.ss],
        [T('Skewness coefficient a3 = m3/m2^1.5'), m.a3], [T('Kurtosis coefficient a4 = m4/m2² (normal = 3)'), m.a4],
        [T('Skewness g1 (sample-adjusted)'), m.g1], [T('Excess kurtosis g2 (sample-adjusted)'), m.g2],
        [T('Confidence interval for the mean ({0}%)', (100 * (1 - alpha)).toFixed(1).replace(/\.0$/, '')), T('{0} to {1}', fmtN(m.ciLow), fmtN(m.ciHigh))]] });
      if (options.freq || options.hist) {
        const fd = S.freqDist(x, options.freqMethod || 'scott', options.k);
        if (options.freq) {
          blocks.push({ type: 'table', title: T('Frequency distribution ({0}: k = {1} classes, width c = {2})', fd.method === 'scott' ? T('Scott (1979)') : fd.method === 'manual' ? T('manual') : T('empirical'), fd.k, fmtN(fd.c)),
            columns: [T('Class'), T('Lower limit'), T('Upper limit'), T('Midpoint'), T('Frequency'), T('Relative'), T('Cumulative'), T('Cumulative relative')], kinds: ['int', 'num', 'num', 'num', 'int', 'num', 'int', 'num'],
            rows: fd.classes.map((c, i) => [i + 1, c.lo, c.hi, c.mid, c.f, c.fr, c.F, c.Fr]) });
          blocks.push({ type: 'kv', rows: [[T('Mean (grouped data)'), fd.gMean], [T('Median (grouped data)'), fd.gMedian], [T('Mode (grouped data, Czuber)'), fd.gMode]] });
        }
        if (options.hist) {
          const layers = [{ type: 'bars', bars: fd.classes.map((c) => ({ x0: c.lo, x1: c.hi, y: c.f })) },
            { type: 'line', x: [fd.classes[0].lo, ...fd.classes.map((c) => c.mid), fd.classes[fd.k - 1].hi], y: [0, ...fd.classes.map((c) => c.f), 0], color: 'var(--ink)', width: 1.75 }];
          const legend = [{ label: T('Frequency polygon'), color: 'var(--ink)' }];
          if (options.normal) {
            const xs = [], ys = []; const a = fd.classes[0].lo, b = fd.classes[fd.k - 1].hi;
            for (let i = 0; i <= 160; i++) { const t = a + (b - a) * i / 160; xs.push(t); ys.push(m.n * fd.c * D.dnorm(t, m.mean, m.sd)); }
            layers.push({ type: 'line', x: xs, y: ys, color: 'var(--accent)', dash: true }); legend.push({ label: T('Normal curve'), color: 'var(--accent)', dash: true });
          }
          blocks.push({ type: 'chart', spec: { title: T('Histogram — {0}', s.name), xLabel: s.varName || s.name, yLabel: T('Frequency'), layers, legend } });
        }
      }
      if (options.normality && x.length >= 3 && x.length <= 5000) {
        const sw = S.shapiroWilk(x);
        blocks.push({ type: 'kv', title: T('Shapiro–Wilk normality test'), rows: [[T('W'), sw.W], [T('Pr < W'), sw.p, 'p'], [T('Conclusion at α = {0}', alpha), sw.p < alpha ? T('Reject normality') : T('Normality not rejected')]] });
      }
      if (options.percentiles) {
        const step = options.pctStep || 5, meth = options.pctMethod || 5;
        const rows = []; for (let p = step; p < 100 - 1e-9; p += step) rows.push([+(p.toFixed(1)), S.percentile(m.sorted, p / 100, meth)]);
        blocks.push({ type: 'table', title: T('Percentiles (method {0})', meth), columns: [T('Percentile (%)'), T('Value')], kinds: ['num1', 'num'], rows, compact: true });
      }
      if (options.meanTest) {
        const mt = options.meanTest, rows = [];
        const alt = mt.alt || 'two';
        if (mt.t !== false) { const r = S.tTestOne(x, mt.mu0 || 0, alt); rows.push([T('t test (assumes normality)'), T('t = {0}, DF = {1}', fmtN(r.t), r.df), r.p]); }
        if (mt.wilcoxon) { const r = S.wilcoxonSignedRank(x, mt.mu0 || 0, alt); rows.push([T('Wilcoxon signed-rank test ({0})', r.method), T('V = {0}, n = {1}', fmtN(r.V), r.n), r.p]); }
        if (mt.sign) { const r = S.signTest(x, mt.mu0 || 0, alt); rows.push([T('Sign test (binomial)'), T('{0} above, {1} below', r.pos, r.neg), r.p]); }
        blocks.push({ type: 'table', title: T('Test of H0: M = {0} against H1: M {1} {0}', mt.mu0 || 0, ALT[alt]), columns: [T('Test'), T('Statistic'), T('p-value')], kinds: ['text', 'text', 'p'], rows });
      }
      if (options.bootstrap) {
        const b = S.bootstrapMean(x, options.B || 2000, alpha);
        blocks.push({ type: 'kv', title: T('Bootstrap estimation of the mean ({0} resamples)', b.B), rows: [[T('Sample mean'), b.mean], [T('Bootstrap mean'), b.bootMean], [T('Bias'), b.bias], [T('Bootstrap standard error'), b.se],
          [T('Percentile interval ({0}%)', 100 * (1 - alpha)), T('{0} to {1}', fmtN(b.pLow), fmtN(b.pHigh))], [T('Bias-corrected percentile interval ({0}%)', 100 * (1 - alpha)), T('{0} to {1}', fmtN(b.bcLow), fmtN(b.bcHigh))]] });
      }
    }
    return blocks;
  }
  let DEC = 4;
  const fmtN = (v) => (typeof v !== 'number' ? String(v) : !isFinite(v) ? (isNaN(v) ? T('—') : v > 0 ? T('∞') : T('−∞')) : Math.abs(v) >= 1e9 || (v !== 0 && Math.abs(v) < Math.pow(10, -DEC)) ? v.toExponential(3) : v.toFixed(DEC));

  // ---------------- Shapiro–Wilk utilities ----------------
  function swSample(name, x) {
    const r = S.shapiroWilk(x);
    return [{ type: 'heading', level: 2, text: T('Shapiro–Wilk normality test — {0}', name) }, { type: 'kv', rows: [['n', r.n], [T('W'), r.W], [T('Pr < W'), r.p, 'p']] },
      { type: 'note', text: T('Small p-values indicate departure from normality. p-values use Royston’s (1995) approximation.') }];
  }
  function swCoefs(n) {
    const a = S.swCoefficients(n), half = Math.floor(n / 2);
    return [{ type: 'heading', level: 2, text: T('Shapiro–Wilk coefficients a(i) for n = {0}', n) },
      { type: 'table', columns: ['i', 'a(i)', T('a(n − i + 1)')], kinds: ['int', 'num', 'num'], rows: Array.from({ length: half }, (_, i) => [i + 1, a[i], a[n - 1 - i]]), compact: true },
      { type: 'note', text: T('W = (Σ a(i)·x(i))² / Σ(x − x̄)², with x(i) the ordered sample.') }];
  }
  function swProb(W, n) {
    return [{ type: 'heading', level: 2, text: T('Shapiro–Wilk probability') }, { type: 'kv', rows: [['n', n], [T('W'), W], [T('Pr < W'), S.swPValue(W, n), 'p']] }];
  }

  // ---------------- kernel density ----------------
  function kernelReport(name, x, { kernel, hChoice, h, npts = 300 }) {
    const bw = S.bandwidths(x);
    const hv = hChoice === 'manual' ? h : bw[hChoice || 'h2'].v;
    const k = S.kde(x, kernel, hv, npts);
    return [{ type: 'heading', level: 2, text: T('Kernel density estimate — {0}', name) },
      { type: 'kv', rows: [[T('Kernel'), k.label], [T('Bandwidth h'), hv], [T('Bandwidth rule'), hChoice === 'manual' ? T('chosen manually') : bw[hChoice || 'h2'].label], ['n', x.length], [T('Points evaluated'), npts]] },
      { type: 'chart', spec: { title: T('Kernel density — {0}', name), xLabel: name, yLabel: T('Density f(x)'), layers: [{ type: 'line', x: k.x, y: k.y }] } },
      { type: 'table', title: T('Bandwidth options'), columns: [T('Rule'), 'h'], kinds: ['text', 'num'], rows: Object.values(bw).map((b) => [b.label, b.v]), compact: true }];
  }

  // ---------------- probability calculator ----------------
  function probability(dist, p) {
    const blocks = [{ type: 'heading', level: 2, text: T('Probability calculation — {0}', ({ binom: T('Binomial distribution'), pois: T('Poisson distribution'), norm: T('Normal distribution'), t: T('t distribution'), chisq: T('Chi-square distribution'), f: T('F distribution') })[dist]) }];
    if (dist === 'binom' || dist === 'pois') {
      const pmf = dist === 'binom' ? (y) => D.dbinom(y, p.n, p.P) : (y) => D.dpois(y, p.k);
      const cdf = dist === 'binom' ? (y) => D.pbinom(y, p.n, p.P) : (y) => D.ppois(y, p.k);
      const y = p.y;
      blocks.push({ type: 'kv', rows: [...(dist === 'binom' ? [['n', p.n], [T('P (probability of success)'), p.P]] : [[T('Mean k'), p.k]]), ['y', y],
        [T('P(Y = y)'), pmf(y)], [T('P(Y ≤ y)'), cdf(y)], [T('P(Y > y)'), 1 - cdf(y)], [T('Mean'), dist === 'binom' ? p.n * p.P : p.k], [T('Variance'), dist === 'binom' ? p.n * p.P * (1 - p.P) : p.k]] });
      if (p.full) {
        const max = dist === 'binom' ? p.n : Math.max(10, Math.ceil(p.k + 6 * Math.sqrt(p.k) + 5));
        const rows = []; for (let k = 0; k <= Math.min(max, 1000); k++) { const v = pmf(k); if (dist === 'pois' && k > p.k && v < 1e-10) break; rows.push([k, v, cdf(k)]); }
        blocks.push({ type: 'table', title: T('Complete probability distribution'), columns: ['y', T('P(Y = y)'), T('P(Y ≤ y)')], kinds: ['int', 'num', 'num'], rows, compact: true });
      }
      return blocks;
    }
    const tail = (v) => ({ norm: D.pnorm(v, p.mean, Math.sqrt(p.variance), true), t: D.ptNC(v, p.df, p.ncp || 0, true), chisq: D.pchisqNC(v, p.df, p.ncp || 0, true), f: D.pf(v, p.v1, p.v2, true) }[dist]);
    const quant = (pp) => ({ norm: D.qnorm(1 - pp, p.mean, Math.sqrt(p.variance)), t: D.qtNC(1 - pp, p.df, p.ncp || 0), chisq: D.qchisqNC(1 - pp, p.df, p.ncp || 0), f: D.qf(1 - pp, p.v1, p.v2) }[dist]);
    const params = { norm: [[T('Mean'), p.mean], [T('Variance'), p.variance]], t: [[T('Degrees of freedom'), p.df], [T('Noncentrality'), p.ncp || 0]], chisq: [[T('Degrees of freedom'), p.df], [T('Noncentrality'), p.ncp || 0]], f: [[T('Numerator DF (v1)'), p.v1], [T('Denominator DF (v2)'), p.v2]] }[dist];
    const sym = { norm: T('X'), t: T('T'), chisq: T('X²'), f: T('F') }[dist];
    if (p.mode === 'quantile') blocks.push({ type: 'kv', rows: [...params, ['p', p.p], [T('c such that P({0} > c) = p', sym), quant(p.p)]] });
    else blocks.push({ type: 'kv', rows: [...params, ['c', p.x], [`P(${sym} > c)`, tail(p.x)], [`P(${sym} ≤ c)`, 1 - tail(p.x)]] });
    return blocks;
  }

  // ---------------- estimation ----------------
  function estimation(param, inp, alpha) {
    const cl = `${+(100 * (1 - alpha)).toFixed(2)}%`;
    const blocks = [{ type: 'heading', level: 2, text: T('Interval estimation ({0} confidence)', cl) }];
    const add = (title, rows) => blocks.push({ type: 'kv', title, rows });
    if (param === 'mean') { const r = I.ciMean({ ...inp, alpha }); add(T('Population mean μ'), [[T('Estimate (x̄)'), r.estimate], [T('Standard error'), r.se], [T('t (DF {0})', r.df), r.t], [T('Lower limit'), r.low], [T('Upper limit'), r.high], ...(r.finite ? [[T('Finite population correction'), T('applied (N = {0})', inp.N)]] : [])]); }
    if (param === 'variance') { const r = I.ciVariance({ ...inp, alpha }); add(T('Population variance σ²'), [[T('Estimate (s²)'), r.estimate], [T('DF'), r.df], [T('Lower limit'), r.low], [T('Upper limit'), r.high]]); }
    if (param === 'sd') { const r = I.ciSD({ ...inp, alpha }); add(T('Population standard deviation σ'), [[T('Estimate (s)'), r.estimate], [T('Lower limit'), r.low], [T('Upper limit'), r.high]]); }
    if (param === 'cv') { const r = I.ciCV({ ...inp, alpha }); add(T('Coefficient of variation (%) — Vangel’s modified McKay interval'), [[T('Estimate'), r.estimate], [T('Lower limit'), r.low], [T('Upper limit'), r.high]]); }
    if (param === 'proportion') {
      const r = I.ciProportion({ ...inp, alpha });
      add(T('Population proportion p'), [[T('Successes (y)'), inp.y], [T('Sample size (n)'), inp.n], [T('Estimate (p̂)'), r.estimate], [T('Standard error'), r.se]]);
      blocks.push({ type: 'table', columns: [T('Method'), T('Lower limit'), T('Upper limit')], kinds: ['text', 'num', 'num'], rows: r.methods.map((m) => [m.name, m.low, m.high]) });
    }
    if (param === 'diff') {
      const r = I.ciDiffMeans({ ...inp, alpha });
      add(T('Difference between two population means μ1 − μ2'), [[T('x̄1 − x̄2'), r.diff]]);
      add(T('Equality of variances (F test)'), [[T('F = s1²/s2²'), r.varianceTest.F], [T('DF'), `${r.varianceTest.d1}, ${r.varianceTest.d2}`], [T('p-value (two-sided)'), r.varianceTest.p, 'p'], [T('{0} interval for σ1²/σ2²', cl), T('{0} to {1}', fmtN(r.varianceTest.low), fmtN(r.varianceTest.high))]]);
      blocks.push({ type: 'table', columns: [T('Assumption'), T('DF'), T('Std. error'), T('Lower limit'), T('Upper limit')], kinds: ['text', 'num', 'num', 'num', 'num'],
        rows: [[T('Equal variances (pooled)'), r.pooled.df, r.pooled.se, r.pooled.low, r.pooled.high], [T('Unequal variances (Satterthwaite)'), r.welch.df, r.welch.se, r.welch.low, r.welch.high]] });
      blocks.push({ type: 'note', text: r.varianceTest.p < alpha ? T('Variances differ at this significance level: use the unequal-variances interval.') : T('Variances do not differ at this significance level: the pooled interval is appropriate.') });
    }
    return blocks;
  }
  function summarize(x) { const m = S.summary(x); return { mean: m.mean, sd: m.sd, n: m.n, variance: m.variance, cv: m.cv }; }

  // ---------------- hypothesis tests ----------------
  function hypothesis(param, inp, alpha, alt) {
    const blocks = [{ type: 'heading', level: 2, text: T('Hypothesis test') }];
    const decision = (rej) => rej ? T('Reject H0 at α = {0}', alpha) : T('Do not reject H0 at α = {0}', alpha);
    if (param === 'mean') { const r = I.testMean({ ...inp, alt, alpha }); blocks.push({ type: 'kv', title: `H0: μ = ${inp.mu0}   H1: μ ${ALT[alt]} ${inp.mu0}`, rows: [[T('x̄'), inp.mean], ['s', inp.sd], ['n', inp.n], [T('Standard error'), r.se], ['t', r.stat], [T('DF'), r.df], [T('Critical |t|'), r.crit], ['p-value', r.p], [T('Decision'), decision(r.reject)]] }); }
    if (param === 'proportion') { const r = I.testProportion({ ...inp, alt, alpha }); blocks.push({ type: 'kv', title: `H0: p = ${inp.p0}   H1: p ${ALT[alt]} ${inp.p0}`, rows: [[T('p̂ = y/n'), r.estimate], [T('Z (normal approximation)'), r.stat], [T('p-value (normal)'), r.p, 'p'], [T('p-value (exact binomial)'), r.pExact, 'p'], [T('Decision (normal)'), decision(r.reject)]] }); }
    if (param === 'variance') { const r = I.testVariance({ ...inp, alt, alpha }); blocks.push({ type: 'kv', title: `H0: σ² = ${inp.sigma2}   H1: σ² ${ALT[alt]} ${inp.sigma2}`, rows: [['s²', inp.variance], ['n', inp.n], [T('χ² = (n − 1)s²/σ0²'), r.stat], [T('DF'), r.df], ['p-value', r.p], [T('Decision'), decision(r.reject)]] }); }
    if (param === 'diff') {
      const r = I.testDiffMeans({ ...inp, alt, alpha });
      blocks.push({ type: 'kv', title: `H0: μ1 − μ2 = ${inp.delta0 || 0}   H1: μ1 − μ2 ${ALT[alt]} ${inp.delta0 || 0}`, rows: [[T('x̄1 − x̄2'), r.diff], [T('F test of equal variances'), `F = ${fmtN(r.varianceTest.F)}, p = ${fmtN(r.varianceTest.p)}`]] });
      blocks.push({ type: 'table', columns: [T('Assumption'), 't', T('DF'), T('p-value')], kinds: ['text', 'num', 'num', 'p'], rows: [[T('Equal variances (pooled)'), r.pooled.t, r.pooled.df, r.pooled.p], [T('Unequal variances (Satterthwaite)'), r.welch.t, r.welch.df, r.welch.p]] });
      blocks.push({ type: 'note', text: T('Recommended: {0}.', r.recommended === 'pooled' ? T('pooled t test (variances do not differ)') : T('Satterthwaite t test (variances differ)')) + ' ' + decision(r.reject) + '.' });
    }
    return blocks;
  }

  // ---------------- regression ----------------
  function regression(ds, terms, responses, opts) {
    const blocks = [{ type: 'heading', level: 2, text: T('Multiple linear regression') }];
    for (const y of responses) {
      const r = R.regression(ds, terms, y, { type1: opts.type1, type2: opts.type2 || opts.partialR2, diagnostics: opts.predicted, alpha: opts.alpha });
      blocks.push({ type: 'heading', level: 3, text: `Y = ${y}` }, { type: 'note', text: T('Model: {0}', `${y} = b0 + ${terms.map((t, i) => `b${i + 1}·(${t})`).join(' + ')} + ` + T('error')) });
      blocks.push({ type: 'table', title: T('Analysis of variance'), columns: [T('Source'), T('DF'), T('SS'), T('MS'), T('F'), T('Pr > F')], kinds: ['text', 'int', 'num', 'num', 'num', 'p'], rows: r.anova.map((a) => [a.source, a.df, a.ss, a.ms ?? '', a.F ?? '', a.p ?? '']), emphasizeLast: true });
      blocks.push({ type: 'kv', rows: [[T('R² (%)'), 100 * r.r2], [T('Adjusted R² (%)'), 100 * r.r2adj], [T('Root MSE'), r.rootMSE], [T('Mean of Y'), r.fit.ybar], [T('CV (%)'), r.cv], [T('Observations used'), r.n]] });
      const cols = [T('Parameter'), T('Term'), T('Estimate'), T('Std. error'), 't', T('Pr > |t|'), T('Lower {0}%', 100 * (1 - (opts.alpha || 0.05))), T('Upper')];
      const kinds = ['text', 'text', 'num', 'num', 'num', 'p', 'num', 'num'];
      if (opts.standardized) { cols.push(T('Standardized')); kinds.push('num'); }
      blocks.push({ type: 'table', title: T('Parameter estimates'), columns: cols, kinds, rows: r.coefs.map((c, i) => [`b${i}`, c.label, c.aliased ? T('aliased') : c.estimate, c.aliased ? '' : c.se, c.aliased ? '' : c.t, c.aliased ? '' : c.p, c.aliased ? '' : c.low, c.aliased ? '' : c.high, ...(opts.standardized ? [i === 0 ? '' : c.std] : [])]) });
      if (opts.type1) blocks.push({ type: 'table', title: T('Type I (sequential) sums of squares'), columns: [T('Term'), T('DF'), T('SS'), T('F'), T('Pr > F')], kinds: ['text', 'int', 'num', 'num', 'p'], rows: r.type1.map((t) => [t.label, t.df, t.ss, t.F, t.p]) });
      if (opts.type2) blocks.push({ type: 'table', title: T('Type II (partial) sums of squares'), columns: [T('Term'), T('DF'), T('SS'), T('F'), T('Pr > F')], kinds: ['text', 'int', 'num', 'num', 'p'], rows: r.type2.map((t) => [t.label, t.df, t.ss, t.F, t.p]) });
      if (opts.partialR2) blocks.push({ type: 'table', title: T('Partial and semipartial R²'), columns: [T('Term'), T('Partial R²'), T('Semipartial R²')], kinds: ['text', 'num', 'num'], rows: r.type2.map((t) => [t.label, t.partialR2, t.semipartialR2]) });
      if (opts.xtx) blocks.push({ type: 'table', title: T("{0} matrix", "X'X"), columns: ['', ...r.labels], kinds: ['text', ...r.labels.map(() => 'num')], rows: r.fit.XtX.map((row, i) => [r.labels[i], ...row]) });
      if (opts.xtxi) blocks.push({ type: 'table', title: T("{0} matrix", "(X'X)⁻¹"), columns: ['', ...r.labels], kinds: ['text', ...r.labels.map(() => 'num')], rows: r.fit.ginv.map((row, i) => [r.labels[i], ...row]) });
      if (opts.predicted) {
        blocks.push({ type: 'table', title: T('Predicted values, residuals and influence diagnostics'), columns: [T('Row'), T('Observed'), T('Predicted'), T('SE (pred.)'), T('Lower CI'), T('Upper CI'), T('Residual'), T('SE (resid.)'), T('Studentized'), T('Rstudent'), T('Leverage h'), "CookT('s D", ')DFFITS', 'CovRatio'],
          kinds: ['int', 'num', 'num', 'num', 'num', 'num', 'num', 'num', 'num', 'num', 'num', 'num', 'num', 'num'], rows: r.diag.map((d) => [d.row, d.y, d.yhat, d.seFit, d.low, d.high, d.resid, d.seRes, d.stud, d.rstud, d.h, d.cook, d.dffits, d.covratio]) });
      }
    }
    return blocks;
  }
  function selection(ds, candidates, y, opts) {
    const s = R.selection(ds, candidates, y, opts);
    const blocks = [{ type: 'heading', level: 2, text: T('Model selection ({0}) — Y = {1}', T(opts.method), y) },
      { type: 'kv', rows: [[T('Candidate terms'), candidates.join(', ')], ...(opts.method !== 'backward' ? [[T('Significance level to enter'), opts.alphaIn]] : []), ...(opts.method !== 'forward' ? [[T('Significance level to stay'), opts.alphaOut]] : []), [T('Observations used'), s.n]] }];
    blocks.push(s.steps.length ? { type: 'table', title: T('Selection steps'), columns: [T('Step'), T('Action'), T('Term'), T('Partial F'), T('Pr > F'), T('Terms in model')], kinds: ['int', 'text', 'text', 'num', 'p', 'text'], rows: s.steps.map((st, i) => [i + 1, st.action, st.term, st.F, st.p, st.model.join(', ') || T('(intercept only)')]) } : { type: 'note', text: T('No term met the criterion; the model was not changed.') });
    if (s.final) { blocks.push({ type: 'heading', level: 3, text: T('Final model: {0}', s.finalTerms.join(' + ')) }); blocks.push(...regression(ds, s.finalTerms, [y], { type2: true, alpha: 0.05 }).slice(2)); }
    else blocks.push({ type: 'note', text: T('Final model contains only the intercept.') });
    return blocks;
  }

  // ---------------- bootstrap MCP ----------------
  function bootstrapMCP(ds, classVar, responses, opts) {
    const blocks = [{ type: 'heading', level: 2, text: T('Multiple comparisons by bootstrap') }];
    const cv = col(ds, classVar);
    for (const y of responses) {
      const yc = col(ds, y), lv = A.levelsOf(cv.values);
      const groups = lv.map((l) => ({ label: String(l), values: yc.values.filter((v, i) => typeof v === 'number' && String(cv.values[i]) === String(l)) })).filter((g) => g.values.length);
      const r = Z.bootstrapMCP(groups, { method: opts.method, alpha: opts.alpha, B: opts.B, control: opts.control });
      blocks.push({ type: 'heading', level: 3, text: T('{0} by {1}', y, classVar) + ` — ${({ tukey: T('Tukey'), snk: T('SNK'), scottknott: T('Scott–Knott'), control: T('comparisons with a control') })[opts.method]}` });
      const head = [[T('Bootstrap resamples'), r.B], [T('Error mean square'), r.mse], [T('Error DF'), r.dfE], [T('Significance level'), r.alpha]];
      if (opts.method === 'tukey') head.push([T('Bootstrap critical q'), r.crit], [T('Tabulated q (for comparison)'), r.tableQ], [T('Minimum significant difference'), r.dms]);
      if (opts.method === 'control') head.push([T('Control'), r.control], [T('Bootstrap critical |t|'), r.crit]);
      if (opts.method === 'scottknott') head.push([T('Number of groups'), r.groups]);
      blocks.push({ type: 'kv', rows: head });
      if (opts.method === 'snk') blocks.push({ type: 'table', title: T('Bootstrap critical ranges'), columns: [T('Means in range (p)'), T('Critical q'), T('MSD')], kinds: ['int', 'num', 'num'], rows: r.crits.slice(2).map((c, i) => [i + 2, c, r.dmsP[i + 2]]), compact: true });
      if (opts.method === 'control') blocks.push({ type: 'table', columns: [T('Treatment'), T('Difference from control'), T('Std. error'), 't', T('Adjusted p (bootstrap)'), T('Significant')], kinds: ['text', 'num', 'num', 'num', 'p', 'text'], rows: r.comparisons.map((c) => [c.label, c.diff, c.se, c.t, c.pAdj, c.significant ? 'yes' : 'no']) });
      else { blocks.push({ type: 'table', columns: [T('Level'), 'n', T('Mean'), T('Groups')], kinds: ['text', 'int', 'num', 'text'], rows: r.rows.map((x) => [x.label, x.n, x.mean, x.letters]), groupsCol: 3 }); blocks.push({ type: 'note', text: T('Means followed by the same letter do not differ significantly.') }); }
    }
    blocks.push({ type: 'note', text: T('Method: within-group residuals are pooled and resampled with replacement under the complete null hypothesis; the bootstrap quantile of each statistic replaces its tabulated critical value. Resampling uses a fixed seed, so results are reproducible.') });
    return blocks;
  }

  // ---------------- plans ----------------
  function plan(p) {
    const res = p.design === 'lattice' ? Z.randomizeLattice(p) : Z.randomizePlan(p);
    const name = { crd: T('Completely randomized design (CRD)'), rcbd: T('Randomized complete block design (RCBD)'), lattice: T('Square lattice design') }[p.design];
    const info = [[T('Design'), name], [T('Treatments'), res.treatments], [T('Plots'), res.plots]];
    if (p.design === 'lattice') info.push([T('Block size k'), p.k], [T('Replicates'), p.reps], [T('Balanced lattice'), res.balanced ? T('yes (k + 1 replicates)') : T('no (partially balanced)')]);
    else { info.push([p.design === 'rcbd' ? T('Blocks') : T('Replicates'), p.reps]); info.push([T('Plot factors'), p.plotFactors.map((f) => T('{0} ({1} levels)', f.name, f.levels)).join(', ')]); if (p.subFactors.length) info.push([T('Subplot factors'), p.subFactors.map((f) => T('{0} ({1} levels)', f.name, f.levels)).join(', ')]); }
    return { res, blocks: [{ type: 'heading', level: 2, text: T('Experimental plan — {0}', name) }, { type: 'kv', rows: info },
      { type: 'table', title: T('Randomized field plan'), columns: res.cols.map((c) => (['Plot', 'Rep', 'Block', 'Subplot', 'Treatment'].includes(c) ? T(c) : c)), kinds: res.cols.map(() => 'int'), rows: res.rows.map((r) => res.cols.map((c) => r[c])), compact: true }] };
  }

  const Reports = { descriptive, swSample, swCoefs, swProb, kernelReport, probability, estimation, summarize, hypothesis, regression, selection, bootstrapMCP, plan, setDecimals: (d) => { DEC = d; }, fmtN: (v) => fmtN(v) };
  root.Reports = Reports;
  if (typeof module !== 'undefined' && module.exports) module.exports = Reports;
})(typeof globalThis !== 'undefined' ? globalThis : this);

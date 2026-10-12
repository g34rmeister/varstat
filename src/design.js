/* VarStat — bootstrap multiple comparisons (one-way layout) and
   randomization of experimental plans (CRD, RCBD with factorial/split-plot
   structure, square lattices). */
(function (root) {
  'use strict';
  const D = root.Dist || require('./dist.js');
  const L = root.LinAlg || require('./linalg.js');
  const A = root.Anova || require('./anova.js');
  const T = (s, ...a) => (root.I18N ? root.I18N.t(s, ...a) : s.replace(/\{(\d+)\}/g, (m, i) => a[i]));

  // ---------------- bootstrap multiple comparisons ----------------
  /* Residual bootstrap under the complete null hypothesis: within-group residuals
     (y_ij − ȳ_i) are pooled and resampled with replacement into groups of the
     original sizes. For each resample the relevant statistic is recomputed, and its
     (1 − α) quantile replaces the tabulated critical value. */
  function bootstrapMCP(groups, { method = 'tukey', alpha = 0.05, B = 2000, control = null, seed = 20240601 }) {
    const rnd = L.rng(seed);
    const k = groups.length;
    const ns = groups.map((g) => g.values.length);
    const means = groups.map((g) => L.mean(g.values));
    const N = L.sum(ns), dfE = N - k;
    let sse = 0; const resid = [];
    groups.forEach((g, i) => g.values.forEach((v) => { resid.push(v - means[i]); sse += (v - means[i]) ** 2; }));
    const mse = sse / dfE;
    const rh = k / L.sum(ns.map((n) => 1 / n));
    const resample = () => {
      const m = new Float64Array(k); let s2 = 0;
      for (let i = 0; i < k; i++) {
        let s = 0; const vals = new Float64Array(ns[i]);
        for (let j = 0; j < ns[i]; j++) { const v = resid[Math.floor(rnd() * resid.length)]; vals[j] = v; s += v; }
        m[i] = s / ns[i];
        for (const v of vals) s2 += (v - m[i]) ** 2;
      }
      return { m, mse: s2 / dfE };
    };
    const quant = (arr, p) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; };
    const out = { method, alpha, B, k, ns, means, mse, dfE, rh, labels: groups.map((g) => g.label) };

    if (method === 'control') {
      const c = groups.findIndex((g) => String(g.label) === String(control));
      if (c < 0) throw new Error(T('Control level "{0}" not found.', control));
      const stats = new Float64Array(B);
      for (let b = 0; b < B; b++) {
        const r = resample(); let mx = 0;
        for (let i = 0; i < k; i++) if (i !== c) { const t = Math.abs(r.m[i] - r.m[c]) / Math.sqrt(r.mse * (1 / ns[i] + 1 / ns[c])); if (t > mx) mx = t; }
        stats[b] = mx;
      }
      const crit = quant(stats, 1 - alpha);
      out.control = groups[c].label; out.crit = crit;
      out.comparisons = groups.map((g, i) => i === c ? null : (() => {
        const diff = means[i] - means[c], se = Math.sqrt(mse * (1 / ns[i] + 1 / ns[c])), t = diff / se;
        let ge = 0; for (const s of stats) if (s >= Math.abs(t)) ge++;
        return { label: g.label, diff, se, t, pAdj: (ge + 1) / (B + 1), significant: Math.abs(t) > crit, msd: crit * se };
      })()).filter(Boolean);
      return out;
    }
    if (method === 'tukey') {
      const stats = new Float64Array(B);
      for (let b = 0; b < B; b++) { const r = resample(); let mx = -Infinity, mn = Infinity; for (let i = 0; i < k; i++) { if (r.m[i] > mx) mx = r.m[i]; if (r.m[i] < mn) mn = r.m[i]; } stats[b] = (mx - mn) / Math.sqrt(r.mse / rh); }
      const q = quant(stats, 1 - alpha);
      out.crit = q; out.dms = q * Math.sqrt(mse / rh);
      const items = groups.map((g, i) => ({ label: g.label, mean: means[i], n: ns[i] }));
      const sorted = items.slice().sort((a, b) => a.mean - b.mean);
      out.rows = assignLetters(sorted, (i, j) => sorted[j].mean - sorted[i].mean <= out.dms);
      out.tableQ = A.compareMeans(items, { method: 'tukey', alpha, mse, df: dfE }).info.find((x) => x[0] === T('Studentized range q'))[1];
      return out;
    }
    if (method === 'snk') {
      const dmsP = [0, 0], crits = [0, 0];
      const statsP = Array.from({ length: k + 1 }, () => new Float64Array(B));
      for (let b = 0; b < B; b++) {
        const r = resample();
        const idx = Array.from({ length: k }, (_, i) => i);
        for (let i = k - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
        const s = Math.sqrt(r.mse / rh);
        for (let p = 2; p <= k; p++) { let mx = -Infinity, mn = Infinity; for (let t = 0; t < p; t++) { const v = r.m[idx[t]]; if (v > mx) mx = v; if (v < mn) mn = v; } statsP[p][b] = (mx - mn) / s; }
      }
      for (let p = 2; p <= k; p++) { crits[p] = quant(statsP[p], 1 - alpha); dmsP[p] = crits[p] * Math.sqrt(mse / rh); }
      out.crits = crits; out.dmsP = dmsP;
      const sorted = groups.map((g, i) => ({ label: g.label, mean: means[i], n: ns[i] })).sort((a, b) => a.mean - b.mean);
      const H = Array.from({ length: k }, () => new Array(k).fill(false));
      for (let len = k; len >= 1; len--) for (let i = 0; i + len - 1 < k; i++) { const j = i + len - 1; H[i][j] = len === 1 || sorted[j].mean - sorted[i].mean <= dmsP[len] || (i > 0 && H[i - 1][j]) || (j < k - 1 && H[i][j + 1]); }
      out.rows = assignLetters(sorted, (i, j) => H[i][j]);
      return out;
    }
    if (method === 'scottknott') {
      // bootstrap null distribution of the Scott–Knott λ for each group size
      const lambdaFor = (mvals, s2y, nu) => {
        const kk = mvals.length; const srt = Float64Array.from(mvals).sort();
        const tot = L.sum(srt), gm = tot / kk; let t1 = 0, bestB = -1;
        for (let s = 0; s < kk - 1; s++) { t1 += srt[s]; const k1 = s + 1, k2 = kk - k1, t2 = tot - t1; const Bv = t1 * t1 / k1 + t2 * t2 / k2 - tot * tot / kk; if (Bv > bestB) bestB = Bv; }
        let ssm = 0; for (const v of srt) ssm += (v - gm) ** 2;
        const sig = (ssm + nu * s2y) / (kk + nu);
        return Math.PI / (2 * (Math.PI - 2)) * bestB / sig;
      };
      const crit = [0, 0];
      const statsP = Array.from({ length: k + 1 }, () => new Float64Array(B));
      for (let b = 0; b < B; b++) {
        const r = resample();
        const idx = Array.from({ length: k }, (_, i) => i);
        for (let i = k - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
        for (let p = 2; p <= k; p++) statsP[p][b] = lambdaFor(idx.slice(0, p).map((t) => r.m[t]), r.mse / rh, dfE);
      }
      for (let p = 2; p <= k; p++) crit[p] = quant(statsP[p], 1 - alpha);
      const sorted = groups.map((g, i) => ({ label: g.label, mean: means[i], n: ns[i] })).sort((a, b) => a.mean - b.mean);
      const mv = sorted.map((s) => s.mean), s2y = mse / rh, grp = [];
      const rec = (lo, hi) => {
        const kk = hi - lo + 1; if (kk === 1) { grp.push([lo, hi]); return; }
        const sub = mv.slice(lo, hi + 1), lam = lambdaFor(sub, s2y, dfE);
        if (lam > crit[kk]) {
          const tot = L.sum(sub); let t1 = 0, best = 0, bestB = -1;
          for (let s = 0; s < kk - 1; s++) { t1 += sub[s]; const k1 = s + 1, k2 = kk - k1, t2 = tot - t1; const Bv = t1 * t1 / k1 + t2 * t2 / k2 - tot * tot / kk; if (Bv > bestB) { bestB = Bv; best = s; } }
          rec(lo, lo + best); rec(lo + best + 1, hi);
        } else grp.push([lo, hi]);
      };
      rec(0, k - 1);
      grp.sort((a, b) => a[0] - b[0]).forEach(([a, b], g) => { for (let x = a; x <= b; x++) sorted[x].letters = letter(g); });
      out.rows = sorted; out.crits = crit; out.groups = grp.length;
      return out;
    }
    throw new Error('Unknown bootstrap method: ' + method);
  }
  const letter = (g) => (g < 26 ? 'abcdefghijklmnopqrstuvwxyz'[g] : 'abcdefghijklmnopqrstuvwxyz'[g % 26] + Math.floor(g / 26));
  function assignLetters(sorted, homog) {
    const k = sorted.length, ivs = []; let lastJ = -1;
    for (let i = 0; i < k; i++) { let j = i; while (j + 1 < k && homog(i, j + 1)) j++; if (j > lastJ) { ivs.push([i, j]); lastJ = j; } }
    const L2 = Array.from({ length: k }, () => []);
    ivs.forEach(([a, b], g) => { for (let x = a; x <= b; x++) L2[x].push(letter(g)); });
    sorted.forEach((s, i) => (s.letters = L2[i].join(' ')));
    return sorted;
  }

  // ---------------- randomization of plans ----------------
  function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function combos(factors) {
    let out = [[]];
    for (const f of factors) { const next = []; for (const c of out) for (let l = 1; l <= f.levels; l++) next.push([...c, l]); out = next; }
    return out;
  }
  /* design: 'crd' | 'rcbd'; plotFactors/subFactors: [{name, levels}] */
  function randomizePlan({ design = 'crd', reps = 2, plotFactors = [], subFactors = [], firstPlot = 1, seed }) {
    const rnd = L.rng(seed || (Date.now() & 0xffffffff));
    if (!plotFactors.length) throw new Error(T('Define at least one factor.'));
    const T = combos(plotFactors), S = subFactors.length ? combos(subFactors) : [[]];
    const rows = [];
    let plot = firstPlot;
    const pushPlot = (rep, trt) => {
      const subs = shuffle(S, rnd);
      subs.forEach((sc, si) => {
        const r = { Plot: plot };
        if (design === 'rcbd') r.Block = rep; else r.Rep = rep;
        if (subFactors.length) r.Subplot = si + 1;
        plotFactors.forEach((f, j) => (r[f.name] = trt[j]));
        subFactors.forEach((f, j) => (r[f.name] = sc[j]));
        rows.push(r);
      });
      plot++;
    };
    if (design === 'rcbd') {
      for (let b = 1; b <= reps; b++) for (const t of shuffle(T, rnd)) pushPlot(b, t);
    } else {
      const all = []; for (let r = 1; r <= reps; r++) for (const t of T) all.push({ r, t });
      // in a CRD the replicate number only labels the copy of each treatment
      const sh = shuffle(all, rnd);
      const counter = new Map();
      for (const a of sh) { const key = a.t.join(','); const rr = (counter.get(key) || 0) + 1; counter.set(key, rr); pushPlot(rr, a.t); }
    }
    const cols = Object.keys(rows[0]);
    return { rows, cols, treatments: T.length, plots: plot - firstPlot };
  }

  // Galois field for prime powers up to 49 (for mutually orthogonal Latin squares)
  function gf(q) {
    const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
    let p = null, m = 0;
    for (const pr of primes) { let x = q, e = 0; while (x % pr === 0) { x /= pr; e++; } if (x === 1 && e > 0) { p = pr; m = e; break; } }
    if (!p) return null;
    if (m === 1) return { q, add: (a, b) => (a + b) % p, mul: (a, b) => (a * b) % p };
    const irreducible = { 4: [1, 1, 1], 8: [1, 1, 0, 1], 9: [1, 0, 1], 16: [1, 1, 0, 0, 1], 25: [2, 1, 1], 27: [1, 2, 0, 1], 32: [1, 0, 1, 0, 0, 1], 49: [3, 1, 1] }[q];
    if (!irreducible) return null;
    // elements as base-p digit vectors (little endian); irreducible gives x^m = -(c0 + c1 x + ...)
    const toV = (a) => { const v = []; for (let i = 0; i < m; i++) { v.push(a % p); a = Math.floor(a / p); } return v; };
    const toI = (v) => v.reduce((s, d, i) => s + d * p ** i, 0);
    const add = (a, b) => toI(toV(a).map((d, i) => (d + toV(b)[i]) % p));
    const mul = (a, b) => {
      const va = toV(a), vb = toV(b), prod = new Array(2 * m - 1).fill(0);
      for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) prod[i + j] = (prod[i + j] + va[i] * vb[j]) % p;
      for (let d = 2 * m - 2; d >= m; d--) { const c = prod[d]; if (!c) continue; prod[d] = 0; for (let i = 0; i < m; i++) prod[d - m + i] = ((prod[d - m + i] - c * irreducible[i]) % p + p) % p; }
      return toI(prod.slice(0, m));
    };
    return { q, add, mul };
  }
  /* Square lattice: k² treatments in r replicates of k blocks of size k */
  function randomizeLattice({ k, reps = 2, firstPlot = 1, seed }) {
    const rnd = L.rng(seed || (Date.now() & 0xffffffff));
    if (!(k >= 2)) throw new Error(T('Block size k must be at least 2.'));
    const maxR = gf(k) ? k + 1 : 3;
    if (reps > maxR) throw new Error(gf(k) ? T('For k = {0} at most {1} replicates can be built.', k, maxR) : T('For k = {0} at most {1} replicates can be built (k is not a prime power).', k, maxR));
    const F = gf(k);
    const trt = (i, j) => i * k + j + 1; // cell (row i, column j)
    const groupings = [];
    groupings.push(Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => trt(i, j))));
    groupings.push(Array.from({ length: k }, (_, j) => Array.from({ length: k }, (_, i) => trt(i, j))));
    for (let s = 1; groupings.length < reps; s++) {
      const blocks = Array.from({ length: k }, () => []);
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
        const v = F ? F.add(F.mul(s, i), j) : (i + j) % k; // cyclic Latin square when k is not a prime power
        blocks[v].push(trt(i, j));
      }
      groupings.push(blocks);
    }
    const labels = shuffle(Array.from({ length: k * k }, (_, i) => i + 1), rnd); // random treatment numbering
    const rows = []; let plot = firstPlot;
    groupings.slice(0, reps).forEach((blocks, r) => {
      shuffle(blocks, rnd).forEach((bl, bi) => {
        shuffle(bl, rnd).forEach((t) => rows.push({ Plot: plot++, Rep: r + 1, Block: r * k + bi + 1, Treatment: labels[t - 1] }));
      });
    });
    return { rows, cols: ['Plot', 'Rep', 'Block', 'Treatment'], treatments: k * k, plots: rows.length, balanced: reps === k + 1 };
  }

  const Design = { bootstrapMCP, randomizePlan, randomizeLattice, gf };
  root.Design = Design;
  if (typeof module !== 'undefined' && module.exports) module.exports = Design;
})(typeof globalThis !== 'undefined' ? globalThis : this);

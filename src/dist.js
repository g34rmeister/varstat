/* VarStat — probability distributions and special functions.
   Written from the standard mathematical definitions (Lanczos gamma,
   continued fractions for incomplete beta/gamma, Wichura AS241 normal quantile,
   Poisson-mixture noncentral distributions, numerical integration for the
   studentized range). */
(function (root) {
  'use strict';
  const LN_SQRT_2PI = 0.9189385332046728;
  const SQRT2 = Math.SQRT2;

  // ---------- Gamma family ----------
  const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = LG[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
    return LN_SQRT_2PI + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function lbeta(a, b) { return lgamma(a) + lgamma(b) - lgamma(a + b); }
  function lfact(n) { return lgamma(n + 1); }

  // Regularized lower incomplete gamma P(a,x)
  function pgammaReg(a, x) {
    if (x <= 0) return 0;
    if (!isFinite(x)) return 1;
    if (x < a + 1) {
      let sum = 1 / a, del = sum, ap = a;
      for (let n = 0; n < 10000; n++) {
        ap += 1; del *= x / ap; sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
      }
      return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - lgamma(a)));
    }
    return 1 - qgammaRegCF(a, x);
  }
  function qgammaRegCF(a, x) { // upper regularized Q(a,x) by Lentz continued fraction
    const FPMIN = 1e-300;
    let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
    for (let i = 1; i < 10000; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  function qgammaUpper(a, x) { // Q(a,x)
    if (x <= 0) return 1;
    if (x < a + 1) return 1 - pgammaReg(a, x);
    return qgammaRegCF(a, x);
  }

  // Regularized incomplete beta I_x(a,b)
  function betacf(a, b, x) {
    const FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d; let h = d;
    for (let m = 1; m <= 10000; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  }
  function ibeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(-lbeta(a, b) + a * Math.log(x) + b * Math.log1p(-x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }
  // upper tail 1 - I_x(a,b) computed without cancellation
  function ibetaUpper(x, a, b) { return ibeta(1 - x, b, a); }

  // ---------- Normal ----------
  function erfc(x) {
    if (x < 0) return 2 - erfc(-x);
    if (x === 0) return 1;
    return qgammaUpper(0.5, x * x);
  }
  // W. J. Cody's rational Chebyshev approximation of the normal CDF (fast path)
  const CA = [2.2352520354606839287, 161.02823106855587881, 1067.6894854603709582, 18154.981253343561249, 0.065682337918207449113];
  const CB = [47.20258190468824187, 976.09855173777669322, 10260.932208618978205, 45507.789335026729956];
  const CC = [0.39894151208813466764, 8.8831497943883759412, 93.506656132177855979, 597.27027639480026226, 2494.5375852903726711, 6848.1904505362823326, 11602.651437647350124, 9842.7148383839780218, 1.0765576773720192317e-8];
  const CD = [22.266688044328115691, 235.38790178262499861, 1519.377599407554805, 6485.558298266760755, 18615.571640885098091, 34900.952721145977266, 38912.003286093271411, 19685.429676859990727];
  const CP = [0.21589853405795699, 0.1274011611602473639, 0.022235277870649807, 0.001421619193227893466, 2.9112874951168792e-5, 0.02307344176494017303];
  const CQ = [1.28426009614491121, 0.468238212480865118, 0.0659881378689285515, 0.00378239633202758244, 7.29751555083966205e-5];
  function pnormFast(x) {
    const y = Math.abs(x);
    let cum;
    if (y <= 0.67448975) {
      let xnum = 0, xden = 0;
      if (y > 1.1e-16) { const xsq = x * x; xnum = CA[4] * xsq; xden = xsq; for (let i = 0; i < 3; i++) { xnum = (xnum + CA[i]) * xsq; xden = (xden + CB[i]) * xsq; } }
      return 0.5 + x * (xnum + CA[3]) / (xden + CB[3]);
    } else if (y <= 5.656854249492380195206754896838) {
      let xnum = CC[8] * y, xden = y;
      for (let i = 0; i < 7; i++) { xnum = (xnum + CC[i]) * y; xden = (xden + CD[i]) * y; }
      const temp = (xnum + CC[7]) / (xden + CD[7]);
      const xsq = Math.trunc(y * 16) / 16, del = (y - xsq) * (y + xsq);
      cum = Math.exp(-xsq * xsq * 0.5) * Math.exp(-del * 0.5) * temp;
    } else if (y < 38) {
      const xsq0 = 1 / (x * x);
      let xnum = CP[5] * xsq0, xden = xsq0;
      for (let i = 0; i < 4; i++) { xnum = (xnum + CP[i]) * xsq0; xden = (xden + CQ[i]) * xsq0; }
      let temp = xsq0 * (xnum + CP[4]) / (xden + CQ[4]);
      temp = (0.398942280401432677939946059934 - temp) / y;
      const xsq = Math.trunc(y * 16) / 16, del = (y - xsq) * (y + xsq);
      cum = Math.exp(-xsq * xsq * 0.5) * Math.exp(-del * 0.5) * temp;
    } else cum = 0;
    return x > 0 ? 1 - cum : cum;
  }

  function pnorm(x, mean = 0, sd = 1, upper = false) {
    const z = (x - mean) / sd;
    if (!isFinite(z)) return (z > 0) !== upper ? 1 : 0;
    const v = 0.5 * erfc(-z / SQRT2);
    return upper ? 0.5 * erfc(z / SQRT2) : v;
  }
  function dnorm(x, mean = 0, sd = 1) {
    const z = (x - mean) / sd;
    return Math.exp(-0.5 * z * z - LN_SQRT_2PI) / sd;
  }
  // Wichura (1988) AS241 PPND16
  function qnorm(p, mean = 0, sd = 1) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const q = p - 0.5;
    let r, val;
    if (Math.abs(q) <= 0.425) {
      r = 0.180625 - q * q;
      val = q * (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r
        + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r
        + 3.387132872796366608) / (((((((r * 5226.495278852545925 + 28729.085735721942674) * r + 39307.89580009271061) * r
        + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
    } else {
      r = q < 0 ? p : 1 - p;
      r = Math.sqrt(-Math.log(r));
      if (r <= 5) {
        r -= 1.6;
        val = (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r
          + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r
          + 1.42343711074968357734) / (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r
          + 0.0151986665636164571966) * r + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r
          + 2.05319162663775882187) * r + 1);
      } else {
        r -= 5;
        val = (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r
          + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r
          + 6.6579046435011037772) / (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r
          + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r
          + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1);
      }
      if (q < 0) val = -val;
    }
    return mean + sd * val;
  }

  // ---------- Root finding helper ----------
  function solveMonotone(f, target, lo, hi, increasing = true, tol = 1e-12) {
    // expand bracket
    let flo = f(lo), fhi = f(hi), it = 0;
    const g = (v) => increasing ? v - target : target - v;
    while (g(fhi) < 0 && it++ < 200) { lo = hi; flo = fhi; hi = hi * 2 + 1; fhi = f(hi); }
    it = 0;
    while (g(flo) > 0 && it++ < 200) { hi = lo; fhi = flo; lo = lo > 0 ? lo / 2 : lo * 2 - 1; flo = f(lo); }
    for (let i = 0; i < 300; i++) {
      const mid = 0.5 * (lo + hi);
      const fm = f(mid);
      if (g(fm) < 0) lo = mid; else hi = mid;
      if (Math.abs(hi - lo) <= tol * Math.max(1, Math.abs(mid))) break;
    }
    return 0.5 * (lo + hi);
  }

  // ---------- t ----------
  function pt(t, df, upper = false) {
    if (!isFinite(df) || df > 1e7) return pnorm(t, 0, 1, upper);
    const x = df / (df + t * t);
    const tail = 0.5 * ibeta(x, df / 2, 0.5); // P(T > |t|)
    let lowerP = t > 0 ? 1 - tail : tail;
    if (upper) return t > 0 ? tail : 1 - tail;
    return lowerP;
  }
  function qt(p, df) { // lower quantile
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    if (p === 0.5) return 0;
    if (!isFinite(df) || df > 1e7) return qnorm(p);
    if (p > 0.5) return -qt(1 - p, df);
    // p<0.5 -> negative quantile; solve P(T > x) = p for x>0 then negate
    const x = solveMonotone((v) => pt(v, df, true), p, 0, Math.max(1, -qnorm(p) * 2), false, 1e-14);
    return -x;
  }
  function dt(t, df) { return Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * Math.log(df * Math.PI) - (df + 1) / 2 * Math.log1p(t * t / df)); }

  // ---------- chi-square ----------
  function pchisq(x, df, upper = false) {
    if (x <= 0) return upper ? 1 : 0;
    return upper ? qgammaUpper(df / 2, x / 2) : pgammaReg(df / 2, x / 2);
  }
  function qchisq(p, df) {
    if (p <= 0) return 0; if (p >= 1) return Infinity;
    const guess = Math.max(1e-8, df * Math.pow(1 - 2 / (9 * df) + qnorm(p) * Math.sqrt(2 / (9 * df)), 3));
    return solveMonotone((v) => pchisq(v, df), p, 0, Math.max(guess * 2, 1), true, 1e-14);
  }
  function dchisq(x, df) { if (x <= 0) return 0; return Math.exp((df / 2 - 1) * Math.log(x) - x / 2 - (df / 2) * Math.LN2 - lgamma(df / 2)); }

  // ---------- F ----------
  function pf(f, d1, d2, upper = false) {
    if (f <= 0) return upper ? 1 : 0;
    if (!isFinite(d2) || d2 > 1e7) return pchisq(f * d1, d1, upper);
    const x = d1 * f / (d1 * f + d2);
    return upper ? ibetaUpper(x, d1 / 2, d2 / 2) : ibeta(x, d1 / 2, d2 / 2);
  }
  function qf(p, d1, d2) {
    if (p <= 0) return 0; if (p >= 1) return Infinity;
    return solveMonotone((v) => pf(v, d1, d2), p, 0, 10, true, 1e-14);
  }

  // ---------- noncentral chi-square & t ----------
  function pchisqNC(x, df, lambda, upper = false) {
    if (!lambda) return pchisq(x, df, upper);
    if (x <= 0) return upper ? 1 : 0;
    const h = lambda / 2;
    const mode = Math.floor(h);
    const lw = (j) => -h + j * Math.log(h) - lfact(j);
    let sum = 0;
    for (let j = mode; j < mode + 100000; j++) {
      const w = Math.exp(lw(j));
      sum += w * pchisq(x, df + 2 * j, upper);
      if (w < 1e-17 && j > mode + 5) break;
    }
    for (let j = mode - 1; j >= 0; j--) {
      const w = Math.exp(lw(j));
      sum += w * pchisq(x, df + 2 * j, upper);
      if (w < 1e-17) break;
    }
    return Math.min(1, Math.max(0, sum));
  }
  function qchisqNC(p, df, lambda) {
    if (!lambda) return qchisq(p, df);
    return solveMonotone((v) => pchisqNC(v, df, lambda), p, 0, df + lambda + 10, true, 1e-12);
  }
  function ptNC(t, df, delta, upper = false) {
    if (!delta) return pt(t, df, upper);
    if (t < 0) { const v = ptNC(-t, df, -delta, false); return upper ? v : 1 - v; }
    const x = t * t / (t * t + df);
    const h = delta * delta / 2;
    let sum = 0;
    const lp = (j) => -h + j * Math.log(h) - lfact(j);
    const lq = (j) => -h + j * Math.log(h) - lgamma(j + 1.5);
    const mode = Math.floor(h);
    const term = (j) => {
      const pj = Math.exp(lp(j)), qj = Math.exp(lq(j)) * delta / SQRT2;
      return { v: pj * ibeta(x, j + 0.5, df / 2) + qj * ibeta(x, j + 1, df / 2), w: Math.abs(pj) + Math.abs(qj) };
    };
    for (let j = mode; j < mode + 100000; j++) { const r = term(j); sum += r.v; if (r.w < 1e-17 && j > mode + 5) break; }
    for (let j = mode - 1; j >= 0; j--) { const r = term(j); sum += r.v; if (r.w < 1e-17) break; }
    const lower = Math.min(1, Math.max(0, pnorm(-delta) + 0.5 * sum));
    return upper ? 1 - lower : lower;
  }
  function qtNC(p, df, delta) {
    if (!delta) return qt(p, df);
    return solveMonotone((v) => ptNC(v, df, delta), p, delta - 10, delta + 10, true, 1e-12);
  }

  // ---------- Discrete ----------
  function dbinom(y, n, p) {
    if (y < 0 || y > n || y !== Math.floor(y)) return 0;
    if (p === 0) return y === 0 ? 1 : 0;
    if (p === 1) return y === n ? 1 : 0;
    return Math.exp(lfact(n) - lfact(y) - lfact(n - y) + y * Math.log(p) + (n - y) * Math.log1p(-p));
  }
  function pbinom(y, n, p) { // P(Y <= y)
    y = Math.floor(y);
    if (y < 0) return 0; if (y >= n) return 1;
    return ibeta(1 - p, n - y, y + 1);
  }
  function dpois(y, k) {
    if (y < 0 || y !== Math.floor(y)) return 0;
    if (k === 0) return y === 0 ? 1 : 0;
    return Math.exp(-k + y * Math.log(k) - lfact(y));
  }
  function ppois(y, k) { y = Math.floor(y); if (y < 0) return 0; return qgammaUpper(y + 1, k); }

  // ---------- Gauss–Legendre ----------
  function gaussLegendre(n) {
    const x = new Float64Array(n), w = new Float64Array(n);
    const m = (n + 1) >> 1;
    for (let i = 0; i < m; i++) {
      let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), pp, z1;
      do {
        let p1 = 1, p2 = 0;
        for (let j = 0; j < n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j + 1) * z * p2 - j * p3) / (j + 1); }
        pp = n * (z * p1 - p2) / (z * z - 1);
        z1 = z; z = z1 - p1 / pp;
      } while (Math.abs(z - z1) > 1e-15);
      x[i] = -z; x[n - 1 - i] = z;
      w[i] = w[n - 1 - i] = 2 / ((1 - z * z) * pp * pp);
    }
    return { x, w };
  }
  const GL20 = gaussLegendre(20);
  function integrate(f, a, b, pieces = 1) {
    let s = 0; const h = (b - a) / pieces;
    for (let k = 0; k < pieces; k++) {
      const lo = a + k * h, c = lo + h / 2, r = h / 2;
      for (let i = 0; i < GL20.x.length; i++) s += GL20.w[i] * f(c + r * GL20.x[i]);
      s *= 1; // keep
      if (k === pieces - 1) break;
    }
    // apply radius once (all pieces same width)
    return s * h / 2;
  }

  // ---------- Studentized range ----------
  // P(range of k iid N(0,1) <= w)
  function prange(w, k) {
    if (w <= 0) return 0;
    // integrate k * phi(z) [Phi(z) - Phi(z-w)]^(k-1) over z
    const lo = -8.5, hi = 8.5 + w;
    const pieces = Math.max(12, Math.ceil((hi - lo) / 1.0));
    const f = (z) => {
      const d = pnormFast(z) - pnormFast(z - w);
      if (d <= 0) return 0;
      return dnorm(z) * Math.exp((k - 1) * Math.log(d));
    };
    const v = k * integrate(f, lo, hi, pieces);
    return Math.min(1, Math.max(0, v));
  }
  const TUKEY_LIM = new Map();
  function ptukey(q, k, df, upper = false) {
    if (q <= 0) return upper ? 1 : 0;
    let p;
    if (!isFinite(df) || df > 50000) p = prange(q, k);
    else {
      // s = sqrt(chi2_df/df); integrate over u = ln s
      const logdens = (s) => (df / 2) * Math.log(df) - lgamma(df / 2) - (df / 2 - 1) * Math.LN2 + (df - 1) * Math.log(s) - df * s * s / 2;
      let lim = TUKEY_LIM.get(df);
      if (!lim) { lim = [Math.log(Math.max(Math.sqrt(qchisq(1e-13, df) / df), 1e-12)), Math.log(Math.sqrt(qchisq(1 - 1e-13, df) / df))]; TUKEY_LIM.set(df, lim); }
      const ulo = lim[0], uhi = lim[1];
      const f = (u) => { const s = Math.exp(u); return prange(q * s, k) * Math.exp(logdens(s) + u); };
      const pieces = Math.max(8, Math.ceil((uhi - ulo) / 0.3));
      p = integrate(f, ulo, uhi, pieces);
      p = Math.min(1, Math.max(0, p));
    }
    return upper ? 1 - p : p;
  }
  function qtukey(p, k, df) { // lower-tail quantile: bracketed secant (Illinois) iteration
    if (k < 2) return 0;
    const qi = qtukeyInf(p, k);
    if (!isFinite(df) || df > 50000) return qi;
    const f = (v) => ptukey(v, k, df) - p;
    // q(df) >= q(inf); bracket upward from the infinite-df quantile
    // starting guess: exact for k = 2 (q = √2·t), close for larger k
    const g = Math.SQRT2 * qt(pnorm(qi / Math.SQRT2), df);
    let a = Math.max(qi, g * 0.985), fa = f(a), b = g * 1.015, fb = f(b), it = 0;
    if (b <= a) { b = a * 1.02; fb = f(b); }
    while (fa > 0 && it++ < 60) { b = a; fb = fa; a = Math.max(a * 0.9, 1e-3); fa = f(a); }
    it = 0;
    while (fb < 0 && it++ < 60) { a = b; fa = fb; b = b * 1.1; fb = f(b); }
    let side = 0;
    for (let i = 0; i < 100; i++) {
      const c = (a * fb - b * fa) / (fb - fa);
      const fc = f(c);
      if (Math.abs(fc) < 1e-13) return c;
      if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; }
      else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
      if (Math.abs(b - a) < 2e-10 * c) return (a * fb - b * fa) / (fb - fa);
    }
    return (a + b) / 2;
  }
  function qtukeyInf(p, k) { return solveMonotone((v) => prange(v, k), p, 0.5, 8, true, 1e-12); }

  const Dist = { lgamma, lbeta, lfact, pgammaReg, qgammaUpper, ibeta, ibetaUpper, erfc,
    pnorm, dnorm, qnorm, pt, qt, dt, pchisq, qchisq, dchisq, pf, qf, pchisqNC, qchisqNC, ptNC, qtNC,
    dbinom, pbinom, dpois, ppois, ptukey, qtukey, prange, gaussLegendre, integrate, solveMonotone };
  root.Dist = Dist;
  if (typeof module !== 'undefined' && module.exports) module.exports = Dist;
})(typeof globalThis !== 'undefined' ? globalThis : this);

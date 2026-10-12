/* VarStat — linear algebra and basic numeric helpers. */
(function (root) {
  'use strict';
  const zeros = (r, c) => Array.from({ length: r }, () => new Float64Array(c));
  function transpose(A) { const r = A.length, c = A[0].length, T = zeros(c, r); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) T[j][i] = A[i][j]; return T; }
  function matMul(A, B) {
    const r = A.length, k = B.length, c = B[0].length, C = zeros(r, c);
    for (let i = 0; i < r; i++) for (let t = 0; t < k; t++) { const a = A[i][t]; if (a === 0) continue; const Bt = B[t], Ci = C[i]; for (let j = 0; j < c; j++) Ci[j] += a * Bt[j]; }
    return C;
  }
  function matVec(A, v) { return A.map((row) => { let s = 0; for (let j = 0; j < v.length; j++) s += row[j] * v[j]; return s; }); }
  function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

  // Sweep operator on a symmetric matrix (in place). Returns pivots used.
  // Columns with relative tolerance below tol are treated as aliased (generalized inverse).
  function sweepAll(A, tol = 1e-10, cols) {
    const n = A.length;
    const diag0 = Array.from({ length: n }, (_, i) => A[i][i]);
    const swept = new Array(n).fill(false);
    const list = cols || Array.from({ length: n }, (_, i) => i);
    for (const k of list) {
      const d = A[k][k];
      if (!(diag0[k] > 0) || !(d > tol * diag0[k])) {
        // aliased (linearly dependent on previously swept columns): drop it
        for (let j = 0; j < n; j++) { A[k][j] = 0; A[j][k] = 0; }
        continue;
      }
      const inv = 1 / d;
      for (let i = 0; i < n; i++) {
        if (i === k) continue;
        const aik = A[i][k];
        if (aik === 0) continue;
        const Ai = A[i], Ak = A[k];
        for (let j = 0; j < n; j++) { if (j !== k) Ai[j] -= aik * Ak[j] * inv; }
      }
      for (let j = 0; j < n; j++) { if (j !== k) { A[k][j] *= inv; A[j][k] *= -inv; } }
      A[k][k] = inv;
      swept[k] = true;
    }
    return swept;
  }

  // Least squares via sweep on [X'WX X'Wy; y'WX y'Wy]. Returns coefficients, g-inverse, rank, SSE.
  function lstsq(X, y, w) {
    const n = X.length, p = X[0] ? X[0].length : 0;
    const M = zeros(p + 1, p + 1);
    for (let i = 0; i < n; i++) {
      const wi = w ? w[i] : 1, xi = X[i];
      for (let a = 0; a < p; a++) {
        const xa = xi[a] * wi; if (xa === 0) continue;
        for (let b = a; b < p; b++) M[a][b] += xa * xi[b];
        M[a][p] += xa * y[i];
      }
      M[p][p] += wi * y[i] * y[i];
    }
    for (let a = 0; a < p + 1; a++) for (let b = 0; b < a; b++) M[a][b] = M[b][a];
    const XtX = M.slice(0, p).map((r) => Float64Array.from(r.slice(0, p)));
    const swept = sweepAll(M, 1e-9, Array.from({ length: p }, (_, i) => i));
    const b = new Float64Array(p), ginv = zeros(p, p);
    let rank = 0;
    for (let a = 0; a < p; a++) {
      if (swept[a]) { rank++; b[a] = M[a][p]; }
      for (let c = 0; c < p; c++) ginv[a][c] = (swept[a] && swept[c]) ? M[a][c] : 0;
    }
    return { b, ginv, rank, sse: M[p][p], aliased: swept.slice(0, p).map((s) => !s), XtX };
  }

  function inverse(A) {
    const n = A.length, M = A.map((r, i) => { const row = new Float64Array(2 * n); for (let j = 0; j < n; j++) row[j] = r[j]; row[n + i] = 1; return row; });
    for (let c = 0; c < n; c++) {
      let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-300) throw new Error('Singular matrix');
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c]; if (f === 0) continue; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map((r) => Float64Array.from(r.slice(n)));
  }

  // Incremental orthogonal basis for sequential (type I) sums of squares
  class SeqBasis {
    constructor(n) { this.n = n; this.Q = []; }
    // add columns; returns {df, ss} for projection of y on the new directions
    add(cols, y) {
      let df = 0, ss = 0;
      for (const c of cols) {
        const v = Float64Array.from(c);
        const n0 = Math.sqrt(dot(v, v));
        if (n0 === 0) continue;
        for (let pass = 0; pass < 2; pass++) for (const q of this.Q) { const d = dot(q, v); if (d !== 0) for (let i = 0; i < v.length; i++) v[i] -= d * q[i]; }
        const nv = Math.sqrt(dot(v, v));
        if (nv > 1e-8 * n0) {
          for (let i = 0; i < v.length; i++) v[i] /= nv;
          this.Q.push(v); df++;
          const t = dot(v, y); ss += t * t;
        }
      }
      return { df, ss };
    }
    fitted(y) { const f = new Float64Array(this.n); for (const q of this.Q) { const d = dot(q, y); for (let i = 0; i < this.n; i++) f[i] += d * q[i]; } return f; }
  }

  // ---- basic stats helpers ----
  const sum = (a) => { let s = 0; for (const v of a) s += v; return s; };
  const mean = (a) => sum(a) / a.length;
  function variance(a) { const m = mean(a); let s = 0; for (const v of a) s += (v - m) * (v - m); return s / (a.length - 1); }
  const sorted = (a) => Float64Array.from(a).sort();

  // Seeded RNG (Mulberry32) for reproducible bootstrap
  function rng(seed) { let s = seed >>> 0; return function () { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const LinAlg = { zeros, transpose, matMul, matVec, dot, sweepAll, lstsq, inverse, SeqBasis, sum, mean, variance, sorted, rng };
  root.LinAlg = LinAlg;
  if (typeof module !== 'undefined' && module.exports) module.exports = LinAlg;
})(typeof globalThis !== 'undefined' ? globalThis : this);

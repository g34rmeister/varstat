/* VarStat — SVG charts (histogram + polygon + normal curve, density lines, regression fits). */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function niceTicks(lo, hi, n = 6) {
    if (!(hi > lo)) { hi = lo + 1; }
    const span = hi - lo, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const err = step0 / mag, step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const t0 = Math.ceil(lo / step - 1e-9) * step, out = [];
    for (let t = t0; t <= hi + step * 1e-9; t += step) out.push(Math.abs(t) < step * 1e-9 ? 0 : t);
    return { ticks: out, step };
  }
  const tickLabel = (v, step) => { const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9)); return v.toFixed(Math.min(d, 8)); };

  /* spec: { title, xLabel, yLabel, layers: [{type:'bars', bars:[{x0,x1,y}]}, {type:'line', x:[], y:[], dash, cls}, {type:'points', x:[], y:[]}], xDomain?, yDomain? } */
  function render(spec, opts = {}) {
    const W = opts.width || 640, H = opts.height || 380;
    const m = { l: 64, r: 20, t: spec.title ? 40 : 18, b: 52 };
    let xs = [], ys = [0];
    for (const L of spec.layers) {
      if (L.type === 'bars') L.bars.forEach((b) => { xs.push(b.x0, b.x1); ys.push(b.y); });
      else { xs.push(...L.x); ys.push(...L.y.filter(isFinite)); }
    }
    let [x0, x1] = spec.xDomain || [Math.min(...xs), Math.max(...xs)];
    let [y0, y1] = spec.yDomain || [Math.min(0, ...ys), Math.max(...ys)];
    if (spec.yNoZero) { y0 = Math.min(...ys.slice(1)); }
    if (x1 === x0) { x0 -= 1; x1 += 1; }
    if (y1 === y0) { y1 = y0 + 1; }
    const padY = (y1 - y0) * 0.06; if (!spec.yDomain) { y1 += padY; if (spec.yNoZero) y0 -= padY; }
    const xt = niceTicks(x0, x1), yt = niceTicks(y0, y1, 5);
    const X = (v) => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
    const Y = (v) => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
    const parts = [];
    parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="var(--chart-bg)"/>`);
    if (spec.title) parts.push(`<text x="${W / 2}" y="24" text-anchor="middle" class="c-title" fill="var(--ink)">${esc(spec.title)}</text>`);
    yt.ticks.filter((t) => t >= y0 - 1e-12 && t <= y1 + 1e-12).forEach((t) => {
      parts.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--grid)" stroke-width="1"/>`);
      parts.push(`<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end" class="c-tick" fill="var(--muted)">${tickLabel(t, yt.step)}</text>`);
    });
    xt.ticks.filter((t) => t >= x0 - 1e-12 && t <= x1 + 1e-12).forEach((t) => {
      parts.push(`<line x1="${X(t)}" x2="${X(t)}" y1="${H - m.b}" y2="${H - m.b + 5}" stroke="var(--muted)"/>`);
      parts.push(`<text x="${X(t)}" y="${H - m.b + 19}" text-anchor="middle" class="c-tick" fill="var(--muted)">${tickLabel(t, xt.step)}</text>`);
    });
    parts.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="var(--ink)" stroke-width="1"/>`);
    parts.push(`<line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${H - m.b}" stroke="var(--ink)" stroke-width="1"/>`);
    const clip = `clip-${Math.random().toString(36).slice(2, 8)}`;
    parts.push(`<defs><clipPath id="${clip}"><rect x="${m.l}" y="${m.t - 2}" width="${W - m.l - m.r}" height="${H - m.t - m.b + 2}"/></clipPath></defs><g clip-path="url(#${clip})">`);
    for (const L of spec.layers) {
      if (L.type === 'bars') L.bars.forEach((b) => parts.push(`<rect x="${X(b.x0) + 0.5}" y="${Y(b.y)}" width="${Math.max(0, X(b.x1) - X(b.x0) - 1)}" height="${Math.max(0, Y(y0 > 0 ? y0 : 0) - Y(b.y))}" fill="var(--bar)" stroke="var(--bar-edge)" stroke-width="1"/>`));
      if (L.type === 'line') {
        const pts = L.x.map((x, i) => [x, L.y[i]]).filter((p) => isFinite(p[1]));
        if (pts.length) parts.push(`<polyline fill="none" stroke="${L.color || 'var(--accent)'}" stroke-width="${L.width || 2.25}" ${L.dash ? 'stroke-dasharray="6 4"' : ''} stroke-linejoin="round" points="${pts.map((p) => X(p[0]).toFixed(2) + ',' + Y(p[1]).toFixed(2)).join(' ')}"/>`);
      }
      if (L.type === 'points') L.x.forEach((x, i) => parts.push(`<circle cx="${X(x)}" cy="${Y(L.y[i])}" r="4.5" fill="var(--chart-bg)" stroke="${L.color || 'var(--ink)'}" stroke-width="2"/>`));
    }
    parts.push('</g>');
    if (spec.xLabel) parts.push(`<text x="${(m.l + W - m.r) / 2}" y="${H - 12}" text-anchor="middle" class="c-label" fill="var(--ink)">${esc(spec.xLabel)}</text>`);
    if (spec.yLabel) parts.push(`<text transform="translate(16 ${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle" class="c-label" fill="var(--ink)">${esc(spec.yLabel)}</text>`);
    if (spec.legend && spec.legend.length) {
      let lx = W - m.r - 8, ly = m.t + 6;
      spec.legend.slice().reverse().forEach((g, i) => {
        parts.push(`<g transform="translate(${lx} ${ly + i * 18})"><text x="-22" y="4" text-anchor="end" class="c-tick" fill="var(--ink)">${esc(g.label)}</text><line x1="-18" x2="0" y1="0" y2="0" stroke="${g.color || 'var(--accent)'}" stroke-width="2.5" ${g.dash ? 'stroke-dasharray="6 4"' : ''}/></g>`);
      });
    }
    return `<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(spec.title || 'chart')}" class="chart-svg">${parts.join('')}</svg>`;
  }

  // Export a standalone SVG string with concrete colors resolved from CSS variables
  function standalone(svgEl) {
    const cs = getComputedStyle(svgEl);
    const vars = ['--chart-bg', '--ink', '--muted', '--grid', '--bar', '--bar-edge', '--accent', '--accent-2'];
    let s = svgEl.outerHTML;
    for (const v of vars) s = s.split(`var(${v})`).join(cs.getPropertyValue(v).trim() || '#000');
    s = s.replace('<svg ', '<svg style="font-family: Helvetica, Arial, sans-serif" ');
    s = s.replace(/class="c-title"/g, 'font-size="16" font-weight="600"').replace(/class="c-tick"/g, 'font-size="12"').replace(/class="c-label"/g, 'font-size="13"');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + s;
  }
  function toPNG(svgEl, scale = 2) {
    return new Promise((resolve, reject) => {
      const s = standalone(svgEl);
      const img = new Image();
      const vb = svgEl.viewBox.baseVal;
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = vb.width * scale; c.height = vb.height * scale;
        const ctx = c.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
      };
      img.onerror = () => reject(new Error('PNG export failed'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    });
  }

  root.Charts = { render, standalone, toPNG, niceTicks };
})(typeof globalThis !== 'undefined' ? globalThis : this);

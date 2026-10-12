/* VarStat — application shell: state, data sheet, report, menus, file I/O. */
(function () {
  'use strict';
  const A = window.Anova, Data = window.Data, Reports = window.Reports;

  // ---------- tiny DOM helper ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return el;
  }
  const $ = (s, el = document) => el.querySelector(s);

  // ---------- state ----------
  const S = {
    ds: { columns: [] }, dsName: T('Untitled'), report: [], settings: { decimals: 4, order: 'asc' }, tab: 'data',
  };
  const STORE = 'varstat.session.v1';
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify({ ds: S.ds, dsName: S.dsName, report: S.report.slice(-60), settings: S.settings })); } catch (e) { /* storage unavailable or full */ }
  }
  function restore() {
    try { const raw = localStorage.getItem(STORE); if (!raw) return false; const o = JSON.parse(raw); if (!o || !o.ds) return false; Object.assign(S, { ds: o.ds, dsName: o.dsName, report: o.report || [], settings: { ...S.settings, ...(o.settings || {}) } }); return true; } catch (e) { return false; }
  }
  const nRows = () => Data.nRows(S.ds);
  const colNames = () => S.ds.columns.map((c) => c.name);
  const numericCols = () => S.ds.columns.filter((c) => c.type === 'numeric').map((c) => c.name);

  // ---------- formatting ----------
  function fmt(v, kind) {
    if (v === '' || v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    if (Number.isNaN(v)) return '—';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    const d = S.settings.decimals;
    if (kind === 'int') return Number.isInteger(v) ? String(v) : v.toFixed(d > 2 ? 2 : d);
    if (kind === 'num1') return String(v);
    if (kind === 'p') { const lim = Math.pow(10, -d); return v < lim ? '<' + lim.toFixed(d) : v.toFixed(d); }
    if (Math.abs(v) >= 1e10 || (v !== 0 && Math.abs(v) < Math.pow(10, -d) * 0.5)) return v.toExponential(Math.max(2, d - 1));
    return v.toFixed(d);
  }

  // ---------- toast / busy ----------
  let toastTimer;
  function toast(msg) { let t = $('.toast'); if (!t) { t = h('div', { class: 'toast', role: 'status' }); document.body.append(t); } t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200); }
  function busy(label, fn) {
    const b = h('div', { class: 'busy' }, h('div', null, label || T('Computing…')));
    document.body.append(b);
    return new Promise((res) => setTimeout(() => { try { res(fn()); } catch (e) { console.error(e); showError(e); res(null); } finally { b.remove(); } }, 30));
  }
  function showError(e) { toast((e && e.message) || String(e)); }

  // ---------- saving files ----------
  async function saveFile(filename, data, mime) {
    if (window.DesktopBridge) {
      try {
        const payload = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
        const r = await window.DesktopBridge.save(filename, payload);
        if (r && r.path) toast(T('Saved {0}', r.path)); else toast(T('Save cancelled'));
      } catch (e) { showError(e); }
      return;
    }
    try {
      const dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null;
      if (dl) {
        try { await dl.save({ filename, data }); toast(T('Saved {0}', filename)); return; }
        catch (e) { if (e && e.code === 'declined') { toast(T('Save cancelled')); return; } if (e && e.code === 'rate_limited') { toast(T('A save is already waiting for confirmation')); return; } }
      }
    } catch (e) { /* fall through to a plain browser download */ }
    if (window.claude) { toast(T('Saving files is not available here. Use Copy instead.')); return; }
    try {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: filename }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(T('Saved {0}', filename));
    } catch (e) { toast(T('Saving files is not available here. Use Copy instead.')); }
  }
  async function copyText(text, html) {
    try {
      if (html && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      else await navigator.clipboard.writeText(text);
      toast(T('Copied to clipboard'));
    } catch (e) {
      const ta = h('textarea', { style: { position: 'fixed', top: '-1000px' } }); ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand('copy'); toast(T('Copied to clipboard')); } catch (e2) { toast(T('Copy failed — select the text and copy it manually')); }
      ta.remove();
    }
  }

  // ---------- data loading ----------
  function setDataset(ds, name, { silent } = {}) {
    S.ds = { columns: ds.columns }; S.dsName = name || T('Untitled');
    renderGrid(); persist();
    if (!silent) toast(T('Opened {0}: {1} variables, {2} rows', S.dsName, S.ds.columns.length, nRows()));
  }
  function decodeText(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }
  async function openFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const buf = new Uint8Array(await file.arrayBuffer());
    let ds;
    if (['xlsx', 'xls', 'ods', 'xlsm'].includes(ext)) {
      if (!window.XLSX) throw new Error(T('The spreadsheet reader did not load. Check your internet connection, or save the sheet as CSV.'));
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      ds = Data.fromMatrix(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }));
    } else if (ext === 'fdt') ds = Data.parseFDT(buf);
    else ds = Data.parseDelimited(decodeText(buf));
    setDataset(ds, file.name);
    switchTab('data');
  }
  function pickFile(accept, cb) {
    if (window.DesktopBridge) {
      const exts = accept.split(',').map((x) => x.replace('.', '').trim());
      window.DesktopBridge.open([{ name: T('Data files'), extensions: exts }, { name: T('All files'), extensions: ['*'] }]).then(async (f) => {
        if (!f) return;
        try { await cb({ name: f.name, arrayBuffer: async () => f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) }); } catch (e) { showError(e); }
      });
      return;
    }
    const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', async () => { const f = inp.files[0]; inp.remove(); if (f) { try { await cb(f); } catch (e) { showError(e); } } });
    document.body.append(inp); inp.click();
  }
  function exportCSV() { saveFile(baseName() + '.csv', Data.toCSV(S.ds), 'text/csv'); }
  function exportXLSX() {
    if (!window.XLSX) { toast(T('The spreadsheet writer did not load. Save as CSV instead.')); return; }
    const aoa = [colNames()]; for (let i = 0; i < nRows(); i++) aoa.push(S.ds.columns.map((c) => c.values[i] ?? null));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Data');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveFile(baseName() + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  const baseName = () => (S.dsName || 'data').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '_') || 'data';

  // ---------- data grid ----------
  const MAX_RENDER = 600;
  let renderLimit = MAX_RENDER;
  function renderGrid() {
    const wrap = $('#grid'); wrap.innerHTML = '';
    $('#dsname').textContent = S.dsName;
    document.title = 'VarStat — ' + S.dsName;
    $('#dsmeta').textContent = T('{0} var · {1} rows', S.ds.columns.length, nRows());
    if (!S.ds.columns.length) { wrap.append(h('div', { class: 'report-empty', style: { margin: '16px' } }, T('No data yet. Use File → Open data file, open an example, or paste from a spreadsheet.'))); return; }
    const n = nRows();
    const thead = h('thead', null, h('tr', null, h('th', { class: 'corner' }, '#'), S.ds.columns.map((c, j) => h('th', null,
      h('div', { class: 'colh', title: T('Click to rename, change type or delete'), onclick: () => columnDialog(j) }, h('span', { class: 'typetag' + (c.type === 'text' ? ' t' : '') }, c.type === 'text' ? T('T') : T('N')), c.name)))));
    const tbody = h('tbody');
    const lim = Math.min(n, renderLimit);
    for (let i = 0; i < lim; i++) {
      const tr = h('tr', null, h('th', null, i + 1));
      S.ds.columns.forEach((c, j) => {
        const v = c.values[i];
        const inp = h('input', { value: v === null || v === undefined ? '' : String(v), 'aria-label': `${c.name} row ${i + 1}`, 'data-r': i, 'data-c': j, placeholder: '·' });
        inp.addEventListener('change', () => editCell(i, j, inp));
        inp.addEventListener('keydown', gridKey);
        tr.append(h('td', { class: (c.type === 'numeric' ? 'num' : '') + (v === null || v === undefined ? ' missing' : '') }, inp));
      });
      tbody.append(tr);
    }
    wrap.append(h('table', { class: 'sheet' }, thead, tbody));
    if (n > lim) wrap.append(h('div', { style: { padding: '10px 16px' } }, h('button', { class: 'btn', onclick: () => { renderLimit += 2000; renderGrid(); } }, T('Show more rows ({0} not shown)', n - lim))));
  }
  function gridKey(e) {
    const r = +e.target.dataset.r, c = +e.target.dataset.c;
    let tr = r, tc = c;
    if (e.key === 'Enter' || e.key === 'ArrowDown') tr = r + 1; else if (e.key === 'ArrowUp') tr = r - 1; else return;
    e.preventDefault();
    if (e.key === 'Enter') e.target.dispatchEvent(new Event('change'));
    const nx = document.querySelector(`#grid input[data-r="${tr}"][data-c="${tc}"]`);
    if (nx) { nx.focus(); nx.select(); }
  }
  function editCell(i, j, inp) {
    const c = S.ds.columns[j], raw = inp.value.trim();
    if (raw === '') c.values[i] = null;
    else if (c.type === 'numeric') {
      const v = Data.parseNumber(raw, false), v2 = Data.parseNumber(raw, true);
      const val = isFinite(v) ? v : v2;
      if (!isFinite(val)) { toast(T('"{0}" is not a number. Change {1} to a text variable to enter labels.', raw, c.name)); inp.value = c.values[i] ?? ''; return; }
      c.values[i] = val;
    } else c.values[i] = raw;
    while (c.values.length <= i) c.values.push(null);
    inp.parentElement.classList.toggle('missing', raw === '');
    persist();
  }

  // ---------- report ----------
  function addEntry(title, blocks, opts = {}) {
    const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, time: new Date().toISOString(), blocks, example: !!opts.example, source: S.dsName };
    S.report.push(entry); persist(); renderReport(entry.id); switchTab('report');
    return entry;
  }
  const snapshot = () => ({ columns: S.ds.columns.map((c) => ({ name: c.name, type: c.type, values: c.values.slice() })) });
  // add a result that can be regenerated (e.g. after a language change)
  function record(titleKey, make, opts) {
    const e = addEntry(T(titleKey), make(), opts);
    e.regen = () => ({ title: T(titleKey), blocks: make() });
    return e;
  }
  function regenerateReport() {
    for (const e of S.report) if (e.regen) { try { const r = e.regen(); e.title = r.title; e.blocks = r.blocks; } catch (err) { console.error(err); } }
    persist(); renderReport();
  }
  function renderReport(scrollTo) {
    const rep = $('#report'); rep.innerHTML = '';
    if (!S.report.length) { rep.append(h('div', { class: 'report-empty' }, T('Results appear here. Choose an analysis from the Analysis menu.'))); return; }
    for (const e of S.report) rep.append(renderEntry(e));
    if (scrollTo) { const el = document.getElementById('e-' + scrollTo); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  }
  function renderEntry(e) {
    const time = new Date(e.time);
    const body = h('div', { class: 'entry-body', style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, e.blocks.map(renderBlock));
    const el = h('section', { class: 'entry', id: 'e-' + e.id },
      h('div', { class: 'entry-head' }, h('h1', null, e.title), e.example ? h('span', { class: 'example-tag' }, T('Example')) : null,
        h('span', { class: 'stamp' }, `${e.source ? e.source + ' · ' : ''}${time.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`),
        h('span', { class: 'tools' },
          h('button', { class: 'btn ghost sm', title: T('Copy this result'), onclick: () => copyText(entryText(e), entryHTML(e, el)) }, T('Copy')),
          h('button', { class: 'btn ghost sm', title: T('Remove this result'), onclick: () => { S.report = S.report.filter((x) => x !== e); persist(); renderReport(); } }, T('Remove')))),
      body);
    return el;
  }
  function renderBlock(b) {
    switch (b.type) {
      case 'heading': return h('h' + Math.min(5, b.level || 2), null, b.text);
      case 'note': return h('p', { class: 'note', style: { margin: 0 } }, b.text);
      case 'warning': return h('div', { class: 'warning' }, b.text);
      case 'kv': {
        const two = b.cols === 2;
        const grid = h('div', { class: 'kv' + (two ? ' two' : '') });
        for (const [k, v, kind] of b.rows) {
          const kd = kind || (Number.isInteger(v) && Math.abs(v) < 1e7 ? 'int' : 'num');
          const vc = 'v' + (typeof v === 'string' ? ' s' : '');
          if (two) grid.append(h('div', null, h('span', null, k), h('span', { class: vc }, fmt(v, kd))));
          else grid.append(h('span', null, k), h('span', { class: vc }, fmt(v, kd)));
        }
        return b.title ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, h('div', { class: 'kv-title' }, b.title), grid) : grid;
      }
      case 'table': {
        const kinds = b.kinds || [];
        const t = h('table', { class: 'res' }, b.title ? h('caption', null, b.title) : null,
          h('thead', null, h('tr', null, b.columns.map((c) => h('th', null, c)))),
          h('tbody', null, b.rows.map((r, ri) => h('tr', { class: b.emphasizeLast && ri === b.rows.length - 1 ? 'em' : '' }, r.map((v, ci) => {
            const k = kinds[ci] || (typeof v === 'number' ? 'num' : 'text');
            const cls = ci === b.groupsCol ? 'grp' : (k === 'text' || typeof v === 'string' && ci === 0) ? 'txt' : (k === 'p' && typeof v === 'number' && v < 0.05 ? 'sig' : '');
            return h('td', { class: cls }, fmt(v, k));
          })))));
        return h('div', { class: 'tbl-wrap' }, t);
      }
      case 'chart': return renderChart(b);
      default: return h('div', null, '');
    }
  }
  function chartSpec(b) {
    if (b.spec) return b.spec;
    if (b.kind === 'regression') {
      const xs = b.x, lo = Math.min(...xs), hi = Math.max(...xs), cx = [], cy = [];
      const f = (x) => b.b[0] + b.termIds.reduce((s, id, j) => s + b.b[j + 1] * A.REG_TERMS[id].f(x), 0);
      for (let i = 0; i <= 200; i++) { const x = lo + (hi - lo) * i / 200; cx.push(x); cy.push(f(x)); }
      const eq = 'ŷ = ' + Reports.fmtN(b.b[0]) + b.termIds.map((id, j) => ` ${b.b[j + 1] < 0 ? '−' : '+'} ${Reports.fmtN(Math.abs(b.b[j + 1]))}·${A.REG_TERMS[id].label}`).join('');
      return { title: b.title, xLabel: b.xLabel, yLabel: b.yLabel, yNoZero: true, layers: [{ type: 'line', x: cx, y: cy }, { type: 'points', x: xs, y: b.y }], legend: [{ label: eq.length > 70 ? T('Fitted model') : eq }] };
    }
    return { layers: [] };
  }
  function renderChart(b) {
    const spec = { ...chartSpec(b) };
    if (b.custom) Object.assign(spec, b.custom);
    const holder = h('div', { html: Charts.render(spec) });
    const svg = () => holder.querySelector('svg');
    const edit = h('div', { class: 'chart-edit', hidden: true });
    const fields = [[T('Title'), 'title'], [T('X axis label'), 'xLabel'], [T('Y axis label'), 'yLabel']];
    for (const [lab, key] of fields) {
      const id = 'ce-' + Math.random().toString(36).slice(2, 8);
      const inp = h('input', { id, value: spec[key] || '' });
      inp.addEventListener('input', () => { b.custom = { ...(b.custom || {}), [key]: inp.value }; holder.innerHTML = Charts.render({ ...chartSpec(b), ...b.custom }); persist(); });
      edit.append(h('label', { for: id }, lab), inp);
    }
    const name = () => ((b.custom && b.custom.title) || spec.title || 'chart').replace(/[^\w\- ]+/g, '_').slice(0, 60);
    return h('div', { class: 'chart' }, holder,
      h('div', { class: 'chart-tools' },
        h('button', { class: 'btn sm', onclick: () => { edit.hidden = !edit.hidden; } }, T('Edit labels')),
        h('button', { class: 'btn sm', onclick: () => saveFile(name() + '.svg', Charts.standalone(svg()), 'image/svg+xml') }, T('Save SVG')),
        h('button', { class: 'btn sm', onclick: async () => { try { saveFile(name() + '.png', await Charts.toPNG(svg())); } catch (e) { showError(e); } } }, T('Save PNG'))),
      edit);
  }
  // plain-text & HTML export of entries
  function blockText(b) {
    switch (b.type) {
      case 'heading': return '\n' + b.text + '\n' + '-'.repeat(Math.min(80, b.text.length));
      case 'note': case 'warning': return b.text;
      case 'kv': return (b.title ? b.title + '\n' : '') + b.rows.map(([k, v, kind]) => `  ${k}: ${fmt(v, kind || (Number.isInteger(v) ? 'int' : 'num'))}`).join('\n');
      case 'table': {
        const kinds = b.kinds || [];
        const rows = [b.columns, ...b.rows.map((r) => r.map((v, i) => fmt(v, kinds[i] || 'num')))];
        const w = b.columns.map((_, i) => Math.max(...rows.map((r) => String(r[i] ?? '').length)));
        return (b.title ? b.title + '\n' : '') + rows.map((r, ri) => r.map((v, i) => (i === 0 || kinds[i] === 'text' ? String(v ?? '').padEnd(w[i]) : String(v ?? '').padStart(w[i]))).join('  ') + (ri === 0 ? '\n' + w.map((x) => '-'.repeat(x)).join('  ') : '')).join('\n');
      }
      case 'chart': return '[chart: ' + ((b.custom && b.custom.title) || (b.spec && b.spec.title) || b.title || '') + ']';
      default: return '';
    }
  }
  const entryText = (e) => `${e.title}\n${'='.repeat(e.title.length)}\n${e.source ? T('Data: ') + e.source + '\n' : ''}` + e.blocks.map(blockText).join('\n') + '\n';
  function entryHTML(e, el) {
    const clone = (el || renderEntry(e)).cloneNode(true);
    clone.querySelectorAll('.tools, .chart-tools, .chart-edit').forEach((x) => x.remove());
    clone.querySelectorAll('svg').forEach((s, i) => { const live = (el || document).querySelectorAll('svg')[i]; if (live) s.outerHTML = Charts.standalone(live).replace(/^<\?xml[^>]*>\s*/, ''); });
    return clone.outerHTML;
  }
  function reportDocument() {
    const live = $('#report');
    const parts = S.report.map((e) => entryHTML(e, document.getElementById('e-' + e.id)));
    const css = `body{font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#18261f;max-width:960px;margin:24px auto;padding:0 16px}h1{font-size:19px;border-bottom:1px solid #999;padding-bottom:4px}h2{font-size:16px}h3,h4,h5{font-size:14px}.entry{margin-bottom:28px}.stamp{color:#666;font-size:11px;margin-left:8px}table{border-collapse:collapse;margin:6px 0}caption{text-align:left;font-weight:bold;padding-bottom:4px}th{border-top:1.5px solid #000;border-bottom:1px solid #000;padding:4px 9px;text-align:right}th:first-child,td:first-child{text-align:left}td{padding:3px 9px;text-align:right;border-bottom:1px solid #ddd;font-family:Menlo,Consolas,monospace;font-size:12px}tr:last-child td{border-bottom:1.5px solid #000}td.txt{font-family:inherit;text-align:left}td.grp{font-weight:bold;text-align:left}.kv{display:grid;grid-template-columns:max-content max-content;gap:2px 16px}.kv.two{grid-template-columns:1fr 1fr}.kv.two>div{display:flex;justify-content:space-between;gap:10px}.v{font-family:Menlo,Consolas,monospace}.note{color:#555}.warning{background:#f8ebd2;padding:5px 9px}.example-tag{font-size:10px;color:#8a5300;margin-left:6px}svg{max-width:100%;height:auto}`;
    void live;
    return `<!doctype html><html><head><meta charset="utf-8"><title>VarStat report</title><style>${css}</style></head><body><p style="color:#666">VarStat report · ${new Date().toLocaleString()}</p>${parts.join('\n')}</body></html>`;
  }

  // ---------- tabs ----------
  function switchTab(t) { S.tab = t; $('.panes').dataset.tab = t; document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); }

  // ---------- generic dialog ----------
  function dialog({ title, body, actions = [], narrow, onClose }) {
    const close = () => { scrim.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    const foot = h('div', { class: 'dlg-foot' });
    const dlg = h('div', { class: 'dialog' + (narrow ? ' narrow' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'dlg-head' }, h('h3', null, title), h('button', { class: 'btn ghost x', onclick: close, 'aria-label': T('Close') }, '✕')),
      h('div', { class: 'dlg-body' }, body), foot);
    const scrim = h('div', { class: 'scrim', onmousedown: (e) => { if (e.target === scrim) close(); } }, dlg);
    const setActions = (acts) => { foot.innerHTML = ''; acts.forEach((a) => foot.append(a instanceof Node ? a : h('button', { class: 'btn' + (a.primary ? ' primary' : ''), onclick: () => a.onClick(close), disabled: a.disabled }, a.label))); };
    setActions(actions);
    document.body.append(scrim); document.addEventListener('keydown', esc);
    setTimeout(() => { const f = dlg.querySelector('.dlg-body input, .dlg-body select, .dlg-body .item'); if (f && f.focus) f.focus(); }, 30);
    return { close, setActions, body: dlg.querySelector('.dlg-body'), foot };
  }
  // listbox widget: items [{value,label,meta,disabled}], multi selection
  function listbox(items, { multi = false, selected = [], onChange, onActivate, empty = T('Nothing to show') } = {}) {
    const sel = new Set(selected);
    const box = h('div', { class: 'listbox', role: 'listbox', 'aria-multiselectable': multi ? 'true' : 'false', tabindex: '0' });
    const render = () => {
      box.innerHTML = '';
      if (!items.length) box.append(h('div', { class: 'empty' }, empty));
      for (const it of items) {
        const row = h('div', { class: 'item' + (sel.has(it.value) ? ' sel' : '') + (it.disabled ? ' disabled' : ''), role: 'option', 'aria-selected': sel.has(it.value) ? 'true' : 'false' },
          multi ? h('input', { type: 'checkbox', tabindex: '-1', checked: sel.has(it.value), disabled: it.disabled }) : null, h('span', { class: 'grow' }, it.label), it.meta ? h('span', { class: 'pill' }, it.meta) : null);
        row.addEventListener('click', () => { if (it.disabled) return; if (multi) { sel.has(it.value) ? sel.delete(it.value) : sel.add(it.value); } else { sel.clear(); sel.add(it.value); } render(); onChange && onChange([...sel]); onActivate && !multi && onActivate(it.value); });
        row.addEventListener('dblclick', () => { if (!it.disabled && onActivate) onActivate(it.value, true); });
        box.append(row);
      }
    };
    render();
    box.getSelected = () => [...sel];
    box.setItems = (its) => { items = its; for (const v of [...sel]) if (!items.find((i) => i.value === v)) sel.delete(v); render(); };
    box.setSelected = (vals) => { sel.clear(); vals.forEach((v) => sel.add(v)); render(); };
    return box;
  }
  const field = (label, control, id) => { if (id && control.id === '') control.id = id; return h('div', { class: 'field' }, h('label', { for: control.id || undefined }, label), control); };
  let uid = 0; const nid = (p) => `${p}-${++uid}`;
  const inp = (attrs) => h('input', { type: 'text', id: nid('f'), ...attrs });
  const sel = (opts, value, attrs = {}) => { const s = h('select', { id: nid('s'), ...attrs }, opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l))); return s; };
  const num = (el) => { const v = Data.parseNumber(el.value, false); return isFinite(v) ? v : Data.parseNumber(el.value, true); };
  const varItems = (filter) => S.ds.columns.filter((c) => !filter || filter(c)).map((c) => ({ value: c.name, label: c.name, meta: c.type === 'text' ? 'text' : 'num' }));
  function requireData() { if (!S.ds.columns.length) { toast(T('Open a data file first (File → Open data file).')); return false; } return true; }

  // ---------- variable dialogs ----------
  function columnDialog(j) {
    const c = S.ds.columns[j];
    const name = inp({ value: c.name }), type = sel([['numeric', T('Numeric')], ['text', T('Text (labels)')]], c.type);
    const d = dialog({ title: T('Variable {0}', c.name), narrow: true, body: [field(T('Name'), name), field(T('Type'), type), h('p', { class: 'note' }, T('Converting text to numeric turns entries that are not numbers into missing values.'))],
      actions: [{ label: T('Delete variable'), onClick: (close) => { S.ds.columns.splice(j, 1); renderGrid(); persist(); close(); toast(T('Deleted {0}', c.name)); } },
        { label: T('Apply'), primary: true, onClick: (close) => {
          const nn = name.value.trim();
          if (!nn) return toast(T('The name cannot be empty.'));
          if (nn !== c.name && colNames().includes(nn)) return toast(T('A variable named {0} already exists.', nn));
          c.name = nn;
          if (type.value !== c.type) {
            if (type.value === 'text') c.values = c.values.map((v) => (v === null ? null : String(v)));
            else c.values = c.values.map((v) => { if (v === null) return null; const x = Data.parseNumber(v, false); return isFinite(x) ? x : (isFinite(Data.parseNumber(v, true)) ? Data.parseNumber(v, true) : null); });
            c.type = type.value;
          }
          renderGrid(); persist(); close();
        } }] });
    void d;
  }
  function computeDialog() {
    if (!requireData()) return;
    const name = inp({ value: T('NewVar') }), expr = inp({ placeholder: T('e.g. (X1 + X2) / 2  or  ln([Yield])'), style: { fontFamily: 'var(--f-data)' } });
    const vars = listbox(varItems((c) => c.type === 'numeric'), { onActivate: (v) => { expr.value += (/[\s*()+\-/^\[\]=]/.test(v) ? '[' + v + ']' : v); expr.focus(); } });
    dialog({ title: T('Compute a new variable'), body: [h('div', { class: 'cols2' }, h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Numeric variables (click to insert)')), vars), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, field(T('New variable name'), name), field(T('Expression'), expr), h('p', { class: 'note' }, T('Operators: + − * / ^ and parentheses. Functions: ln, log (base 10), log2, exp, sqrt, abs, sin, cos, tan. Rows where the expression is undefined become missing.')))) ],
      actions: [{ label: T('Create'), primary: true, onClick: (close) => {
        try {
          const nn = name.value.trim(); if (!nn) throw new Error(T('Give the new variable a name.')); if (colNames().includes(nn)) throw new Error(T('A variable named {0} already exists.', nn));
          const pe = Regress.parseExpr(expr.value, colNames());
          const vals = []; for (let i = 0; i < nRows(); i++) { const rec = {}; S.ds.columns.forEach((c) => (rec[c.name] = typeof c.values[i] === 'number' ? c.values[i] : NaN)); const v = pe.f(rec); vals.push(isFinite(v) ? v : null); }
          S.ds.columns.push({ name: nn, type: 'numeric', values: vals }); renderGrid(); persist(); close(); toast(T('Created {0}', nn));
        } catch (e) { showError(e); }
      } }] });
  }
  function addVariableDialog() {
    const name = inp({ value: T('V') + (S.ds.columns.length + 1) }), type = sel([['numeric', T('Numeric')], ['text', T('Text (labels)')]], 'numeric');
    dialog({ title: T('Add an empty variable'), narrow: true, body: [field(T('Name'), name), field(T('Type'), type)], actions: [{ label: T('Add'), primary: true, onClick: (close) => {
      const nn = name.value.trim(); if (!nn || colNames().includes(nn)) return toast(T('Choose a new, unique name.'));
      S.ds.columns.push({ name: nn, type: type.value, values: new Array(Math.max(nRows(), 10)).fill(null) }); S.ds.columns.forEach((c) => { while (c.values.length < Math.max(nRows(), 10)) c.values.push(null); });
      renderGrid(); persist(); close();
    } }] });
  }
  function addRowsDialog() {
    if (!requireData()) return;
    const n = inp({ value: '10', inputmode: 'numeric' });
    dialog({ title: T('Add rows'), narrow: true, body: [field(T('Number of empty rows to add at the end'), n)], actions: [{ label: T('Add rows'), primary: true, onClick: (close) => {
      const k = Math.max(1, Math.min(100000, Math.round(num(n)) || 0)); const N = nRows();
      S.ds.columns.forEach((c) => { while (c.values.length < N) c.values.push(null); for (let i = 0; i < k; i++) c.values.push(null); }); renderGrid(); persist(); close();
    } }] });
  }
  function deleteRowsDialog() {
    if (!requireData()) return;
    const a = inp({ value: '1' }), b = inp({ value: String(nRows()) }), empty = h('input', { type: 'checkbox', id: nid('c'), checked: true });
    dialog({ title: T('Delete rows'), narrow: true, body: [h('label', { class: 'chk' }, empty, T('Only delete completely empty rows')), h('div', { class: 'row' }, field(T('From row'), a), field(T('To row'), b))],
      actions: [{ label: T('Delete'), primary: true, onClick: (close) => {
        const N = nRows(), lo = Math.max(1, Math.round(num(a))) - 1, hi = Math.min(N, Math.round(num(b)));
        const keep = []; for (let i = 0; i < N; i++) { const inRange = i >= lo && i < hi; const isEmpty = S.ds.columns.every((c) => c.values[i] === null || c.values[i] === undefined); keep.push(!(inRange && (!empty.checked || isEmpty))); }
        const removed = keep.filter((k) => !k).length;
        S.ds.columns.forEach((c) => { c.values = c.values.filter((_, i) => keep[i]); }); renderGrid(); persist(); close(); toast(T('Deleted {0} rows', removed));
      } }] });
  }
  function newDatasetDialog() {
    const nv = inp({ value: '3' }), nr = inp({ value: '20' });
    dialog({ title: T('New dataset'), narrow: true, body: [h('div', { class: 'row' }, field(T('Variables'), nv), field(T('Rows'), nr)), h('p', { class: 'note' }, T('Click a column header to rename it or make it a text variable for treatment labels.'))],
      actions: [{ label: T('Create'), primary: true, onClick: (close) => {
        const k = Math.max(1, Math.min(200, Math.round(num(nv)) || 1)), r = Math.max(1, Math.min(100000, Math.round(num(nr)) || 1));
        setDataset({ columns: Array.from({ length: k }, (_, i) => ({ name: T('V') + (i + 1), type: 'numeric', values: new Array(r).fill(null) })) }, T('New dataset'), { silent: true }); close(); switchTab('data');
      } }] });
  }
  function pasteDialog() {
    const ta = h('textarea', { id: nid('t'), rows: 12, placeholder: T('Paste cells copied from Excel, Numbers, LibreOffice or Google Sheets. The first row must hold the variable names.') });
    const nm = inp({ value: T('Pasted data') });
    dialog({ title: T('Paste data from a spreadsheet'), body: [field('Data (first row = variable names)', ta), field(T('Dataset name'), nm)], actions: [{ label: T('Use this data'), primary: true, onClick: (close) => {
      try { const ds = Data.parseDelimited(ta.value); setDataset(ds, nm.value || T('Pasted data')); close(); switchTab('data'); } catch (e) { showError(e); }
    } }] });
  }
  function examplesDialog() {
    const items = (window.EXAMPLES || []).map((e) => ({ value: e.file, label: e.file, meta: T(e.design) }));
    let chosen = null;
    const desc = h('div', { class: 'callout' }, T('Pick an example to see what it contains.'));
    const lb = listbox(items, { onActivate: (v, dbl) => { chosen = v; const e = window.EXAMPLES.find((x) => x.file === v); desc.textContent = T(e.desc); if (dbl) go(); } });
    let dlgRef;
    const go = () => { const e = window.EXAMPLES.find((x) => x.file === chosen); if (!e) return toast(T('Choose an example.')); setDataset(Data.parseDelimited(e.csv), e.file); dlgRef.close(); switchTab('data'); };
    dlgRef = dialog({ title: T('Open an example dataset'), body: [h('p', { class: 'note', style: { margin: 0 } }, T('Sample datasets made for VarStat from simulated data, plus Fisher’s iris data.')), h('div', { class: 'cols2' }, lb, desc)], actions: [{ label: T('Open'), primary: true, onClick: go }] });
  }
  function settingsDialog() {
    const dec = sel([2, 3, 4, 5, 6, 8].map((d) => [d, d + ' decimal places']), S.settings.decimals), ord = sel([['asc', T('Ascending (smallest mean first, as in Sisvar)')], ['desc', T('Descending (largest mean first)')]], S.settings.order);
    dialog({ title: T('Settings'), narrow: true, body: [field(T('Numbers in the report'), dec), field(T('Order of means in comparison tables'), ord), h('p', { class: 'note' }, T('Decimal places apply to the whole report immediately. The order of means applies to new analyses.'))],
      actions: [{ label: T('Apply'), primary: true, onClick: (close) => { S.settings.decimals = +dec.value; S.settings.order = ord.value; Reports.setDecimals(S.settings.decimals); persist(); renderReport(); close(); } }] });
  }

  // ---------- help ----------
  function helpModels() {
    dialog({ title: T('How to specify an analysis of variance'), body: h('div', { class: 'help', html: T('help.models') }) });
  }
  function about() {
    dialog({ title: T('About VarStat'), narrow: true, body: h('div', { class: 'help', html: T('help.about') }) });
  }

  // ---------- menus ----------
  const MENUS = () => [
    [T('File'), [
      [T('Open data file…'), T('CSV, TXT, XLSX, ODS, FDT'), () => pickFile('.csv,.txt,.tsv,.dat,.xlsx,.xls,.ods,.fdt', openFile), 'CmdOrCtrl+O'],
      [T('Open example…'), '', examplesDialog],
      [T('Paste from spreadsheet…'), '', pasteDialog],
      [T('New dataset…'), '', newDatasetDialog],
      '-',
      [T('Save data as CSV'), '', () => requireData() && exportCSV(), 'CmdOrCtrl+S'],
      [T('Save data as Excel (.xlsx)'), '', () => requireData() && exportXLSX()],
      '-', T('Edit data'),
      [T('Compute new variable…'), '', computeDialog],
      [T('Add empty variable…'), '', addVariableDialog],
      [T('Add rows…'), '', addRowsDialog],
      [T('Delete rows…'), '', deleteRowsDialog],
      '-',
      [T('Settings…'), '', settingsDialog, 'CmdOrCtrl+,'],
    ]],
    [T('Analysis'), [
      [T('Analysis of variance…'), T('ANOVA'), () => window.Dialogs.anova(), 'CmdOrCtrl+Shift+A'],
      [T('Experimental plans…'), T('randomize'), () => window.Dialogs.plans()],
      [T('Kernel density estimation…'), '', () => window.Dialogs.kernel()],
      [T('Descriptive statistics…'), '', () => window.Dialogs.descriptive()],
      [T('Shapiro–Wilk…'), T('normality'), () => window.Dialogs.shapiro()],
      [T('Probability calculator…'), '', () => window.Dialogs.probability()],
      [T('Estimation…'), T('intervals'), () => window.Dialogs.estimation()],
      [T('Hypothesis tests…'), '', () => window.Dialogs.hypothesis()],
      [T('Linear regression…'), '', () => window.Dialogs.regression()],
      [T('Model selection…'), T('stepwise'), () => window.Dialogs.selection()],
      [T('Multiple comparisons (bootstrap)…'), '', () => window.Dialogs.bootstrap()],
    ]],
    [T('Report'), [
      [T('Copy whole report'), '', () => copyText(S.report.map(entryText).join('\n\n'), reportDocument())],
      [T('Save report as HTML'), T('opens in Word'), () => saveFile('VarStat report.html', reportDocument(), 'text/html')],
      [T('Save report as text'), '', () => saveFile('VarStat report.txt', S.report.map(entryText).join('\n\n'), 'text/plain')],
      '-',
      [T('Clear report'), '', () => { if (!S.report.length) return; const old = S.report; S.report = []; persist(); renderReport(); toastUndo(T('Report cleared'), () => { S.report = old; persist(); renderReport(); }); }],
    ]],
    [T('Help'), [
      [T('Writing ANOVA models'), '', helpModels],
      [T('About VarStat'), '', about],
    ]],
  ];
  function toastUndo(msg, undo) {
    toast(msg);
    const t = $('.toast'); const b = h('button', { class: 'btn sm', style: { marginLeft: '12px' }, onclick: () => { undo(); t.hidden = true; } }, T('Undo')); t.append(b);
  }
  function applyStaticText() {
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = T(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = T(el.dataset.i18nTitle); });
    document.documentElement.lang = { en: 'en', pt: 'pt-BR', es: 'es', tl: 'tl' }[I18N.lang] || 'en';
  }
  function syncNativeMenus() {
    if (!window.DesktopBridge) return;
    const reg = [];
    const ser = MENUS().map(([name, items]) => [name, items.map((it) => (it === '-' ? '-' : typeof it === 'string' ? { header: it } : (reg.push(it[2]), { label: it[0], id: reg.length - 1, accel: it[3] || null })))]);
    window.__menuReg = reg;
    window.DesktopBridge.setMenus(ser, {
      edit: T('Edit'), undo: T('Undo'), redo: T('Redo'), cut: T('Cut'), copy: T('Copy'), paste: T('Paste'), selectAll: T('Select all'),
      about: T('About VarStat'), hide: T('Hide VarStat'), hideOthers: T('Hide others'), unhide: T('Show all'), quit: T('Quit VarStat'), exit: T('Exit'),
      window: T('Window'), minimize: T('Minimize'), zoom: T('Zoom'), fullscreen: T('Toggle full screen'), view: T('View'), zoomIn: T('Zoom in'), zoomOut: T('Zoom out'), resetZoom: T('Actual size'),
    });
  }
  function setLanguage(l, { save = true } = {}) {
    I18N.setLang(l); S.settings.lang = I18N.lang;
    const ls = $('#lang'); if (ls) ls.value = I18N.lang;
    $('#menubar').innerHTML = ''; buildMenus(true);
    applyStaticText(); renderGrid(); regenerateReport();
    if (save) persist();
    syncNativeMenus();
  }
  function defaultLang() {
    const n = (navigator.language || 'en').toLowerCase();
    if (n.startsWith('pt')) return 'pt'; if (n.startsWith('es')) return 'es'; if (n.startsWith('tl') || n.startsWith('fil')) return 'tl'; return 'en';
  }
  function buildMenus(rebuild) {
    const bar = $('#menubar');
    for (const [name, items] of MENUS()) {
      const dd = h('div', { class: 'dropdown', role: 'menu' });
      for (const it of items) {
        if (it === '-') dd.append(h('hr'));
        else if (typeof it === 'string') dd.append(h('div', { class: 'sub-label' }, it));
        else dd.append(h('button', { role: 'menuitem', onclick: () => { closeMenus(); it[2](); } }, h('span', null, it[0]), it[1] ? h('small', null, it[1]) : null));
      }
      const m = h('div', { class: 'menu' }, h('button', { 'aria-haspopup': 'true', onclick: (e) => { e.stopPropagation(); const open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); }, onmouseenter: () => { if (document.querySelector('.menu.open') && !m.classList.contains('open')) { closeMenus(); m.classList.add('open'); } } }, name), dd);
      bar.append(m);
    }
    if (rebuild) return;
    document.addEventListener('click', closeMenus);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
  }
  const closeMenus = () => document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));

  // ---------- boot ----------
  function seedExample() {
    const e = (window.EXAMPLES || []).find((x) => x.file === 'rcbd_cultivars.csv');
    if (!e) return;
    setDataset(Data.parseDelimited(e.csv), e.file, { silent: true });
    try {
      const terms = A.parseModel(['Block', 'Cultivar'], colNames());
      const opts = { 1: [{ test: 'scottknott', alpha: 0.05 }, { test: 'tukey', alpha: 0.05 }] };
      const ds = snapshot();
      record('Analysis of variance', () => [{ type: 'note', text: T('Model: {0} (randomized complete blocks). Opened automatically as an example; remove it with the Remove button.', 'Block + Cultivar + ' + T('Error')) }, ...A.analyze(ds, terms, 'Yield', 'none', opts, S.settings).blocks], { example: true });
      switchTab('data');
    } catch (err) { console.error(err); }
  }
  function boot() {
    Reports.setDecimals(S.settings.decimals);
    const restored = restore();
    I18N.setLang(S.settings.lang || defaultLang()); S.settings.lang = I18N.lang;
    const ls = $('#lang');
    I18N.LANGS.forEach(([v, l]) => ls.append(h('option', { value: v, selected: v === I18N.lang }, l)));
    ls.addEventListener('change', () => setLanguage(ls.value));
    applyStaticText();
    buildMenus();
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.t)));
    $('#btn-open').addEventListener('click', () => pickFile('.csv,.txt,.tsv,.dat,.xlsx,.xls,.ods,.fdt', openFile));
    $('#btn-examples').addEventListener('click', examplesDialog);
    $('#btn-anova').addEventListener('click', () => window.Dialogs.anova());
    $('#btn-copyrep').addEventListener('click', () => copyText(S.report.map(entryText).join('\n\n'), reportDocument()));
    $('#btn-saverep').addEventListener('click', () => saveFile('VarStat report.html', reportDocument(), 'text/html'));
    // drag & drop files
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { try { await openFile(f); } catch (er) { showError(er); } } });
    if (restored) { Reports.setDecimals(S.settings.decimals); renderGrid(); renderReport(); }
    else { renderGrid(); renderReport(); seedExample(); }
    switchTab('data');
    if (window.DesktopBridge) {
      window.DesktopBridge.onMenu((id) => { closeMenus(); const f = window.__menuReg && window.__menuReg[id]; if (f) f(); });
      window.DesktopBridge.onOpenFile(async (f) => { try { await openFile({ name: f.name, arrayBuffer: async () => f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) }); } catch (e) { showError(e); } });
      syncNativeMenus();
      window.DesktopBridge.rendererReady();
    }
  }

  window.App = { S, record, snapshot, helpModels, setLanguage, MENUS, openFile, exportCSV, exportXLSX, reportDocument, entryText, copyText, h, $, dialog, listbox, field, inp, sel, num, nid, varItems, requireData, addEntry, toast, busy, showError, fmt, colNames, numericCols, nRows, setDataset, switchTab, saveFile, renderGrid };
  document.addEventListener('DOMContentLoaded', boot);
})();

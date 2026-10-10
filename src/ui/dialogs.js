/* VarStat — analysis dialogs. */
(function () {
  'use strict';
  const A = window.Anova, R = window.Reports, App = window.App;
  const { h, dialog, listbox, field, inp, sel, num, nid, varItems, requireData, toast, busy, showError, colNames } = App;
  const S = App.S;
  const col = (n) => S.ds.columns.find((c) => c.name === n);
  const quoteName = (v) => (/[\s*()+\-/^\[\]=]/.test(v) ? '[' + v + ']' : v);
  const chk = (label, checked, attrs = {}) => { const c = h('input', { type: 'checkbox', id: nid('c'), checked, ...attrs }); return { el: h('label', { class: 'chk', for: c.id }, c, label), c }; };
  const radioGroup = (name, opts, value, onChange) => {
    const wrap = h('div', { class: 'checks', role: 'radiogroup' });
    opts.forEach(([v, l]) => { const r = h('input', { type: 'radio', name, value: v, id: nid('r'), checked: v === value }); r.addEventListener('change', () => onChange && onChange(v)); wrap.append(h('label', { class: 'chk', for: r.id }, r, l)); });
    wrap.value = () => (wrap.querySelector('input:checked') || {}).value;
    return wrap;
  };
  const ALTS = () => [['two', T('two-sided (≠)')], ['greater', T('greater than (>)')], ['less', T('less than (<)')]];
  const TESTS = () => [['tukey', T('Tukey test')], ['snk', T('Student–Newman–Keuls (SNK) test')], ['bonferroni', T('Bonferroni t test')], ['lsd', T('t test (LSD)')], ['scottknott', T('Scott–Knott test')], ['wallerduncan', T('Waller–Duncan k-ratio t test')], ['contrasts', T('Contrasts')], ['regression', T('Regression analysis')]];
  const TRANSFORMS = () => Object.entries(A.TRANSFORMS).map(([k, v]) => [k, k === 'none' ? T('None') : v.label]);
  const parseNumbers = (txt) => txt.split(/[\s;\n\t]+|,(?=\s)|,$/).map((t) => t.trim()).filter(Boolean).map((t) => window.Data.parseNumber(t, /,/.test(t) && !/\./.test(t))).filter((v) => isFinite(v));

  // =====================================================================
  // ANOVA
  // =====================================================================
  function anova() {
    if (!requireData()) return;
    const st = S.lastAnova && S.lastAnova.dsName === S.dsName ? S.lastAnova : { dsName: S.dsName, terms: [], opts: {}, responses: {} };
    S.lastAnova = st;
    let step = 1, parsed = [];
    const stepsBar = h('div', { class: 'steps' });
    const content = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    const d = dialog({ title: T('Analysis of variance'), body: [stepsBar, content] });
    const go = (n) => {
      if (n > 1 && step === 1 || n > 1 && !parsed.length) { try { parsed = A.parseModel(st.terms, colNames()); if (!parsed.some((t) => t.type === 'effect')) throw new Error(T('Add at least one source of variation that is not an error.')); } catch (e) { showError(e); return; } }
      step = n; render();
    };
    function render() {
      stepsBar.innerHTML = '';
      [[1, T('Model')], [2, T('Tests for each source')], [3, T('Variables and transformations')]].forEach(([n, l]) => stepsBar.append(h('button', { class: step === n ? 'on' : '', onclick: () => go(n) }, h('span', { class: 'n' }, n), l)));
      content.innerHTML = '';
      if (step === 1) renderModel(); else if (step === 2) renderTests(); else renderVars();
      d.setActions([
        h('span', { class: 'left' }, step === 1 ? T('The last error is computed by difference.') : ''),
        step > 1 ? { label: T('Back'), onClick: () => go(step - 1) } : null,
        step < 3 ? { label: T('Next'), primary: true, onClick: () => go(step + 1) } : { label: T('Run analysis'), primary: true, onClick: run },
      ].filter(Boolean));
    }
    function renderModel() {
      const editor = inp({ placeholder: T('e.g. Block, A*B, error=Block*A, Tree(Prov)'), 'aria-label': T('Source of variation') });
      const vars = listbox(varItems(), { onActivate: (v, dbl) => { if (dbl) { st.terms.push(quoteName(v)); editor.value = ''; parsed = []; renderList(); } else { editor.value += quoteName(v); editor.focus(); } } });
      const list = h('div', { class: 'listbox', style: { minHeight: '200px' } });
      const renderList = () => {
        list.innerHTML = '';
        if (!st.terms.length) list.append(h('div', { class: 'empty' }, T('No sources yet. Click a variable, then Add.')));
        st.terms.forEach((t, i) => {
          const isErr = /^(erro|error)\s*=/i.test(t);
          list.append(h('div', { class: 'item' }, h('span', { class: 'pill' + (isErr ? ' err' : '') }, isErr ? T('error') : i + 1), h('span', { class: 'grow mono' }, t),
            h('button', { class: 'btn ghost sm', 'aria-label': T('Move up'), onclick: () => { if (i) { [st.terms[i - 1], st.terms[i]] = [st.terms[i], st.terms[i - 1]]; parsed = []; renderList(); } } }, '↑'),
            h('button', { class: 'btn ghost sm', 'aria-label': T('Move down'), onclick: () => { if (i < st.terms.length - 1) { [st.terms[i + 1], st.terms[i]] = [st.terms[i], st.terms[i + 1]]; parsed = []; renderList(); } } }, '↓'),
            h('button', { class: 'btn ghost sm', 'aria-label': T('Remove'), onclick: () => { st.terms.splice(i, 1); parsed = []; renderList(); } }, '✕')));
        });
      };
      const add = () => { const v = editor.value.trim(); if (!v) return; try { A.parseTerm(v, colNames()); st.terms.push(v); editor.value = ''; parsed = []; renderList(); editor.focus(); } catch (e) { showError(e); } };
      editor.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      const ins = (t) => () => { editor.value += t; editor.focus(); };
      renderList();
      content.append(h('div', { class: 'cols2' },
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Variables in the file (click to insert, double-click to add)')), vars),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Sources of variation, in order')), list, h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { st.terms = []; parsed = []; renderList(); } }, T('Clear')), h('button', { class: 'btn sm', onclick: () => window.App.helpModels && window.App.helpModels() }, T('Model guide'))))),
        h('div', { class: 'field' }, h('label', { for: editor.id }, T('Build a source')), h('div', { class: 'editor-line' }, editor,
          h('button', { class: 'btn opbtn', onclick: ins('*') }, '*'), h('button', { class: 'btn opbtn', onclick: ins('(') }, '('), h('button', { class: 'btn opbtn', onclick: ins(')') }, ')'),
          h('button', { class: 'btn', onclick: () => { const kw = I18N.lang === 'pt' ? 'erro=' : 'error='; editor.value = kw + editor.value; editor.focus(); } }, I18N.lang === 'pt' ? 'erro=' : 'error='), h('button', { class: 'btn primary', onclick: add }, T('Add')))),
        h('div', { class: 'callout' }, T('Examples — blocks: Block, Trt. Split plot: Block, A, error=Block*A, B, A*B. Nested: Tree(Prov).')));
    }
    function renderTests() {
      const nErr = parsed.filter((t) => t.type === 'error').length + 1;
      content.append(h('p', { class: 'note', style: { margin: 0 } }, T('Add up to 7 tests per source. Sources without tests show only their F test.')));
      let errCount = 0;
      parsed.forEach((t, ti) => {
        if (t.type === 'error') { errCount++; return; }
        const testedBy = (() => { const k = parsed.findIndex((x, j) => j > ti && x.type === 'error'); return k >= 0 ? T('Error {0}', parsed.slice(0, k + 1).filter((x) => x.type === 'error').length) : (nErr > 1 ? T('Error {0}', nErr) : T('Error')); })();
        const list = st.opts[ti] || (st.opts[ti] = []);
        const card = h('div', { class: 'src-card' });
        const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
        const draw = () => { body.innerHTML = ''; list.forEach((op, oi) => body.append(optionRow(t, op, () => { list.splice(oi, 1); draw(); }, nErr))); };
        card.append(h('div', { class: 'src-title' }, h('b', null, t.label), h('span', { class: 'pill' }, T('tested by {0}', testedBy)),
          h('button', { class: 'btn sm', style: { marginLeft: 'auto' }, onclick: () => { if (list.length >= 7) return toast(T('At most 7 tests per source.')); list.push({ test: 'tukey', alpha: 0.05, unfold: t.factors[0], regTerms: [1, 2], contrasts: [], kratio: 100, complex: { use: false, b: 1, k: 2, ea: 1, eb: 2 } }); draw(); } }, T('+ Add test'))), body);
        draw();
        content.append(card);
      });
      void errCount;
    }
    function optionRow(t, op, remove, nErr) {
      const multi = t.all.length > 1;
      const testSel = sel(TESTS(), op.test);
      const alpha = inp({ value: String(op.alpha), inputmode: 'decimal', 'aria-label': T('Significance level') });
      const unfold = multi ? sel(t.all.map((f) => [f, f]), op.unfold) : null;
      const extra = h('div', { class: 'opt-extra' });
      const factor = () => (multi ? op.unfold : t.all[0]);
      const drawExtra = () => {
        extra.innerHTML = '';
        if (op.test === 'regression') {
          const c = col(factor());
          if (c && c.type !== 'numeric') extra.append(h('div', { class: 'warning' }, T('{0} is a text variable. Regression needs numeric levels.', factor())));
          const grid = h('div', { class: 'term-grid' });
          A.REG_TERMS.forEach((rt, id) => { if (!rt) return; const k = chk(rt.label, op.regTerms.includes(id)); k.c.addEventListener('change', () => { op.regTerms = k.c.checked ? [...op.regTerms, id].sort((a, b) => a - b) : op.regTerms.filter((x) => x !== id); }); grid.append(k.el); });
          extra.append(h('span', { class: 'lbl' }, T('Terms of the regression model (fitted in this order)')), grid);
        }
        if (op.test === 'contrasts') extra.append(contrastEditor(op, factor()));
        if (op.test === 'wallerduncan') { const kr = inp({ value: String(op.kratio || 100), style: { maxWidth: '120px' } }); kr.addEventListener('input', () => { op.kratio = num(kr); }); extra.append(field(T('k-ratio (100 ≈ 5%, 500 ≈ 1%, 50 ≈ 10%)'), kr)); }
        if (multi && nErr > 1) {
          const cx = chk(T('Use a complex variance (Satterthwaite)'), op.complex.use);
          const fb = inp({ value: String(op.complex.b) }), fk = inp({ value: String(op.complex.k) }), fa = inp({ value: String(op.complex.ea) }), fe = inp({ value: String(op.complex.eb) });
          const upd = () => { op.complex = { use: cx.c.checked, b: num(fb), k: num(fk), ea: Math.round(num(fa)), eb: Math.round(num(fe)) }; grid.hidden = !cx.c.checked; };
          [fb, fk, fa, fe].forEach((x) => x.addEventListener('input', upd)); cx.c.addEventListener('change', upd);
          const grid = h('div', { class: 'row' }, field('b', fb), field('k', fk), field(T('Error a (number)'), fa), field(T('Error b (number)'), fe));
          grid.hidden = !op.complex.use;
          extra.append(cx.el, h('div', { class: 'note' }, 'VC = [MS(error a) + b·MS(error b)] / k'), grid);
        }
      };
      testSel.addEventListener('change', () => { op.test = testSel.value; alphaF.hidden = ['regression', 'contrasts'].includes(op.test); drawExtra(); });
      alpha.addEventListener('input', () => { op.alpha = num(alpha); });
      if (unfold) unfold.addEventListener('change', () => { op.unfold = unfold.value; drawExtra(); });
      const alphaF = field(T('Significance'), alpha); alphaF.hidden = ['regression', 'contrasts'].includes(op.test);
      drawExtra();
      return h('div', { class: 'opt-row' }, field(T('Test'), testSel), alphaF, unfold ? field(T('Compare levels of (unfold)'), unfold) : h('span'), h('button', { class: 'btn ghost sm', onclick: remove, 'aria-label': T('Remove test') }, '✕'), extra);
    }
    function contrastEditor(op, factor) {
      const c = col(factor), levels = c ? A.levelsOf(c.values) : [];
      if (!op.contrasts.length) op.contrasts.push({ name: 'C1', coefs: {} });
      const wrap = h('div', { class: 'field' });
      const draw = () => {
        wrap.innerHTML = '';
        const tbl = h('table', { class: 'res' }, h('thead', null, h('tr', null, h('th', null, T('Level of {0}', factor)), op.contrasts.map((ct, ci) => h('th', null, (() => { const ni = h('input', { value: ct.name, class: 'inp', style: { width: '80px' }, 'aria-label': T('Contrast name') }); ni.addEventListener('input', () => { ct.name = ni.value; }); return h('span', null, ni, h('button', { class: 'btn ghost sm', onclick: () => { op.contrasts.splice(ci, 1); draw(); } }, '✕')); })())))),
          h('tbody', null, levels.map((lv) => h('tr', null, h('td', { class: 'txt' }, String(lv)), op.contrasts.map((ct) => { const ci = h('input', { value: ct.coefs[String(lv)] ?? '', class: 'inp', style: { width: '80px', textAlign: 'right' }, inputmode: 'decimal', 'aria-label': `${ct.name} ${lv}` }); ci.addEventListener('input', () => { ct.coefs[String(lv)] = num(ci) || 0; }); return h('td', null, ci); })))));
        wrap.append(h('span', { class: 'lbl' }, T('Contrast coefficients (each column should sum to zero)')), h('div', { class: 'tbl-wrap' }, tbl), h('div', null, h('button', { class: 'btn sm', onclick: () => { op.contrasts.push({ name: 'C' + (op.contrasts.length + 1), coefs: {} }); draw(); } }, T('+ Add contrast'))));
      };
      draw();
      return wrap;
    }
    function renderVars() {
      const used = new Set(parsed.flatMap((t) => t.all));
      const cands = S.ds.columns.filter((c) => c.type === 'numeric' && !used.has(c.name));
      if (!cands.length) { content.append(h('div', { class: 'warning' }, T('No numeric variables are left to analyse. Every numeric column is used as a source of variation.'))); return; }
      const tbl = h('table', { class: 'res' }, h('thead', null, h('tr', null, h('th', null, T('Analyse')), TRANSFORMS().map(([, l]) => h('th', null, l)))));
      const tb = h('tbody');
      const anyOn = cands.some((c) => st.responses[c.name] && st.responses[c.name].on);
      for (const c of cands) {
        const cur = st.responses[c.name] || (st.responses[c.name] = { on: !anyOn && c === cands[cands.length - 1], tf: ['none'] });
        const on = chk(c.name, cur.on); on.c.addEventListener('change', () => { cur.on = on.c.checked; });
        tb.append(h('tr', null, h('td', { class: 'txt' }, on.el), TRANSFORMS().map(([k, l]) => { const x = h('input', { type: 'checkbox', checked: cur.tf.includes(k), 'aria-label': `${c.name} ${l}` }); x.addEventListener('change', () => { cur.tf = x.checked ? [...new Set([...cur.tf, k])] : cur.tf.filter((y) => y !== k); }); return h('td', { style: { textAlign: 'center' } }, x); })));
      }
      tbl.append(tb);
      content.append(h('p', { class: 'note', style: { margin: 0 } }, T('Tick the response variables to analyse. Each ticked transformation produces a separate analysis.')), h('div', { class: 'tbl-wrap' }, tbl));
    }
    async function run() {
      const resp = Object.entries(st.responses).filter(([n, r]) => r.on && col(n));
      if (!resp.length) return toast(T('Tick at least one response variable.'));
      const ds = App.snapshot(), terms = parsed.slice(), opts = JSON.parse(JSON.stringify(st.opts)), rs = resp.map(([n, r]) => [n, r.tf.length ? r.tf.slice() : ['none']]), dsName = S.dsName;
      await busy(T('Computing…'), () => {
        App.record('Analysis of variance', () => {
          const blocks = [{ type: 'kv', rows: [[T('Model'), terms.map((t) => t.display).join(' + ') + ' + ' + T('Error')], [T('Data'), dsName]] }];
          for (const [name, tfs] of rs) for (const tf of tfs) {
            try { blocks.push(...A.analyze(ds, terms, name, tf, opts, S.settings).blocks); }
            catch (e) { blocks.push({ type: 'heading', level: 2, text: T('Response variable: {0}', name) }, { type: 'warning', text: e.message }); }
          }
          return blocks;
        });
        d.close();
      });
    }
    render();
  }

  // =====================================================================
  // Descriptive statistics
  // =====================================================================
  function descriptive() {
    let mode = S.ds.columns.length ? 'file' : 'typed';
    const vars = listbox(varItems((c) => c.type === 'numeric'), { multi: true });
    const typed = h('textarea', { id: nid('t'), placeholder: T('Type or paste the sample values, separated by spaces or new lines') });
    const by = sel([['', T('(none)')], ...colNames().map((n) => [n, n])], '');
    const from = inp({ placeholder: '1' }), to = inp({ placeholder: String(App.nRows() || '') });
    const alpha = inp({ value: '0.05' });
    const o = {
      freq: chk(T('Frequency distribution'), true), hist: chk(T('Histogram and frequency polygon'), true), normal: chk(T('Overlay the normal curve'), true),
      normality: chk(T('Normality test (Shapiro–Wilk)'), true), pct: chk(T('Percentiles'), false), mean: chk(T('Hypothesis test for the mean'), false), boot: chk(T('Bootstrap estimation of the mean'), false),
    };
    const fm = sel([['scott', T('Scott (1979)')], ['empirical', T('Empirical (√n)')], ['manual', T('Choose the number of classes')]], 'scott'), kman = inp({ value: '7' });
    const pm = sel([[1, T('Method 1 — weighted average at X(np)')], [2, T('Method 2 — observation closest to X(np)')], [3, T('Method 3 — empirical distribution')], [4, T('Method 4 — weighted average at X((n+1)p)')], [5, T('Method 5 — empirical distribution with averaging')]], 5);
    const ps = sel([[5, T('Every 5%')], [2.5, T('Every 2.5%')], [1, T('Every 1%')]], 5);
    const mu0 = inp({ value: '0' }), alt = sel(ALTS(), 'two'), tw = chk(T('Wilcoxon signed-rank test'), true), ts = chk(T('Sign test'), true), B = inp({ value: '2000' });
    const fileBox = h('div', { class: 'cols2' }, h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Variables (select one or more)')), vars), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, field(T('Analyse separately by'), by), h('div', { class: 'row' }, field(T('From row'), from), field(T('To row'), to))));
    const typedBox = field(T('Sample values'), typed);
    const src = radioGroup(nid('src'), [['file', T('Variables in the file')], ['typed', T('Type the values')]], mode, (v) => { mode = v; fileBox.hidden = v !== 'file'; typedBox.hidden = v !== 'typed'; });
    fileBox.hidden = mode !== 'file'; typedBox.hidden = mode !== 'typed';
    dialog({ title: T('Descriptive statistics'), body: [src, fileBox, typedBox,
      h('div', { class: 'row' }, field(T('Significance level (α)'), alpha)),
      h('div', { class: 'cols2' },
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Options')), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, o.freq.el, o.hist.el, o.normal.el, field(T('Number of classes'), fm), field(T('Classes (manual)'), kman), o.normality.el)),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, o.pct.el, h('div', { class: 'row' }, field(T('Method'), pm), field(T('Step'), ps)), o.mean.el, h('div', { class: 'row' }, field('H0: M =', mu0), field(T('Alternative'), alt)), h('div', { class: 'checks' }, tw.el, ts.el), o.boot.el, field(T('Bootstrap resamples'), B)))],
    actions: [{ label: T('Analyse'), primary: true, onClick: (close) => {
      const options = { freq: o.freq.c.checked, hist: o.hist.c.checked, normal: o.normal.c.checked, normality: o.normality.c.checked, freqMethod: fm.value, k: num(kman), percentiles: o.pct.c.checked, pctMethod: +pm.value, pctStep: +ps.value,
        meanTest: o.mean.c.checked ? { mu0: num(mu0) || 0, alt: alt.value, wilcoxon: tw.c.checked, sign: ts.c.checked } : null, bootstrap: o.boot.c.checked, B: Math.max(100, Math.round(num(B)) || 2000) };
      const a = num(alpha) > 0 && num(alpha) < 1 ? num(alpha) : 0.05;
      let args;
      if (mode === 'typed') { const x = parseNumbers(typed.value); if (x.length < 2) return toast(T('Enter at least two numbers.')); args = { typed: { values: x, name: T('Typed sample') }, alpha: a, options }; }
      else { const v = vars.getSelected(); if (!v.length) return toast(T('Select at least one variable.')); args = { vars: v, by: by.value || null, rowFrom: num(from) || null, rowTo: num(to) || null, alpha: a, options }; }
      const ds = App.snapshot(); busy(T('Computing…'), () => { App.record('Descriptive statistics', () => R.descriptive(ds, args)); close(); });
    } }] });
  }

  // =====================================================================
  // Shapiro–Wilk
  // =====================================================================
  function shapiro() {
    let mode = 'sample';
    const v = sel(varItems((c) => c.type === 'numeric').map((x) => [x.value, x.label]), '');
    const typed = h('textarea', { id: nid('t'), placeholder: T('Or type the sample values here') });
    const n1 = inp({ value: '20' }), W = inp({ value: '0.95' }), n2 = inp({ value: '20' });
    const p1 = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, field(T('Variable'), v), field(T('Sample values (optional, replaces the variable)'), typed));
    const p2 = field(T('Sample size n (3 to 5000)'), n1), p3 = h('div', { class: 'row' }, field('W', W), field('n', n2));
    const show = () => { p1.hidden = mode !== 'sample'; p2.hidden = mode !== 'coef'; p3.hidden = mode !== 'prob'; };
    const rg = radioGroup(nid('sw'), [['sample', T('Apply to a sample')], ['coef', T('Compute a(i)')], ['prob', T('Compute the probability of W')]], mode, (m) => { mode = m; show(); });
    show();
    dialog({ title: T('Shapiro–Wilk test'), narrow: true, body: [rg, p1, p2, p3], actions: [{ label: T('Compute'), primary: true, onClick: (close) => {
      try {
        if (mode === 'sample') {
          const x = typed.value.trim() ? parseNumbers(typed.value) : (col(v.value) ? window.Data.numericValues(col(v.value)) : []);
          if (x.length < 3) return toast(T('Shapiro–Wilk needs at least 3 values.'));
          const isTyped = !!typed.value.trim(), vn = v.value; App.record('Shapiro–Wilk test', () => R.swSample(isTyped ? T('Typed sample') : vn, x));
        } else if (mode === 'coef') { const nn = Math.round(num(n1)); App.record('Shapiro–Wilk test', () => R.swCoefs(nn)); }
        else { const w = num(W), nn = Math.round(num(n2)); App.record('Shapiro–Wilk test', () => R.swProb(w, nn)); }
        close();
      } catch (e) { showError(e); }
    } }] });
  }

  // =====================================================================
  // Kernel density
  // =====================================================================
  function kernel() {
    if (!requireData()) return;
    const items = varItems((c) => c.type === 'numeric');
    const v = sel(items.map((x) => [x.value, x.label]), items[0] && items[0].value);
    const k = sel(Object.entries(window.Desc.KERNELS).map(([key, K]) => [key, T(K.label)]), 'gaussian');
    const hc = sel([], 'h2'), hm = inp({ value: '1' }), np = inp({ value: '300' });
    const preview = h('div', { class: 'chart' });
    const xs = () => (col(v.value) ? window.Data.numericValues(col(v.value)) : []);
    const fillH = () => { const x = xs(); hc.innerHTML = ''; if (x.length < 2) return; const bw = window.Desc.bandwidths(x); Object.entries(bw).forEach(([key, b]) => hc.append(h('option', { value: key }, `${T(b.label)} = ${App.fmt(b.v)}`))); hc.append(h('option', { value: 'manual' }, T('Manual h'))); hc.value = 'h2'; };
    const draw = () => {
      const x = xs(); preview.innerHTML = '';
      if (x.length < 2) { preview.append(h('div', { class: 'warning' }, T('The variable needs at least two numeric values.'))); return; }
      const bw = window.Desc.bandwidths(x); const hv = hc.value === 'manual' ? num(hm) : bw[hc.value || 'h2'].v;
      if (!(hv > 0)) return;
      const kd = window.Desc.kde(x, k.value, hv, Math.min(2000, Math.max(20, Math.round(num(np)) || 300)));
      preview.innerHTML = window.Charts.render({ title: T('Kernel density — {0}', v.value), xLabel: v.value, yLabel: T('Density f(x)'), layers: [{ type: 'line', x: kd.x, y: kd.y }] });
    };
    v.addEventListener('change', () => { fillH(); draw(); }); [k, hc].forEach((e) => e.addEventListener('change', draw)); [hm, np].forEach((e) => e.addEventListener('input', draw));
    fillH(); draw();
    dialog({ title: T('Kernel density estimation'), body: [h('div', { class: 'cols3' }, field(T('Variable'), v), field(T('Kernel'), k), field(T('Points'), np)), h('div', { class: 'row' }, field(T('Smoothing parameter (h)'), hc), field(T('Manual h'), hm)), preview],
      actions: [{ label: T('Add to report'), primary: true, onClick: (close) => { const x = xs(); if (x.length < 2) return; const kk = { kernel: k.value, hChoice: hc.value, h: num(hm), npts: Math.round(num(np)) || 300 }, vn = v.value; App.record('Kernel density estimation', () => R.kernelReport(vn, x, kk)); close(); } }] });
  }

  // =====================================================================
  // Probability calculator
  // =====================================================================
  function probability() {
    let dist = 'norm', mode = 'prob';
    const F = { n: inp({ value: '10' }), P: inp({ value: '0.5' }), k: inp({ value: '3' }), y: inp({ value: '4' }), mean: inp({ value: '0' }), variance: inp({ value: '1' }), df: inp({ value: '10' }), ncp: inp({ value: '0' }), v1: inp({ value: '3' }), v2: inp({ value: '12' }), x: inp({ value: '1.96' }), p: inp({ value: '0.05' }) };
    const full = chk(T('Show the complete distribution'), false);
    const fields = h('div', { class: 'row' }), out = h('div', { class: 'result-live', 'aria-live': 'polite' });
    const modeG = h('div');
    const params = () => ({ n: Math.round(num(F.n)), P: num(F.P), k: num(F.k), y: Math.round(num(F.y)), mean: num(F.mean), variance: num(F.variance), df: num(F.df), ncp: num(F.ncp) || 0, v1: num(F.v1), v2: num(F.v2), x: num(F.x), p: num(F.p), mode: mode === 'quantile' ? 'quantile' : 'prob', full: full.c.checked });
    const layout = () => {
      fields.innerHTML = ''; modeG.innerHTML = '';
      const L = { binom: [['n', 'n'], ['P', T('P (probability of success)')], ['y', 'y']], pois: [['k', T('Mean k')], ['y', 'y']], norm: [['mean', T('Mean')], ['variance', T('Variance')]], t: [['df', T('Degrees of freedom')], ['ncp', T('Noncentrality')]], chisq: [['df', T('Degrees of freedom')], ['ncp', T('Noncentrality')]], f: [['v1', T('Numerator DF (v1)')], ['v2', T('Denominator DF (v2)')]] }[dist];
      L.forEach(([key, lab]) => fields.append(field(lab, F[key])));
      if (dist === 'binom' || dist === 'pois') modeG.append(full.el);
      else { modeG.append(radioGroup(nid('pm'), [['prob', T('Probability: P(X > c) for a given c')], ['quantile', T('Quantile: c for a given P(X > c)')]], mode, (m) => { mode = m; layout(); })); fields.append(mode === 'quantile' ? field('p = P(X > c)', F.p) : field('c', F.x)); }
      calc();
    };
    const calc = () => {
      out.innerHTML = '';
      try {
        const blocks = R.probability(dist, params());
        for (const b of blocks) if (b.type === 'kv') for (const [k2, v2] of b.rows) out.append(h('span', null, k2), h('span', null, App.fmt(v2, Number.isInteger(v2) ? 'int' : 'num')));
      } catch (e) { out.append(h('span', null, T('Check the inputs')), h('span', null, e.message)); }
    };
    Object.values(F).forEach((e) => e.addEventListener('input', calc));
    const dsel = radioGroup(nid('pd'), [['binom', T('Binomial')], ['pois', T('Poisson')], ['norm', T('Normal')], ['t', 't'], ['chisq', T('Chi-square')], ['f', 'F']], dist, (v) => { dist = v; layout(); });
    layout();
    dialog({ title: T('Probability calculator'), narrow: true, body: [dsel, modeG, fields, out], actions: [{ label: T('Add to report'), primary: true, onClick: (close) => { try { const pp = params(), dd = dist; App.record('Probability calculator', () => R.probability(dd, pp)); close(); } catch (e) { showError(e); } } }] });
  }

  // =====================================================================
  // Estimation & hypothesis tests (shared input form)
  // =====================================================================
  function statForm(kind) {
    const isTest = kind === 'test';
    let param = 'mean', src = 'keyboard';
    const F = { mean: inp({ value: '10' }), sd: inp({ value: '2' }), n: inp({ value: '20' }), N: inp({ placeholder: T('optional') }), variance: inp({ value: '4' }), cv: inp({ value: '20' }), y: inp({ value: '8' }),
      m1: inp({ value: '12' }), s1: inp({ value: '2' }), n1: inp({ value: '10' }), m2: inp({ value: '10' }), s2: inp({ value: '2.5' }), n2: inp({ value: '12' }),
      mu0: inp({ value: '9' }), p0: inp({ value: '0.5' }), sigma2: inp({ value: '3' }), delta0: inp({ value: '0' }) };
    const alpha = inp({ value: '0.05' }), alt = sel(ALTS(), 'two');
    const numVars = varItems((c) => c.type === 'numeric');
    const v = sel(numVars.map((x) => [x.value, x.label]), numVars[0] && numVars[0].value);
    const cls = sel(colNames().map((n) => [n, n]), (S.ds.columns.find((c) => c.type === 'text') || {}).name);
    const area = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
    const params = isTest ? [['mean', T('Mean')], ['proportion', T('Proportion')], ['variance', T('Variance')], ['diff', T('Difference between two means')]]
      : [['mean', T('Mean')], ['proportion', T('Proportion')], ['variance', T('Variance')], ['sd', T('Standard deviation')], ['cv', T('Coefficient of variation')], ['diff', T('Difference between two means')]];
    const pSel = radioGroup(nid('par'), params, param, (x) => { param = x; draw(); });
    const sSel = radioGroup(nid('src'), [['keyboard', T('Type summary values')], ['file', T('Compute from the data')]], src, (x) => { src = x; draw(); });
    const H0 = { mean: ['mu0', 'H0: μ ='], proportion: ['p0', 'H0: p ='], variance: ['sigma2', 'H0: σ² ='], diff: ['delta0', 'H0: μ1 − μ2 ='] };
    const draw = () => {
      area.innerHTML = '';
      const row = (...fs) => h('div', { class: 'row' }, ...fs);
      if (src === 'file' && param !== 'proportion') {
        if (param === 'diff') area.append(row(field(T('Variable'), v), field(T('Classification variable (2 levels)'), cls)));
        else area.append(row(field(T('Variable'), v)));
      } else {
        if (param === 'mean') area.append(row(field(T('Sample mean (x̄)'), F.mean), field(T('Standard deviation (s)'), F.sd), field(T('Sample size (n)'), F.n), ...(isTest ? [] : [field(T('Population size N'), F.N)])));
        if (param === 'proportion') area.append(row(field(T('Successes (y)'), F.y), field(T('Sample size (n)'), F.n), ...(isTest ? [] : [field(T('Population size N'), F.N)])));
        if (param === 'variance') area.append(row(field(T('Sample variance (s²)'), F.variance), field(T('Sample size (n)'), F.n)));
        if (param === 'sd') area.append(row(field(T('Standard deviation (s)'), F.sd), field(T('Sample size (n)'), F.n)));
        if (param === 'cv') area.append(row(field(T('Coefficient of variation (%)'), F.cv), field(T('Sample size (n)'), F.n)));
        if (param === 'diff') area.append(row(field('x̄1', F.m1), field('s1', F.s1), field('n1', F.n1)), row(field('x̄2', F.m2), field('s2', F.s2), field('n2', F.n2)));
        if (param === 'proportion' && src === 'file') area.append(h('p', { class: 'note' }, T('Proportions are entered as counts.')));
      }
      if (isTest) area.append(row(field(H0[param][1], F[H0[param][0]]), field(T('Alternative hypothesis'), alt)));
      area.append(row(field(isTest ? T('Significance level (α)') : T('α (confidence = 1 − α)'), alpha)));
    };
    draw();
    const collect = () => {
      const o = {}; for (const [k2, e] of Object.entries(F)) o[k2] = num(e);
      if (!(o.N > 0)) delete o.N;
      if (src === 'file' && param !== 'proportion') {
        const c = col(v.value); if (!c) throw new Error(T('Select a variable.'));
        if (param === 'diff') {
          const g = col(cls.value), lv = A.levelsOf(g.values);
          if (lv.length !== 2) throw new Error(T('The classification variable must have exactly 2 levels (it has {0}).', lv.length));
          const part = (L) => c.values.filter((x, i) => typeof x === 'number' && String(g.values[i]) === String(L));
          const a = R.summarize(part(lv[0])), b = R.summarize(part(lv[1]));
          Object.assign(o, { m1: a.mean, s1: a.sd, n1: a.n, m2: b.mean, s2: b.sd, n2: b.n, groupNames: lv });
        } else { const s = R.summarize(window.Data.numericValues(c)); Object.assign(o, s); }
      }
      return o;
    };
    return { pSel, sSel, area, collect, alpha: () => (num(alpha) > 0 && num(alpha) < 1 ? num(alpha) : 0.05), alt: () => alt.value, param: () => param, src: () => src, v, cls };
  }
  function estimation() {
    const f = statForm('ci');
    dialog({ title: T('Estimation (confidence intervals)'), body: [h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Parameter')), f.pSel), h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Data entry')), f.sSel), f.area],
      actions: [{ label: T('Compute'), primary: true, onClick: (close) => { try { const o = f.collect(), par = f.param(), al = f.alpha(), vn = f.v.value, cn = f.cls.value, fromFile = f.src() === 'file' && par !== 'proportion'; App.record('Estimation', () => { const bl = R.estimation(par, o, al); if (o.groupNames) bl.splice(1, 0, { type: 'note', text: T('Group 1 = {0}, group 2 = {1} ({2} by {3}).', o.groupNames[0], o.groupNames[1], vn, cn) }); else if (fromFile) bl.splice(1, 0, { type: 'note', text: T('Variable: {0}', vn) }); return bl; }); close(); } catch (e) { showError(e); } } }] });
  }
  function hypothesis() {
    const f = statForm('test');
    dialog({ title: T('Hypothesis tests'), body: [h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Parameter')), f.pSel), h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Data entry')), f.sSel), f.area],
      actions: [{ label: T('Test'), primary: true, onClick: (close) => { try { const o = f.collect(), par = f.param(), al = f.alpha(), alt = f.alt(), vn = f.v.value, cn = f.cls.value, fromFile = f.src() === 'file' && par !== 'proportion'; App.record('Hypothesis tests', () => { const bl = R.hypothesis(par, o, al, alt); if (o.groupNames) bl.splice(1, 0, { type: 'note', text: T('Group 1 = {0}, group 2 = {1} ({2} by {3}).', o.groupNames[0], o.groupNames[1], vn, cn) }); else if (fromFile) bl.splice(1, 0, { type: 'note', text: T('Variable: {0}', vn) }); return bl; }); close(); } catch (e) { showError(e); } } }] });
  }

  // =====================================================================
  // Regression term builder (regression & model selection)
  // =====================================================================
  function termBuilder(terms) {
    const editor = inp({ placeholder: T('e.g. X1, X1^2, X2*X3, (X2*X3)^0.5'), 'aria-label': T('Regressor') });
    const vars = listbox(varItems((c) => c.type === 'numeric'), { onActivate: (v, dbl) => { if (dbl) { terms.push(quoteName(v)); draw(); } else { editor.value += quoteName(v); editor.focus(); } } });
    const list = h('div', { class: 'listbox', style: { minHeight: '150px' } });
    const draw = () => { list.innerHTML = ''; if (!terms.length) list.append(h('div', { class: 'empty' }, T('No regressors yet.'))); terms.forEach((t, i) => list.append(h('div', { class: 'item' }, h('span', { class: 'pill' }, 'b' + (i + 1)), h('span', { class: 'grow mono' }, t), h('button', { class: 'btn ghost sm', 'aria-label': T('Remove'), onclick: () => { terms.splice(i, 1); draw(); } }, '✕')))); };
    const add = () => { const t = editor.value.trim(); if (!t) return; try { window.Regress.parseExpr(t, colNames()); terms.push(t); editor.value = ''; draw(); } catch (e) { showError(e); } };
    editor.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    draw();
    const ops = ['+', '-', '*', '/', '^', '(', ')'].map((o) => h('button', { class: 'btn opbtn', onclick: () => { editor.value += o; editor.focus(); } }, o));
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('div', { class: 'cols2' }, h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Variables (click to insert, double-click to add)')), vars), h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Regressors in the model')), list, h('div', null, h('button', { class: 'btn sm', onclick: () => { terms.length = 0; draw(); } }, T('Clear'))))),
      h('div', { class: 'field' }, h('label', { for: editor.id }, T('Build a regressor')), h('div', { class: 'editor-line' }, editor, ...ops, h('button', { class: 'btn primary', onclick: add }, T('Add')))));
  }
  function regression() {
    if (!requireData()) return;
    const st = S.lastReg && S.lastReg.dsName === S.dsName ? S.lastReg : (S.lastReg = { dsName: S.dsName, terms: [], y: [] });
    const ys = listbox(varItems((c) => c.type === 'numeric'), { multi: true, selected: st.y });
    const o = { type1: chk(T('Type I sums of squares'), true), type2: chk(T('Type II sums of squares'), true), partialR2: chk(T('Partial and semipartial R²'), false), xtx: chk("X'X", false), xtxi: chk("(X'X)⁻¹", false), predicted: chk(T('Predicted values and residuals (with diagnostics)'), false), standardized: chk(T('Standardized coefficients'), false) };
    const alpha = inp({ value: '0.05' });
    dialog({ title: T('Linear regression'), body: [termBuilder(st.terms), h('div', { class: 'cols2' }, h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Response variables (Y)')), ys), h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Options')), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, ...Object.values(o).map((x) => x.el), field(T('α for confidence intervals'), alpha))))],
      actions: [{ label: T('Fit'), primary: true, onClick: (close) => {
        st.y = ys.getSelected();
        if (!st.terms.length) return toast(T('Add at least one regressor.'));
        if (!st.y.length) return toast(T('Select a response variable.'));
        const opts = Object.fromEntries(Object.entries(o).map(([k, x]) => [k, x.c.checked])); opts.alpha = num(alpha) > 0 && num(alpha) < 1 ? num(alpha) : 0.05;
        const ds = App.snapshot(), terms = st.terms.slice(), ys2 = st.y.slice(); busy(T('Computing…'), () => { try { App.record('Linear regression', () => R.regression(ds, terms, ys2, opts)); close(); } catch (e) { showError(e); } });
      } }] });
  }
  function selection() {
    if (!requireData()) return;
    const st = S.lastSel && S.lastSel.dsName === S.dsName ? S.lastSel : (S.lastSel = { dsName: S.dsName, terms: [] });
    const items = varItems((c) => c.type === 'numeric');
    const y = sel(items.map((x) => [x.value, x.label]), st.y || (items[0] && items[0].value));
    let method = 'stepwise';
    const mg = radioGroup(nid('m'), [['backward', 'Backward'], ['forward', 'Forward'], ['stepwise', 'Stepwise']], method, (m) => { method = m; });
    const ain = inp({ value: '0.15' }), aout = inp({ value: '0.15' });
    dialog({ title: T('Model selection'), body: [field(T('Response variable (Y)'), y), h('span', { class: 'lbl' }, T('Candidate regressors')), termBuilder(st.terms), h('div', { class: 'row' }, h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Method')), mg), field(T('Significance level to enter'), ain), field(T('Significance level to stay'), aout))],
      actions: [{ label: T('Select model'), primary: true, onClick: (close) => {
        st.y = y.value;
        if (st.terms.length < 1) return toast(T('Add candidate regressors.'));
        const ds = App.snapshot(), terms = st.terms.slice(), yy = y.value, so = { method, alphaIn: num(ain) || 0.15, alphaOut: num(aout) || 0.15 }; busy(T('Computing…'), () => { try { App.record('Model selection', () => R.selection(ds, terms, yy, so)); close(); } catch (e) { showError(e); } });
      } }] });
  }

  // =====================================================================
  // Bootstrap multiple comparisons
  // =====================================================================
  function bootstrap() {
    if (!requireData()) return;
    const cls = sel(colNames().map((n) => [n, n]), (S.ds.columns.find((c) => c.type === 'text') || S.ds.columns[0]).name);
    const ys = listbox(varItems((c) => c.type === 'numeric'), { multi: true });
    let method = 'tukey';
    const ctrl = sel([], '');
    const fillCtrl = () => { ctrl.innerHTML = ''; const c = col(cls.value); if (c) A.levelsOf(c.values).forEach((l) => ctrl.append(h('option', { value: String(l) }, String(l)))); };
    cls.addEventListener('change', fillCtrl); fillCtrl();
    const ctrlF = field(T('Control treatment'), ctrl); ctrlF.hidden = true;
    const mg = radioGroup(nid('bm'), [['tukey', 'Tukey'], ['snk', 'SNK'], ['scottknott', 'Scott–Knott'], ['control', T('Comparisons with a control')]], method, (m) => { method = m; ctrlF.hidden = m !== 'control'; });
    const B = inp({ value: '2000' }), alpha = inp({ value: '0.05' });
    dialog({ title: T('Multiple comparisons by bootstrap'), body: [h('div', { class: 'cols2' }, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, field(T('Classification variable (treatments)'), cls), h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Procedure')), mg), ctrlF), h('div', { class: 'field' }, h('span', { class: 'lbl' }, T('Dependent variables')), ys)), h('div', { class: 'row' }, field(T('Bootstrap resamples'), B), field(T('Nominal significance level'), alpha))],
      actions: [{ label: T('Analyse'), primary: true, onClick: (close) => {
        const y = ys.getSelected().filter((n) => n !== cls.value); if (!y.length) return toast(T('Select at least one dependent variable.'));
        const ds = App.snapshot(), cv = cls.value, bo = { method, B: Math.max(200, Math.round(num(B)) || 2000), alpha: num(alpha) > 0 && num(alpha) < 1 ? num(alpha) : 0.05, control: ctrl.value }; busy(T('Resampling…'), () => { try { App.record('Multiple comparisons (bootstrap)', () => R.bootstrapMCP(ds, cv, y, bo)); close(); } catch (e) { showError(e); } });
      } }] });
  }

  // =====================================================================
  // Experimental plans
  // =====================================================================
  function plans() {
    let design = 'rcbd';
    const reps = inp({ value: '4' }), first = inp({ value: '1' }), k = inp({ value: '3' }), lreps = inp({ value: '2' }), lfirst = inp({ value: '1' });
    const plotF = [{ name: 'Trt', levels: 4 }], subF = [];
    const factorEditor = (arr, label, emptyText) => {
      const wrap = h('div', { class: 'field' });
      const draw = () => {
        wrap.innerHTML = '';
        wrap.append(h('span', { class: 'lbl' }, label));
        if (!arr.length) wrap.append(h('div', { class: 'note' }, emptyText));
        arr.forEach((f, i) => { const n = h('input', { class: 'inp', value: f.name, 'aria-label': T('Factor name') }), l = h('input', { class: 'inp', value: String(f.levels), style: { width: '80px' }, inputmode: 'numeric', 'aria-label': T('Number of levels') }); n.addEventListener('input', () => { f.name = n.value.trim(); }); l.addEventListener('input', () => { f.levels = Math.round(num(l)); }); wrap.append(h('div', { class: 'row', style: { alignItems: 'center' } }, n, l, h('span', { class: 'note' }, T('levels')), h('button', { class: 'btn ghost sm', onclick: () => { arr.splice(i, 1); draw(); } }, '✕'))); });
        wrap.append(h('div', null, h('button', { class: 'btn sm', onclick: () => { arr.push({ name: String.fromCharCode(65 + arr.length + (arr === subF ? plotF.length : 0)), levels: 2 }); draw(); } }, T('+ Add factor'))));
      };
      draw(); return wrap;
    };
    const std = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, h('div', { class: 'row' }, field(T('Replicates / blocks'), reps), field(T('First plot number'), first)),
      h('div', { class: 'cols2' }, factorEditor(plotF, T('Factors applied to the plots'), ''), factorEditor(subF, T('Factors applied to the subplots (split plot)'), T('None: no split plot.'))));
    const lat = h('div', { class: 'row' }, field(T('Block size k (k² treatments)'), k), field(T('Replicates r (≤ k + 1)'), lreps), field(T('First plot number'), lfirst));
    const show = () => { std.hidden = design === 'lattice'; lat.hidden = design !== 'lattice'; };
    const dg = radioGroup(nid('pl'), [['crd', T('Completely randomized (CRD)')], ['rcbd', T('Randomized complete blocks (RCBD)')], ['lattice', T('Square lattice')]], design, (x) => { design = x; show(); });
    show();
    const make = () => {
      const p = design === 'lattice' ? { design, k: Math.round(num(k)), reps: Math.round(num(lreps)), firstPlot: Math.round(num(lfirst)) || 1 }
        : { design, reps: Math.round(num(reps)), firstPlot: Math.round(num(first)) || 1, plotFactors: plotF.filter((f) => f.name && f.levels >= 1), subFactors: subF.filter((f) => f.name && f.levels >= 1) };
      if (design !== 'lattice' && (!(p.reps >= 1) || !p.plotFactors.length)) throw new Error(T('Give the number of replicates and at least one factor.'));
      p.seed = Math.floor(Math.random() * 2147483647) + 1;
      p.plotFactors = p.plotFactors && JSON.parse(JSON.stringify(p.plotFactors)); p.subFactors = p.subFactors && JSON.parse(JSON.stringify(p.subFactors));
      const r = R.plan(p); r.p = p; return r;
    };
    dialog({ title: T('Experimental plans'), body: [dg, std, lat, h('p', { class: 'note', style: { margin: 0 } }, T('Each run draws a new randomization.'))],
      actions: [
        { label: T('Add plan to report'), onClick: (close) => { try { const r = make(); App.record('Experimental plans', () => R.plan(r.p).blocks); close(); } catch (e) { showError(e); } } },
        { label: T('Add to report and open as data'), primary: true, onClick: (close) => {
          try {
            const r = make(); App.record('Experimental plans', () => R.plan(r.p).blocks);
            const cols = r.res.cols.map((c) => ({ name: ['Plot', 'Rep', 'Block', 'Subplot', 'Treatment'].includes(c) ? T(c) : c, type: 'numeric', values: r.res.rows.map((x) => x[c]) }));
            cols.push({ name: 'Y', type: 'numeric', values: r.res.rows.map(() => null) });
            App.setDataset({ columns: cols }, T('Field plan'), { silent: true }); App.switchTab('data'); close(); toast(T('Plan opened as data. Type the observations in column Y.'));
          } catch (e) { showError(e); }
        } }] });
  }

  window.Dialogs = { anova, descriptive, shapiro, kernel, probability, estimation, hypothesis, regression, selection, bootstrap, plans };
})();

const { chromium } = require('playwright-core');
const keys = require('/tmp/keys.json');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--headless=new'] });
  for (const lang of ['pt', 'es', 'tl']) {
    const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('file://' + process.cwd() + '/dist/VarStat.html');
    await p.waitForTimeout(500);
    await p.selectOption('#lang', lang);
    await p.waitForTimeout(200);
    // run an analysis set in this language
    await p.evaluate(() => {
      const ex = (f) => Data.parseDelimited(window.EXAMPLES.find((x) => x.file === f).csv);
      App.setDataset(ex('split_plot.csv'), 'split_plot.csv', { silent: true });
      const t = Anova.parseModel(['Block', 'Tillage', 'error=Block*Tillage', 'Cultivar', 'Tillage*Cultivar'], App.colNames());
      const r = Anova.analyze(App.S.ds, t, 'Yield', 'sqrt', { 1: [{ test: 'snk' }], 4: [{ test: 'tukey', unfold: 'Tillage', complex: { use: true, b: 1, k: 2, ea: 1, eb: 2 } }, { test: 'scottknott', unfold: 'Cultivar' }] }, App.S.settings);
      App.addEntry(T('Analysis of variance'), r.blocks);
      App.setDataset(ex('doses.csv'), 'doses.csv', { silent: true });
      const t2 = Anova.parseModel(['Block', 'Dose'], App.colNames());
      App.addEntry(T('Analysis of variance'), Anova.analyze(App.S.ds, t2, 'Yield', 'none', { 1: [{ test: 'regression', regTerms: [1, 2] }, { test: 'contrasts', contrasts: [{ name: 'C1', coefs: { '0': -4, '40': 1, '80': 1, '120': 1, '160': 1 } }] }, { test: 'wallerduncan' }] }, App.S.settings).blocks);
      App.addEntry(T('Descriptive statistics'), Reports.descriptive(ex('iris.csv'), { vars: ['sepal.length'], options: { freq: true, hist: true, normal: true, normality: true, percentiles: true, meanTest: { mu0: 5, wilcoxon: true, sign: true }, bootstrap: true, B: 300 } }));
      App.addEntry('x', Reports.regression(ex('multiple_regression.csv'), ['X1', 'X2'], ['Y'], { type1: true, type2: true, partialR2: true, xtx: true, predicted: true, standardized: true }));
      App.addEntry('x', Reports.estimation('diff', { m1: 10, s1: 2, n1: 10, m2: 8, s2: 3, n2: 12 }, 0.05));
      App.addEntry('x', Reports.hypothesis('proportion', { y: 4, n: 20, p0: 0.3 }, 0.05, 'two'));
      App.addEntry('x', Reports.plan({ design: 'lattice', k: 3, reps: 4 }).blocks);
    });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `test/shots/lang-${lang}.png` });
    for (const d of ['anova', 'descriptive', 'probability', 'estimation', 'plans']) { await p.evaluate((d) => Dialogs[d](), d); await p.waitForTimeout(150); if (d === 'anova' && lang === 'pt') await p.screenshot({ path: 'test/shots/lang-pt-anova.png' }); await p.evaluate(() => document.querySelectorAll('.scrim').forEach((s) => s.remove())); }
    // menus
    const text = await p.evaluate(() => { document.querySelectorAll('.menu').forEach((m) => m.classList.add('open')); return document.body.innerText; });
    const dict = await p.evaluate((l) => I18N.dicts[l], lang);
    const leftovers = keys.filter((k) => k.length > 12 && /[a-z]{4}/.test(k) && !/[{}]/.test(k) && dict[k] && dict[k] !== k && !dict[k].includes(k) && text.includes(k));
    function require_same(k) { return false; }
    console.log(lang, 'errors', JSON.stringify(errs), 'leftovers:', JSON.stringify(leftovers));
    await p.close();
  }
  await b.close();
})();

/* Runs one feature battery against a VarStat build and writes a JSON fingerprint.
   node test/parity.js web <page.html> <out.json>
   node test/parity.js electron <executable> <out.json> [--wine]
   Then compare the JSON files: node test/parity.js compare a.json b.json ... */
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const pw = require('playwright-core');
const XLSX = require('xlsx');
const DATA = path.join(__dirname, '..', 'examples'), SISVAR = '/mnt/user-data/uploads/Sisvar 6.6 (64-bit)/Exemplos/';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

function fixtures(dir) {
  // one table as CSV, decimal-comma TXT, XLSX and ODS, plus real Sisvar .fdt files when a Sisvar install is available
  const Data = require('../src/data.js');
  const ds = Data.parseDelimited(fs.readFileSync(path.join(DATA, 'multiple_regression.csv'), 'utf8'));
  const m = [ds.columns.map((c) => c.name)].concat(ds.columns[0].values.map((_, i) => ds.columns.map((c) => c.values[i])));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(m), 'Sheet1');
  const f = {};
  f['mreg.csv'] = Buffer.from(m.map((r) => r.join(',')).join('\n'));
  f['mreg.txt'] = Buffer.from(m.map((r) => r.map((v) => String(v).replace('.', ',')).join('\t')).join('\r\n'));
  f['mreg.xlsx'] = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  f['mreg.ods'] = XLSX.write(wb, { type: 'buffer', bookType: 'ods' });
  for (const n of ['Arvore.fdt', 'Pimen157.fdt']) if (fs.existsSync(SISVAR + n)) f[n] = fs.readFileSync(SISVAR + n);
  for (const [k, v] of Object.entries(f)) fs.writeFileSync(path.join(dir, k), v);
  return f;
}
const until = async (p, fn, arg, ms = 20000) => { for (let t = 0; t < ms; t += 150) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };
const useEx = (p, file) => p.evaluate((f) => { const e = window.EXAMPLES.find((x) => x.file === f); App.setDataset(Data.parseDelimited(e.csv), e.file, { silent: true }); }, file);
const clickItem = (p, nth, text) => p.locator('.dialog .listbox').nth(nth).locator('.item .grow', { hasText: new RegExp('^' + text + '$') }).first().click();
const addTerms = async (p, ts) => { for (const t of ts) { await p.fill('.dialog .editor-line input', t); await p.keyboard.press('Enter'); } };
const SETUP = {
  descriptive: async (p) => { await useEx(p, 'soil_sample.csv'); await p.evaluate(() => Dialogs.descriptive()); await clickItem(p, 0, 'pH'); },
  regression: async (p) => { await useEx(p, 'multiple_regression.csv'); await p.evaluate(() => Dialogs.regression()); await addTerms(p, ['X1', 'X2', 'X3']); await clickItem(p, 2, 'Y'); },
  selection: async (p) => { await useEx(p, 'multiple_regression.csv'); await p.evaluate(() => Dialogs.selection()); await p.selectOption('.dialog select', 'Y'); await addTerms(p, ['X1', 'X2', 'X3']); },
  bootstrap: async (p) => { await useEx(p, 'crd_diets.csv'); await p.evaluate(() => Dialogs.bootstrap()); await clickItem(p, 0, 'WeightGain'); },
};

async function battery(p, { saveDir, getSaved }) {
  const log = (...a) => console.error('[' + new Date().toISOString().slice(14, 19) + ']', ...a);
  p.setDefaultTimeout(15000);
  const out = { errors: [] };
  p.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_FILE_NOT_FOUND|ERR_FAILED|ERR_TUNNEL/.test(m.text())) out.errors.push('console: ' + m.text()); });
  await until(p, () => !!(window.App && window.Dialogs && window.EXAMPLES), null, 30000);
  // start from a clean profile in English (earlier runs persist language and settings)
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await p.reload();
  await until(p, () => !!(window.App && window.Dialogs && window.EXAMPLES), null, 30000);
  await p.selectOption('#lang', 'en'); await p.waitForTimeout(300);
  await p.evaluate(() => { let s = 12345; Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; });
  out.shell = await p.evaluate(() => (window.DesktopBridge ? 'desktop:' + window.DesktopBridge.platform : 'browser'));
  out.xlsxLoaded = await p.evaluate(() => !!window.XLSX);
  out.examples = await p.evaluate(() => window.EXAMPLES.length);

  log('1. open');
  // 1. open every file type through the app's own reader
  out.open = {};
  const fx = fixtures(saveDir);
  for (const [name, buf] of Object.entries(fx)) {
    out.open[name] = await p.evaluate(async ([name, b64]) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      try { await App.openFile({ name, arrayBuffer: async () => bin.buffer }); } catch (e) { return 'ERROR ' + e.message; }
      const c = App.S.ds.columns; return c.length + ' cols × ' + c[0].values.length + ' rows: ' + c.map((x) => x.name + '(' + x.type + ')').join(', ') + ' | sum=' + c.filter((x) => x.type === 'numeric').map((x) => x.values.reduce((a, v) => a + (+v || 0), 0).toFixed(4)).join(',');
    }, [name, buf.toString('base64')]);
  }

  // 2. every example dataset loads
  out.examplesOK = await p.evaluate(() => window.EXAMPLES.filter((e) => { try { return Data.parseDelimited(e.csv).columns.length > 0; } catch (x) { return false; } }).length);

  log('3. ANOVA');
  // 3. ANOVA through the dialog on the split-plot sample, with Tukey on Tillage
  await p.evaluate(() => { App.S.report = []; App.S.settings.decimals = App.S.settings.decimals; const e = window.EXAMPLES.find((x) => x.file === 'split_plot.csv'); App.setDataset(Data.parseDelimited(e.csv), e.file, { silent: true }); });
  await p.evaluate(() => Dialogs.anova());
  await p.waitForSelector('.dialog');
  for (const t of ['Block', 'Tillage', 'error=Block*Tillage', 'Cultivar', 'Tillage*Cultivar']) { await p.fill('.dialog .editor-line input', t); await p.keyboard.press('Enter'); }
  log('anova model typed');
  await p.click('.dialog .dlg-foot button.primary'); await p.waitForTimeout(200);
  const cards = await p.$$('.dialog .src-card'); await (await cards[1].$('button')).click();
  await p.click('.dialog .dlg-foot button.primary'); await p.waitForTimeout(200);
  await p.click('.dialog .dlg-foot button.primary'); await p.waitForTimeout(2500);

  log('4. every');
  // 4. every other analysis dialog with its defaults
  out.dialogs = {};
  for (const d of ['descriptive', 'shapiro', 'kernel', 'probability', 'estimation', 'hypothesis', 'regression', 'selection', 'bootstrap', 'plans']) {
    log('dialog', d);
    const before = await p.evaluate(() => App.S.report.length);
    if (SETUP[d]) await SETUP[d](p).catch((e) => out.errors.push('setup ' + d + ': ' + e.message.split('\n')[0])); else await p.evaluate((d) => Dialogs[d](), d);
    await p.waitForTimeout(250);
    await p.locator('.dialog .dlg-foot button.primary').last().click({ timeout: 5000 }).catch(() => {});
    await until(p, (n) => App.S.report.length > n || !document.querySelector('.dialog'), before);
    await p.waitForTimeout(300);
    const after = await p.evaluate(() => App.S.report.length);
    out.dialogs[d] = after > before ? 'ok' : 'NO OUTPUT';
    await p.evaluate(() => document.querySelectorAll('.scrim').forEach((s) => s.remove()));
  }
  // report fingerprint per entry (text) and chart count
  const rep = async () => p.evaluate(() => ({ entries: App.S.report.map((e) => App.entryText(e)), charts: document.querySelectorAll('#report svg, #report canvas').length }));
  const en = await rep();
  out.report = { n: en.entries.length, charts: en.charts, hashes: en.entries.map(sha), anovaHead: en.entries[0].slice(0, 400) };

  log('5. languages');
  // 5. languages: report regenerates in each
  out.lang = {};
  for (const l of ['pt', 'es', 'tl', 'en']) {
    await p.selectOption('#lang', l); await p.waitForTimeout(500);
    const r = await rep();
    out.lang[l] = { menu: await p.evaluate(() => App.MENUS().map((m) => m[0]).join(' | ')), hash: sha(r.entries.join('\n')), firstLine: r.entries[0].split('\n').find((x) => x.trim()) };
  }

  log('6. saving');
  // 6. saving: data CSV, data XLSX, report HTML, report text
  out.saves = {};
  const jobs = { csv: () => App.exportCSV(), xlsx: () => App.exportXLSX(), html: () => App.MENUS()[2][1][1][2](), txt: () => App.MENUS()[2][1][2][2]() };
  for (const [k, fn] of Object.entries(jobs)) {
    const got = await getSaved(() => p.evaluate((s) => { const f = { csv: () => App.exportCSV(), xlsx: () => App.exportXLSX(), html: () => App.MENUS()[2][1][1][2](), txt: () => App.MENUS()[2][1][2][2]() }[s]; f(); }, k));
    out.saves[k] = got ? got.name + ' ' + got.size + ' bytes' + (k === 'xlsx' ? ' sheets=' + XLSX.read(got.buf).SheetNames.length : '') : 'NOT SAVED';
    void fn;
  }
  return out;
}

async function web(file, outPath) {
  const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--headless=new'] });
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 860 } });
  // the published page loads SheetJS from jsDelivr; serve the identical npm file locally (the sandbox has no CDN access)
  await ctx.route('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', (r) => r.fulfill({ path: path.join(__dirname, '../node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); // no web access in the test sandbox
  const p = await ctx.newPage();
  let html = fs.readFileSync(file, 'utf8');
  if (!/^<!doctype/i.test(html)) html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + html + '</body></html>';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-')); fs.writeFileSync(path.join(tmp, 'page.html'), html);
  await p.goto('file://' + tmp + '/page.html');
  const res = await battery(p, {
    saveDir: tmp,
    getSaved: async (go) => { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), go()]); if (!d) return null; const fp = path.join(tmp, d.suggestedFilename()); await d.saveAs(fp); const buf = fs.readFileSync(fp); return { name: d.suggestedFilename(), size: buf.length, buf }; },
  });
  fs.writeFileSync(outPath, JSON.stringify(res, null, 1)); await b.close();
}

async function electron(exe, outPath, wine) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-'));
  const opts = { executablePath: exe, args: ['--no-sandbox', '--disable-gpu'], timeout: 120000, env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' } };
  if (wine) { opts.executablePath = 'wine'; opts.args = [exe, ...opts.args]; }
  const app = await pw._electron.launch(opts);
  const p = await app.firstWindow();
  await app.evaluate(({ dialog }, dir) => {
    let n = 0;
    dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: dir + '/' + (++n) + '-' + String(o.defaultPath).split(/[\\/]/).pop() });
  }, tmp);
  const res = await battery(p, {
    saveDir: tmp,
    getSaved: async (go) => {
      const before = new Set(fs.readdirSync(tmp)); await go();
      for (let i = 0; i < 40; i++) { await p.waitForTimeout(200); const nw = fs.readdirSync(tmp).filter((f) => !before.has(f) && /^\d+-/.test(f)); if (nw.length) { await p.waitForTimeout(300); const buf = fs.readFileSync(path.join(tmp, nw[0])); return { name: nw[0].replace(/^\d+-/, ''), size: buf.length, buf }; } }
      return null;
    },
  });
  res.nativeMenu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((i) => i.label).join(' | '));
  fs.writeFileSync(outPath, JSON.stringify(res, null, 1)); await app.close();
}

// An app already running with --remote-debugging-port=9333 --inspect=9229 (used for the Windows .exe under Wine)
async function cdp(outPath, winPaths) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-'));
  const target = winPaths ? 'Z:' + tmp.replace(/\//g, '\\') + '\\' : tmp + '/';
  const list = await (await fetch('http://127.0.0.1:9229/json/list')).json();
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const expr = `(() => { const { dialog } = process.mainModule.require('electron'); let n = 0; dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: ${JSON.stringify(target)} + (++n) + '-' + String(o.defaultPath).split(/[\\\\/]/).pop() }); return 'stubbed'; })()`;
  const reply = new Promise((r) => (ws.onmessage = (m) => r(JSON.parse(m.data))));
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, includeCommandLineAPI: true } }));
  const rr = await reply; if (!rr.result || rr.result.result.value !== 'stubbed') throw new Error('main-process stub failed: ' + JSON.stringify(rr).slice(0, 300));
  const b = await pw.chromium.connectOverCDP('http://127.0.0.1:9333');
  const p = b.contexts()[0].pages()[0];
  const res = await battery(p, {
    saveDir: tmp,
    getSaved: async (go) => {
      const before = new Set(fs.readdirSync(tmp)); await go();
      for (let i = 0; i < 50; i++) { await p.waitForTimeout(200); const nw = fs.readdirSync(tmp).filter((f) => !before.has(f) && /^\d+-/.test(f)); if (nw.length) { await p.waitForTimeout(300); const buf = fs.readFileSync(path.join(tmp, nw[0])); return { name: nw[0].replace(/^\d+-/, ''), size: buf.length, buf }; } }
      return null;
    },
  });
  res.userAgent = await p.evaluate(() => navigator.userAgent);
  fs.writeFileSync(outPath, JSON.stringify(res, null, 1)); ws.close(); await b.close();
}

function compare(files) {
  const rs = files.map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(f, 'utf8'))]);
  const keyRows = [];
  const flat = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flat(v, pre + k + '.') : [[pre + k, Array.isArray(v) ? v.join(',') : String(v)]]));
  const maps = rs.map(([n, r]) => [n, new Map(flat(r))]);
  const keys = [...new Set(maps.flatMap(([, m]) => [...m.keys()]))];
  for (const k of keys) { const vals = maps.map(([, m]) => m.get(k)); const same = vals.every((v) => v === vals[0]); keyRows.push([same ? 'same' : 'DIFF', k, same ? vals[0] : maps.map(([n], i) => n + '=' + vals[i]).join('  ||  ')]); }
  for (const r of keyRows) console.log(r[0].padEnd(5), r[1].padEnd(22), String(r[2]).slice(0, 260));
}

const [mode, a, b, flag] = process.argv.slice(2);
if (mode === 'web') web(a, b).catch((e) => { console.error(e); process.exit(1); });
else if (mode === 'electron') electron(a, b, flag === '--wine').catch((e) => { console.error(e); process.exit(1); });
else if (mode === 'cdp') cdp(a, b === '--windows').catch((e) => { console.error(e); process.exit(1); });
else if (mode === 'compare') compare(process.argv.slice(3));

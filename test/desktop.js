const { _electron } = require('playwright-core');
(async () => {
  const app = await _electron.launch({ executablePath: process.cwd() + '/release/VarStat-linux-x64/varstat', args: ['--no-sandbox', process.cwd() + '/test/data/ST224.csv'] });
  const win = await app.firstWindow();
  const errs = []; win.on('pageerror', (e) => errs.push(e.message)); win.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await win.waitForTimeout(2500);
  console.log('title:', await win.title());
  console.log('dataset:', await win.evaluate(() => App.S.dsName + ' cols=' + App.S.ds.columns.map(c => c.name).join('|')));
  const menu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((i) => i.label + ': ' + i.submenu.items.filter(x => x.type !== 'separator').map((x) => x.label).slice(0, 6).join(' / ')));
  console.log(menu.join('\n'));
  // trigger "Analysis of variance…" via the native menu
  await app.evaluate(({ Menu }) => { const a = Menu.getApplicationMenu().items[2].submenu.items[0]; a.click(); });
  await win.waitForTimeout(400);
  console.log('dialog open:', await win.evaluate(() => !!document.querySelector('.dialog')));
  await win.screenshot({ path: 'test/shots/desktop-anova.png' });
  await win.evaluate(() => document.querySelectorAll('.scrim').forEach(s => s.remove()));
  // language switch updates native menu
  await win.selectOption('#lang', 'pt'); await win.waitForTimeout(400);
  console.log('pt menu:', (await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map(i => i.label))).join(' | '));
  await win.screenshot({ path: 'test/shots/desktop-pt.png' });
  console.log('errors:', JSON.stringify(errs));
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });

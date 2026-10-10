const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--headless=new'] });
  const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + process.cwd() + '/dist/VarStat.html');
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'test/shots/1-start.png' });
  await p.click('.tabs button[data-t=report]').catch(()=>{});
  // ANOVA through UI on Pimen98 split plot
  await p.evaluate(() => { const e = window.EXAMPLES.find(x => x.file === 'Pimen98.csv'); App.setDataset(Data.parseDelimited(e.csv), e.file, { silent: true }); });
  await p.click('#btn-anova');
  await p.waitForSelector('.dialog');
  for (const t of ['Bloco', 'N', 'error=Bloco*N', 'P', 'N*P']) { await p.fill('.dialog .editor-line input', t); await p.keyboard.press('Enter'); }
  await p.screenshot({ path: 'test/shots/2-anova-model.png' });
  await p.click('.dialog .dlg-foot button.primary'); // next
  await p.waitForTimeout(200);
  // add test on N*P (last card)
  const cards = await p.$$('.dialog .src-card');
  await (await cards[cards.length - 1].$('button')).click();
  await p.waitForTimeout(100);
  await p.screenshot({ path: 'test/shots/3-anova-tests.png' });
  await (await cards[1].$('button')).click(); // N: tukey
  await p.click('.dialog .dlg-foot button.primary'); // next
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'test/shots/4-anova-vars.png' });
  await p.click('.dialog .dlg-foot button.primary'); // run
  await p.waitForTimeout(2500);
  await p.screenshot({ path: 'test/shots/5-report.png', fullPage: false });
  const reportText = await p.evaluate(() => document.querySelector('#report').innerText.slice(0, 1500));
  console.log(reportText);
  // open every dialog
  for (const d of ['descriptive', 'shapiro', 'kernel', 'probability', 'estimation', 'hypothesis', 'regression', 'selection', 'bootstrap', 'plans']) {
    await p.evaluate((d) => Dialogs[d](), d); await p.waitForTimeout(250);
    await p.screenshot({ path: `test/shots/d-${d}.png` });
    await p.locator('.dialog .dlg-foot button.primary').last().click({ timeout: 5000 }).catch(e => console.log('click fail', d)); await p.waitForTimeout(1500);
    const still = await p.$('.dialog'); if (still) { const t = await p.evaluate(() => document.querySelector('.toast') && document.querySelector('.toast').textContent); console.log('dialog', d, 'stayed open; toast:', t); await p.evaluate(() => document.querySelectorAll('.scrim').forEach(s => s.remove())); }
  }
  console.log('entries', await p.evaluate(() => App.S.report.length));
  // phone width + dark
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.setViewportSize({ width: 400, height: 800 });
  await p.click('.tabs button[data-t=report]');
  await p.screenshot({ path: 'test/shots/6-phone-dark.png' });
  console.log('ERRORS', errs);
  await b.close();
})();

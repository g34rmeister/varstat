// Run VarStat with the same settings used in Sisvar and print a compact report
require('./load.js'); require('../src/i18n.js');
const Data = require('../src/data.js'), fs = require('fs');
const fdt = (f) => Data.parseFDT(fs.readFileSync('/mnt/user-data/uploads/Sisvar 6.6 (64-bit)/Exemplos/' + f));
const show = (blocks) => { for (const b of blocks) {
  if (b.type === 'heading') console.log('##', b.text);
  if (b.type === 'kv') console.log('  ' + b.rows.map((x) => x[0] + ' = ' + (typeof x[1] === 'number' ? +x[1].toPrecision(10) : x[1])).join(' | '));
  if (b.type === 'table') { if (b.title) console.log('  [' + b.title + ']'); b.rows.forEach((r) => console.log('    ' + r.map((v) => (typeof v === 'number' ? +v.toPrecision(8) : v)).join('  '))); }
  if (b.type === 'warning') console.log('  !!', b.text);
} };
const run = (file, model, y, opts) => { const d = fdt(file); const t = A.parseModel(model, d.columns.map((c) => c.name)); console.log('==========', file); show(A.analyze(d, t, y, 'none', opts, {}).blocks); };
module.exports = { run, fdt, show };
if (require.main === module) {
  const which = process.argv[2];
  if (which === 'pimen98') run('Pimen98.fdt', ['Bloco', 'N', 'erro=Bloco*N', 'P', 'N*P'], 'Produções de milho', { 1: [{ test: 'tukey' }], 4: [{ test: 'tukey', unfold: 'N', complex: { use: true, b: 1, k: 2, ea: 1, eb: 2 } }, { test: 'tukey', unfold: 'P' }] });
}

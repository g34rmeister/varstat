/* Checks VarStat's ANOVA tables on the bundled sample datasets against R (sequential, type I SS).
   node test/examples_R.js   (needs Rscript) */
require('../src/dist.js'); require('../src/linalg.js');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const Data = require('../src/data.js'), A = require('../src/anova.js');
const EX = path.join(__dirname, '..', 'examples');
const cases = [
  { f: 'crd_diets.csv', y: 'WeightGain', m: ['Diet'], r: 'Diet' },
  { f: 'rcbd_cultivars.csv', y: 'Yield', m: ['Block', 'Cultivar'], r: 'Block + Cultivar' },
  { f: 'latin_square.csv', y: 'Yield', m: ['Row', 'Column', 'Treatment'], r: 'Row + Column + Treatment' },
  { f: 'factorial_npk.csv', y: 'Yield', m: ['Block', 'N', 'P', 'K', 'N*P', 'N*K', 'P*K', 'N*P*K'], r: 'Block + N + P + K + N:P + N:K + P:K + N:P:K' },
  { f: 'factorial_blocks.csv', y: 'Biomass', m: ['Block', 'Irrigation', 'Variety', 'Irrigation*Variety'], r: 'Block + Irrigation*Variety' },
  { f: 'split_plot.csv', y: 'Yield', m: ['Block', 'Tillage', 'error=Block*Tillage', 'Cultivar', 'Tillage*Cultivar'], r: 'Block + Tillage + Block:Tillage + Cultivar + Tillage:Cultivar' },
  { f: 'split_plot_time.csv', y: 'Height', m: ['Fertilizer', 'error=Pot(Fertilizer)', 'Day', 'Fertilizer*Day'], r: 'Fertilizer + Fertilizer:Pot + Day + Fertilizer:Day' },
  { f: 'doses.csv', y: 'Yield', m: ['Block', 'Dose'], r: 'Block + Dose' },
  { f: 'augmented_blocks.csv', y: 'Yield', m: ['Rep', 'Block(Rep)', 'Type', 'Entry(Type)'], r: 'Rep + Rep:Block + Type + Type:Entry' },
];
let worst = 0, fails = 0;
for (const c of cases) {
  const d = Data.parseDelimited(fs.readFileSync(path.join(EX, c.f), 'utf8'));
  const fit = A.fitModel(d, A.parseModel(c.m, d.columns.map((x) => x.name)), c.y);
  const js = fit.rows.map((r) => [r.df, r.ss]).concat([[fit.residual.df, fit.residual.ss]]);
  const facs = d.columns.map((x) => x.name).filter((n) => n !== c.y);
  const rcode = `d <- read.csv(${JSON.stringify(path.join(EX, c.f))}, check.names=FALSE); for (v in c(${facs.map((x) => JSON.stringify(x)).join(',')})) d[[v]] <- factor(d[[v]]); a <- anova(lm(terms(${c.y} ~ ${c.r}, keep.order=TRUE), data=d)); cat(paste(a$Df, sprintf('%.12g', a[['Sum Sq']])), sep='\\n')`;
  const rr = execFileSync('Rscript', ['-e', rcode], { encoding: 'utf8' }).trim().split('\n').map((l) => l.split(' ').map(Number));
  let ok = rr.length === js.length;
  for (let i = 0; ok && i < rr.length; i++) {
    const rel = Math.abs(rr[i][1] - js[i][1]) / Math.max(1e-12, Math.abs(rr[i][1]));
    worst = Math.max(worst, rel); if (rr[i][0] !== js[i][0] || rel > 1e-9) ok = false;
  }
  if (!ok) { fails++; console.log('MISMATCH', c.f, '\n  VarStat', JSON.stringify(js), '\n  R      ', JSON.stringify(rr)); } else console.log('ok', c.f, '(' + js.length + ' lines)');
}
console.log(fails ? fails + ' mismatches' : 'all match R; largest relative difference ' + worst.toExponential(1));
process.exit(fails ? 1 : 0);

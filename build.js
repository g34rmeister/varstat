/* Build VarStat: dist/index.html (published page), dist/VarStat.html (offline single file),
   desktop/app/index.html (desktop shell page). */
const fs = require('fs'), path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const EX_DESC = {
  'augmented_blocks.csv': ['Nested / augmented', 'Two check cultivars in every block plus 9 new entries, 3 blocks within each of 2 replicates. Model: Rep, Block(Rep), Type, Entry(Type).'],
  'crd_diets.csv': ['Completely randomized', 'Weight gain of animals on 4 diets with unequal replication. Model: Diet.'],
  'doses.csv': ['Regression on doses', 'Yield for 5 fertilizer doses in 4 blocks. Model: Block, Dose, with a regression test on Dose.'],
  'factorial_blocks.csv': ['Factorial in blocks', 'Biomass for 3 irrigation levels × 4 varieties in 3 blocks. Model: Block, Irrigation, Variety, Irrigation*Variety.'],
  'factorial_npk.csv': ['Factorial', 'Yield in a 2×2×2 N, P, K factorial in 4 blocks. Model: Block, N, P, K, N*P, N*K, P*K, N*P*K.'],
  'iris.csv': ['Groups', "Fisher's iris measurements for 3 species. Try Descriptive statistics by variety or bootstrap comparisons."],
  'latin_square.csv': ['Latin square', '5 treatments in a 5×5 Latin square. Model: Row, Column, Treatment.'],
  'multiple_regression.csv': ['Regression', 'Response Y with three predictors X1–X3 (30 observations). Use Linear regression or Model selection.'],
  'normality.csv': ['Normality', 'A symmetric and a skewed sample of 25 values for normality testing.'],
  'rcbd_cultivars.csv': ['Randomized blocks', 'Yield of 6 cultivars in 4 blocks. Model: Block, Cultivar.'],
  'soil_sample.csv': ['Descriptive', 'Soil pH and clay content of 40 samples. Use Descriptive statistics.'],
  'split_plot.csv': ['Split plot', 'Tillage systems on main plots and 2 cultivars on subplots, 4 blocks. Model: Block, Tillage, error=Block*Tillage, Cultivar, Tillage*Cultivar.'],
  'split_plot_time.csv': ['Split plot in time', 'Plant height for 4 fertilizer rates, 5 pots each, measured on 3 days. Model: Fertilizer, error=Pot(Fertilizer), Day, Fertilizer*Day.'],
  'two_groups.csv': ['Two groups', 'Response of a control and a treated group, 12 each. Use Estimation or Hypothesis tests for the difference of means.'],
};
function examples() {
  const dir = path.join(__dirname, 'examples');
  const list = fs.readdirSync(dir).filter((f) => f.endsWith('.csv')).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const arr = list.map((f) => {
    let buf = fs.readFileSync(path.join(dir, f));
    let txt = buf.toString('utf8');
    if (txt.includes('�')) txt = buf.toString('latin1');
    const [design, desc] = EX_DESC[f] || ['', ''];
    return { file: f, design, desc, csv: txt };
  });
  return 'window.EXAMPLES = ' + JSON.stringify(arr) + ';\n' +
    'window.EXAMPLES.forEach(function(e){ Object.defineProperty(e, "label", { get: function(){ return T(e.design); } }); });\n';
}

const MODULES = ['src/i18n.js', 'src/i18n/en.js', 'src/i18n/pt.js', 'src/i18n/es.js', 'src/i18n/tl.js', 'src/dist.js', 'src/linalg.js', 'src/data.js', 'src/anova.js', 'src/desc.js', 'src/inference.js', 'src/regress.js', 'src/design.js', 'src/reports.js', '@examples', 'src/ui/charts.js', 'src/ui/app.js', 'src/ui/dialogs.js'];
function scripts({ inlineXLSX, desktop }) {
  const xl = inlineXLSX ? `<script>${R('node_modules/xlsx/dist/xlsx.full.min.js').replace(/<\/script/gi, '<\\/script')}</script>` : '<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>';
  const body = MODULES.filter((m) => m === '@examples' || fs.existsSync(path.join(__dirname, m))).map((m) => (m === '@examples' ? examples() : R(m))).join('\n;\n');
  return xl + '\n' + (desktop ? '<script>document.documentElement.dataset.shell = "desktop";</script>\n' : '') + `<script>\n${body.replace(/<\/script/gi, '<\\/script')}\n</script>`;
}
function page(opts) {
  let css = R('src/ui/style.css');
  if (opts.desktop && fs.existsSync(path.join(__dirname, 'src/ui/classic.css'))) css += '\n' + R('src/ui/classic.css');
  return '<!-- VarStat © 2026 Khánh Giang Lê, MIT License. Third-party notices: https://github.com/g34rmeister/varstat/blob/main/NOTICE.md -->\n' + R('src/ui/index.template.html').replace('/*@@CSS@@*/', () => css).replace('<!--@@SCRIPTS@@-->', () => scripts(opts));
}
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/index.html'), page({ inlineXLSX: false }));
const full = (b) => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${b.replace('<title>', '</head><body><title>')}</body></html>`;
// offline: proper document wrapper (the published page gets its skeleton from the host)
const off = page({ inlineXLSX: true });
fs.writeFileSync(path.join(__dirname, 'dist/VarStat.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n${off}\n</html>`);
fs.mkdirSync(path.join(__dirname, 'desktop/app'), { recursive: true });
const desk = page({ inlineXLSX: true, desktop: true }).replace(/<link [^>]*fonts\.(googleapis|gstatic)[^>]*>\n?/g, '');
fs.writeFileSync(path.join(__dirname, 'desktop/app/index.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:">\n${desk}\n</html>`);
void full;
console.log('built', ['dist/index.html', 'dist/VarStat.html', 'desktop/app/index.html'].map((f) => f + ' ' + (fs.statSync(path.join(__dirname, f)).size / 1024).toFixed(0) + 'KB').join(', '));

/* Build VarStat: dist/index.html (published page), dist/VarStat.html (offline single file),
   desktop/app/index.html (desktop shell page). */
const fs = require('fs'), path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const EX_DESC = {
  'Arvore.csv': ['Regression', 'Volume (Y) of 10 trees with three predictors X1–X3. Use Linear regression.'],
  'Erodibilidade.csv': ['Descriptive', 'Soil erodibility factor K, one sample of 22 values. Use Descriptive statistics.'],
  'Nitrogenio.csv': ['Split plot in time', 'Plant height for 5 nitrogen doses measured on 3 dates, 20 replicates. Model: Dose, error=Rep(Dose), Dias, Dose*Dias.'],
  'PastagemCapoeiraNova.csv': ['Two groups', 'Soil Ca, Mg and SB under two land uses (SUT). Use Estimation or Hypothesis tests for the difference of means.'],
  'Pimen157.csv': ['Split plot in time', '8 varieties in 4 blocks harvested in 2 years. Model: Bloco, Variedade, error=Bloco*Variedade, anos, error=Bloco*anos, Variedade*anos.'],
  'Pimen230.csv': ['Regression on doses', 'Maize yield for 5 fertilizer doses in 4 blocks. Model: Blocos, [Adubação kg/parcela] with a regression test.'],
  'Pimen57.csv': ['Randomized blocks', 'Yield (t/ha) of 8 varieties in 4 blocks. Model: Bloco, Variedades.'],
  'Pimen98.csv': ['Factorial', 'Maize yield in a 2×2×2 N, P, K factorial in 4 blocks. Model: Bloco, N, P, K, N*P, N*K, P*K, N*P*K.'],
  'ST224.csv': ['Latin square', 'Wheat cultivars in a 4×4 Latin square. Model: Row, Column, [Cultivares de trigo].'],
  'St319.csv': ['Regression', 'Response Y with predictors Nit, Chlorine and K (30 observations). Use Linear regression or Model selection.'],
  'St369.csv': ['Factorial in blocks', 'Quack-grass roots: waiting days × maleic hydrazide doses in 4 blocks.'],
  'capoeiranova.csv': ['Descriptive', 'Sand and clay content of 30 soil samples.'],
  'diffduasmedias.csv': ['Two groups', 'Productivity of two treatments. Use Estimation or Hypothesis tests for the difference of means.'],
  'exemploartigo.csv': ['Nested / augmented', 'Treatments and checks in incomplete blocks within replicates. Model: rep, bloc(rep), tipo, trat(tipo).'],
  'hematology.csv': ['Descriptive', 'Six hematology measurements on 103 people.'],
  'iris.csv': ['Groups', "Fisher's iris measurements for 3 species. Try Descriptive statistics by variety or bootstrap comparisons."],
  'milho.csv': ['Completely randomized', 'Two responses for maize varieties with unequal replication. Model: Varieties.'],
  'pastagemamazonia.csv': ['Descriptive', 'Soil Ca, Mg and SB in Amazon pastures.'],
  'phlorizin.csv': ['Two groups', 'Glucose and blood flow, control vs. phlorizin.'],
  'pimen43.csv': ['Completely randomized', 'Weight gain for 4 rations with 5 replicates. Model: racoes.'],
  'roystonPintores.csv': ['Normality', 'Two samples (X1, X2) for normality testing.'],
};
function examples() {
  const dir = path.join(__dirname, 'test/data');
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
  return R('src/ui/index.template.html').replace('/*@@CSS@@*/', () => css).replace('<!--@@SCRIPTS@@-->', () => scripts(opts));
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

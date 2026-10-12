const { packager } = require('@electron/packager');
const path = require('path');
const targets = process.argv.slice(2);
(async () => {
  for (const t of targets) {
    const [platform, arch] = t.split('-');
    const opts = {
      dir: path.join(__dirname), out: path.join(__dirname, '..', 'release'), overwrite: true,
      name: 'VarStat', executableName: platform === 'linux' ? 'varstat' : 'VarStat', appBundleId: 'app.varstat.desktop', appCategoryType: 'public.app-category.education',
      electronVersion: '31.7.7', platform, arch, asar: true, prune: false,
      ignore: [/^\/build($|\/)/, /^\/pack\.js$/, /^\/node_modules($|\/)/],
      appCopyright: '© 2026 Khánh Giang Lê. MIT License.', appVersion: require('./package.json').version,
      extendInfo: { CFBundleDocumentTypes: [{ CFBundleTypeName: 'Data file', CFBundleTypeRole: 'Viewer', LSHandlerRank: 'Alternate', CFBundleTypeExtensions: ['csv', 'txt', 'tsv', 'xlsx', 'xls', 'ods', 'fdt'] }], LSMinimumSystemVersion: '10.15' },
    };
    if (platform === 'darwin') opts.icon = path.join(__dirname, 'build', 'icon.icns');
    if (platform === 'win32') {
      if (process.platform === 'win32') opts.icon = path.join(__dirname, 'build', 'icon.ico'); // rcedit needs Windows (or Wine)
      else { delete opts.appCopyright; delete opts.appVersion; }
    }
    if (platform === 'linux') opts.icon = path.join(__dirname, 'build', 'icon.png');
    const out = await packager(opts);
    console.log(t, '->', out.join(', '));
  }
})().catch((e) => { console.error(e); process.exit(1); });

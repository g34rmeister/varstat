# VarStat

English, cross-platform rebuild of the Sisvar statistics program (D. F. Ferreira, DES/UFLA),
with the interface and reports in English, Português, Español and Tagalog.

## Layout
- `src/` statistics engine (pure JS, also runs in Node): `dist.js` (distributions incl. studentized range),
  `anova.js`, `desc.js`, `inference.js`, `regress.js`, `design.js`, `reports.js`, `data.js`
- `src/ui/` interface (`app.js`, `dialogs.js`, `charts.js`, `style.css`, `classic.css`)
- `src/i18n/` dictionaries (generated from `i18n_src/*.json` by `tools_merge.py`)
- `desktop/` Electron shell (`main.js`, `preload.js`, `pack.js`)
- `test/` checks against R and SAS, browser and desktop smoke tests

## Build
    npm install
    node build.js                      # dist/index.html, dist/VarStat.html (offline), desktop/app/index.html
    cd desktop && node pack.js darwin-arm64 darwin-x64 win32-x64 linux-x64

To add a translatable string, wrap it in `T('…')`, run `python3 tools_extract.py`, add the
translation to `i18n_src/<lang>.json`, then run `python3 tools_merge.py pt es tl`.

For a notarized macOS build (no Gatekeeper prompt), sign `release/VarStat-darwin-*/VarStat.app`
with a Developer ID certificate and notarize it on a Mac.

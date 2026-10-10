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

## Checked against Sisvar 6.6
Run in Sisvar 6.6 (64-bit) and in VarStat on the same example files:

| Example | Design | Result |
|---|---|---|
| Pimen57 | Randomized blocks; Tukey, SNK, Bonferroni, LSD, Scott–Knott, Waller–Duncan | ANOVA identical; all groupings identical |
| Pimen98 | Split plot with unfolded interaction | Identical, including the complex-variance MSD |
| Pimen157 | Split plot in time, three error terms | ANOVA, CVs, Scott–Knott and Tukey groupings identical |
| Pimen230 | Regression on doses | Estimates, SEs, t, p, R² identical |
| ST224 | Latin square | Identical |
| milho | Unequal replication | Identical (harmonic r = 5.4545) |
| exemploartigo | Nested `trat(tipo)` | Sisvar gives a negative error SS; VarStat matches R |

Sisvar approximates the studentized range (Tukey and SNK) and the Waller–Duncan t, so some
critical values differ from VarStat after the 4th or 5th significant digit. VarStat's values
match R (`qtukey`) and SAS.
`test/vs_sisvar.js` reproduces the VarStat side.

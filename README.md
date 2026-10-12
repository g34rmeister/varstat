# VarStat

Cross-platform statistics app for designed experiments that follows the methods of Sisvar
(D. F. Ferreira, DES/UFLA), with the interface and reports in English, Português, Español and Tagalog.
VarStat is an independent program and is not affiliated with or endorsed by Sisvar's author or UFLA.

Download the apps for macOS, Windows and Linux from [Releases](https://github.com/g34rmeister/varstat/releases),
or use `VarStat.html` from a release in any browser.

## Layout
- `src/` statistics engine (pure JS, also runs in Node): `dist.js` (distributions incl. studentized range),
  `anova.js`, `desc.js`, `inference.js`, `regress.js`, `design.js`, `reports.js`, `data.js`
- `src/ui/` interface (`app.js`, `dialogs.js`, `charts.js`, `style.css`, `classic.css`)
- `src/i18n/` dictionaries (generated from `i18n_src/*.json` by `tools_merge.py`)
- `desktop/` Electron shell (`main.js`, `preload.js`, `pack.js`)
- `examples/` sample datasets (simulated by `tools_examples.py`, plus Fisher's iris data)
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
Run in Sisvar 6.6 (64-bit) and in VarStat on the example files that come with Sisvar
(those files are not included here; copy them into `test/sisvar-data/` to rerun `test/anova_cases.js`, `test/split.js` and `test/vs_sisvar.js`):

| Example | Design | Result |
|---|---|---|
| Pimen57 | Randomized blocks; Tukey, SNK, Bonferroni, LSD, Scott–Knott, Waller–Duncan | ANOVA identical; all groupings identical |
| Pimen98 | Split plot with unfolded interaction | Identical, including the complex-variance MSD |
| Pimen157 | Split plot in time, three error terms | ANOVA, CVs, Scott–Knott and Tukey groupings identical |
| Pimen230 | Regression on doses | Estimates, SEs, t, p, R² identical |
| ST224 | Latin square | Identical |
| milho | Unequal replication | Identical (harmonic r = 5.4545) |
| exemploartigo | Nested `trat(tipo)` | Sisvar 6.6 reports a negative error sum of squares for this model; VarStat's table matches R |

Sisvar approximates the studentized range (Tukey and SNK) and the Waller–Duncan t, so some
critical values differ from VarStat after the 4th or 5th significant digit. VarStat's values
match R (`qtukey`) and SAS.


## Same results in every build
`test/parity.js` runs one battery (6 file types, 21 examples, 11 analyses, 4 languages, 4 save formats)
against the web page, the offline HTML, the Linux app and the Windows .exe (under Wine), and compares the outputs.

## Tests
    node test/examples_R.js      # ANOVA on every sample design vs R (needs Rscript)
    node test/parity.js web dist/VarStat.html out.json   # one feature battery; see the file header

## License
MIT — see `LICENSE`. Acknowledgements and third-party notices are in `NOTICE.md`.

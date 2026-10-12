VarStat 1.1.0 — cross-platform statistics for designed experiments, following the methods of Sisvar, in English, Português, Español and Tagalog.

## What's new in 1.1.0
- New sample datasets made for VarStat (File → Open example…): 13 designs from completely randomized to augmented blocks, each checked against R.
- VarStat is now open source under the MIT License. See `VarStat-LICENSE.txt` and `VarStat-NOTICE.md` in the download.

## What's new in 1.0.2
- Fixed: a bootstrap multiple-comparisons result in the report no longer breaks when you switch the language.
- The web page, the offline HTML file, and the Windows and Linux apps were checked against each other with one automated test (`test/parity.js`): same results for every file type, analysis, language and save option.

## What's new in 1.0.1
- Sisvar data files (`.fdt`) now open correctly: all ten Sisvar example files load identically to their CSV versions (text columns, accents and numeric columns).
- Results checked side by side against Sisvar 6.6 on six example analyses; see the README.

## Downloads
| System | File |
|---|---|
| Mac with Apple Silicon (M1–M4) | `VarStat-mac-apple-silicon.zip` |
| Mac with Intel processor | `VarStat-mac-intel.zip` |
| Windows 10/11 (64-bit) | `VarStat-windows-x64.zip` |
| Linux (x64) | `VarStat-linux-x64.tar.gz` |
| Any browser, no install (works offline) | `VarStat.html` |

**Mac:** unzip, drag VarStat.app to Applications, then the first time right-click it and choose **Open** (on macOS 15+: System Settings → Privacy & Security → **Open Anyway**). The app is not signed with an Apple developer certificate, so macOS asks once.
**Windows:** extract the zip and run `VarStat.exe`; if SmartScreen appears, click **More info → Run anyway**.

Methods follow Sisvar by Prof. Daniel Furtado Ferreira (DES/UFLA). VarStat is an independent program, not affiliated with or endorsed by its author or UFLA.

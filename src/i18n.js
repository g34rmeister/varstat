/* VarStat — localization. Keys are the English source strings; {0}, {1}… are placeholders. */
(function (root) {
  'use strict';
  const LANGS = [['en', 'English'], ['pt', 'Português'], ['es', 'Español'], ['tl', 'Tagalog']];
  const dicts = { en: {}, pt: {}, es: {}, tl: {} };
  let lang = 'en';
  const fill = (s, a) => s.replace(/\{(\d+)\}/g, (m, i) => (a[i] !== undefined ? a[i] : m));
  const I18N = {
    LANGS,
    get lang() { return lang; },
    setLang(l) { if (dicts[l]) lang = l; },
    add(l, d) { Object.assign(dicts[l] || (dicts[l] = {}), d); },
    t(s, ...a) { const tr = (dicts[lang] && dicts[lang][s]) || dicts.en[s]; return fill(tr || s, a); },
    has(l, s) { return !!(dicts[l] && dicts[l][s]); },
    dicts,
  };
  root.I18N = I18N;
  root.T = (s, ...a) => I18N.t(s, ...a);
  if (typeof module !== 'undefined' && module.exports) module.exports = I18N;
})(typeof globalThis !== 'undefined' ? globalThis : this);

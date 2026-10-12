/* VarStat — dataset model, delimited-text import/export, FireDAC (.fdt) reader. */
(function (root) {
  'use strict';

  const T = (s, ...a) => (root.I18N ? root.I18N.t(s, ...a) : s.replace(/\{(\d+)\}/g, (m, i) => a[i]));
  function parseNumber(s, decimalComma) {
    if (typeof s === 'number') return s;
    if (s === null || s === undefined) return NaN;
    let t = String(s).trim();
    if (!t) return NaN;
    if (decimalComma) t = t.replace(/\./g, '').replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN;
    return Number(t);
  }

  function splitLine(line, delim) {
    const out = []; let cur = '', inQ = false, quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') { inQ = true; quoted = true; }
      else if (delim === ' ' ? /\s/.test(ch) : ch === delim) {
        if (delim === ' ') { if (cur !== '' || quoted) { out.push(cur); } cur = ''; quoted = false; while (i + 1 < line.length && /\s/.test(line[i + 1])) i++; }
        else { out.push(cur); cur = ''; quoted = false; }
      } else cur += ch;
    }
    if (delim !== ' ' || cur !== '' || quoted) out.push(cur);
    return out;
  }

  function splitRecords(text) {
    // split on newlines not inside quotes
    const recs = []; let cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') inQ = !inQ;
      if (!inQ && (ch === '\n' || ch === '\r')) { if (ch === '\r' && text[i + 1] === '\n') i++; recs.push(cur); cur = ''; }
      else cur += ch;
    }
    if (cur.length) recs.push(cur);
    return recs.filter((r) => r.trim().length);
  }

  function sniffDelimiter(lines) {
    const cands = ['\t', ';', ','];
    const sample = lines.slice(0, 20);
    let best = null, bestScore = 0;
    for (const d of cands) {
      const counts = sample.map((l) => splitLine(l, d).length);
      const c0 = counts[0];
      if (c0 < 2) continue;
      const consistent = counts.filter((c) => c === c0).length / counts.length;
      const score = consistent * 10 + c0;
      if (consistent > 0.8 && score > bestScore) { best = d; bestScore = score; }
    }
    if (best) return best;
    // whitespace-separated?
    const counts = sample.map((l) => splitLine(l.trim(), ' ').length);
    if (counts[0] > 1 && counts.every((c) => c === counts[0])) return ' ';
    // single column file (possibly with decimal commas)
    if (sample.every((l) => splitLine(l, ',').length <= 2 && !l.includes(';') && !l.includes('\t'))) return '\u0000';
    return ',';
  }

  function buildColumns(header, rows, decimalComma) {
    const cols = header.map((h, j) => {
      const raw = rows.map((r) => (r[j] === undefined ? '' : r[j]));
      return makeColumn(h, raw, decimalComma);
    });
    return cols;
  }
  function makeColumn(name, raw, decimalComma) {
    const nonEmpty = raw.filter((v) => v !== '' && v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '.' && String(v).trim().toUpperCase() !== 'NA');
    let numeric = nonEmpty.length > 0 && nonEmpty.every((v) => isFinite(parseNumber(v, decimalComma)));
    let dc = decimalComma;
    if (!numeric && !decimalComma && nonEmpty.length && nonEmpty.every((v) => isFinite(parseNumber(v, true)) && /,/.test(String(v)) || isFinite(parseNumber(v, false)))) { numeric = true; dc = true; }
    const values = raw.map((v) => {
      const s = v === null || v === undefined ? '' : String(v).trim();
      if (s === '' || s === '.' || s.toUpperCase() === 'NA') return null;
      if (numeric) { const n = parseNumber(s, dc && /,/.test(s) ? true : false); return isFinite(n) ? n : parseNumber(s, dc); }
      return s;
    });
    return { name: String(name).trim() || 'V', type: numeric ? 'numeric' : 'text', values };
  }

  function uniqueNames(cols) {
    const seen = new Map();
    cols.forEach((c, i) => {
      let n = c.name || 'V' + (i + 1);
      const base = n; let k = 2;
      while (seen.has(n)) n = base + '_' + k++;
      seen.set(n, 1); c.name = n;
    });
    return cols;
  }

  function parseDelimited(text, opts = {}) {
    text = text.replace(/^﻿/, '');
    const lines = splitRecords(text);
    if (!lines.length) throw new Error(T('The file is empty.'));
    const delim = opts.delimiter || sniffDelimiter(lines);
    const split = (l) => splitLine(delim === ' ' ? l.trim() : l, delim);
    const header = split(lines[0]).map((h) => h.trim());
    const rows = lines.slice(1).map(split);
    let decimalComma = opts.decimalComma;
    if (decimalComma === undefined) {
      // decimal comma if delimiter isn't comma and comma-decimals appear
      decimalComma = delim !== ',' && rows.some((r) => r.some((v) => /^\s*[-+]?\d+,\d+\s*$/.test(v)));
    }
    const width = Math.max(header.length, ...rows.map((r) => r.length));
    while (header.length < width) header.push('V' + (header.length + 1));
    return { columns: uniqueNames(buildColumns(header, rows, decimalComma)), meta: { delimiter: delim, decimalComma } };
  }

  // rows of arrays (e.g. from a spreadsheet): first row = names
  function fromMatrix(matrix) {
    const m = matrix.filter((r) => r && r.some((v) => v !== null && v !== undefined && String(v).trim() !== ''));
    if (!m.length) throw new Error(T('The sheet is empty.'));
    const header = m[0].map((h, i) => (h === null || h === undefined || h === '' ? 'V' + (i + 1) : String(h)));
    const width = Math.max(header.length, ...m.map((r) => r.length));
    while (header.length < width) header.push('V' + (header.length + 1));
    const cols = header.map((h, j) => {
      const raw = m.slice(1).map((r) => r[j]);
      const allNum = raw.every((v) => v === null || v === undefined || v === '' || typeof v === 'number' || isFinite(parseNumber(v, false)) || isFinite(parseNumber(v, true)));
      if (allNum && raw.some((v) => v !== null && v !== undefined && v !== '')) {
        return { name: h.trim(), type: 'numeric', values: raw.map((v) => (v === null || v === undefined || v === '' ? null : typeof v === 'number' ? v : (isFinite(parseNumber(v, false)) ? parseNumber(v, false) : parseNumber(v, true)))) };
      }
      return { name: h.trim(), type: 'text', values: raw.map((v) => (v === null || v === undefined || v === '' ? null : String(v))) };
    });
    return { columns: uniqueNames(cols) };
  }

  function toCSV(ds, { delimiter = ',', decimalComma = false } = {}) {
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      let s = typeof v === 'number' ? String(v) : String(v);
      if (typeof v === 'number' && decimalComma) s = s.replace('.', ',');
      if (s.includes(delimiter) || s.includes('"') || /[\r\n]/.test(s) || (typeof v !== 'number' && /^\s|\s$/.test(s))) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const n = nRows(ds);
    const lines = [ds.columns.map((c) => esc(c.name)).join(delimiter)];
    for (let i = 0; i < n; i++) lines.push(ds.columns.map((c) => esc(c.values[i])).join(delimiter));
    return lines.join('\r\n') + '\r\n';
  }
  const nRows = (ds) => Math.max(0, ...ds.columns.map((c) => c.values.length));

  /* ---------- FireDAC binary dataset (.fdt, "ADBS" signature) ----------
     Structure (from Sisvar's files): a tagged stream whose tag numbers and type
     codes are assigned per file. Column definitions appear as FF <tag> 04 00
     followed by a byte-length-prefixed UTF-16 name. Each row is
     FF <a> <b> 00 <u32 row number> FF <c>, then (u16 column, value) pairs ending
     with FE FE. A value is an 8-byte double or a u32-length-prefixed string
     (ANSI or UTF-16). Missing cells are simply absent. Value kinds are inferred
     from the row bytes because type codes differ between files. */
  function parseFDT(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const n = u8.length;
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'ADBS') throw new Error(T('Not a FireDAC binary file (.fdt).'));
    const u16 = (i) => (i + 1 < n ? dv.getUint16(i, true) : -1), u32 = (i) => (i + 3 < n ? dv.getUint32(i, true) : -1);
    const utf16 = (at, bytes) => { let s = ''; for (let k = 0; k + 1 < bytes; k += 2) s += String.fromCharCode(u16(at + k)); return s; };
    // 1) column definitions
    const found = [];
    for (let p = 8; p < n - 8; p++) {
      if (u8[p] !== 0xFF || (u8[p + 2] !== 0x04 && u8[p + 2] !== 0x05) || u8[p + 3] !== 0x00) continue; // name or display-name attribute
      const L = u32(p + 4);
      if (!(L > 0 && L < 1024 && L % 2 === 0 && p + 8 + L <= n)) continue;
      const name = utf16(p + 8, L);
      if (!/^[^\u0000-\u001f]+$/.test(name)) continue;
      found.push({ tag: u8[p + 1], name, end: p + 8 + L });
    }
    const counts = {}; found.forEach((f) => (counts[f.tag] = (counts[f.tag] || 0) + 1));
    const colTag = +Object.keys(counts).sort((x, y) => counts[y] - counts[x] || (found.find((f) => f.tag == x).name === '_FD_TAB') - (found.find((f) => f.tag == y).name === '_FD_TAB'))[0];
    const cols = found.filter((f) => f.tag === colTag && f.name !== '_FD_TAB');
    if (!cols.length) throw new Error(T('No columns found in .fdt file.'));
    const ncol = cols.length;
    // 2) locate the first row: FF a b 00 00000000 FF c   (row number 0)
    let start = -1, a = 0, b = 0, c = 0;
    for (let p = cols[ncol - 1].end; p < n - 10; p++) {
      if (u8[p] === 0xFF && u8[p + 3] === 0 && u32(p + 4) === 0 && u8[p + 8] === 0xFF) { start = p; a = u8[p + 1]; b = u8[p + 2]; c = u8[p + 9]; break; }
    }
    const rows = [];
    if (start < 0) return { columns: cols.map((col) => ({ name: col.name, type: 'numeric', values: [] })) };
    const kind = new Array(ncol).fill(null); // 'num' | 'ansi' | 'wide'
    const validNext = (i) => i >= n || u8[i] === 0xFE || (u16(i) >= 0 && u16(i) < ncol);
    const tryStr = (i) => {
      const L = u32(i);
      if (!(L >= 0 && L < 100000 && i + 4 + L <= n)) return null;
      const bytes = u8.subarray(i + 4, i + 4 + L);
      if (!validNext(i + 4 + L)) return null;
      const wide = L % 2 === 0 && L > 0 && bytes.every((v, k) => (k % 2 ? v === 0 : v !== 0));
      if (!wide && !bytes.every((v) => v >= 0x20 || v === 9)) return null;
      return { kind: wide ? 'wide' : 'ansi', len: 4 + L, value: wide ? utf16(i + 4, L) : decodeAnsi(bytes) };
    };
    let p = start;
    while (p < n - 9 && u8[p] === 0xFF && u8[p + 1] === a && u8[p + 2] === b) {
      p += 8;
      if (u8[p] !== 0xFF || u8[p + 1] !== c) break;
      p += 2;
      const row = new Array(ncol).fill(null);
      while (p < n && u8[p] !== 0xFE) {
        const ci = u16(p); p += 2;
        if (!(ci >= 0 && ci < ncol)) { p = n; break; }
        let k = kind[ci], took = false;
        if (k !== 'num') {
          const st = tryStr(p);
          if (st && (k || ((!validNext(p + 8) || /[A-Za-z]/.test(st.value)) && st.len > 4))) { row[ci] = st.value; p += st.len; kind[ci] = st.kind; took = true; }
        }
        if (!took) { row[ci] = dv.getFloat64(p, true); p += 8; kind[ci] = 'num'; }
      }
      rows.push(row);
      while (p < n && u8[p] === 0xFE) p++;
    }
    const columns = cols.map((col, j) => {
      const text = kind[j] === 'ansi' || kind[j] === 'wide';
      return { name: col.name, type: text ? 'text' : 'numeric', values: rows.map((r) => (r[j] === null || r[j] === undefined ? null : text ? String(r[j]) : r[j])) };
    });
    return { columns: uniqueNames(columns) };
  }
  const CP1252 = { 0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178 };
  const decodeAnsi = (bytes) => { let s = ''; for (const v of bytes) s += String.fromCharCode(CP1252[v] || v); return s; };

  function numericValues(col) { return col.values.filter((v) => typeof v === 'number' && isFinite(v)); }

  const Data = { parseDelimited, fromMatrix, toCSV, parseFDT, parseNumber, nRows, makeColumn, numericValues, uniqueNames };
  root.Data = Data;
  if (typeof module !== 'undefined' && module.exports) module.exports = Data;
})(typeof globalThis !== 'undefined' ? globalThis : this);

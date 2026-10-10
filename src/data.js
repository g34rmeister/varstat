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
     Format reverse-engineered from sample files: a table header followed by
     column definitions (UTF-16 names) and rows; each row lists (column index,
     value) pairs. Supports numeric (float/int) and string columns. */
  function parseFDT(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const sig = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
    if (sig !== 'ADBS') throw new Error(T('Not a FireDAC binary file (.fdt).'));
    // locate column definitions: pattern 0xFF 0x0B 0x04 0x00 then uint32 len, UTF-16 name
    const cols = [];
    let p = 0;
    const readU16Str = (at) => { const len = dv.getUint32(at, true); let s = ''; for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint16(at + 4 + 2 * i, true)); return { s, next: at + 4 + 2 * len }; };
    for (p = 8; p < u8.length - 8; p++) {
      if (u8[p] === 0xFF && u8[p + 1] === 0x0B && u8[p + 2] === 0x04 && u8[p + 3] === 0x00) {
        const { s, next } = readU16Str(p + 4);
        // find datatype code: tag 0x05 0x00 (display name) follows; find 0x0C 0x00 then uint32 position
        cols.push({ name: s, at: next });
      }
      if (u8[p] === 0xFE && u8[p + 1] === 0xFE && u8[p + 2] === 0xFF && cols.length) break;
    }
    if (!cols.length) throw new Error(T('No columns found in .fdt file.'));
    // data type: search between this column and next for attribute bytes. We infer type from row values instead.
    // rows: each starts with 0xFF 0x19 ... 0xFF 0x1B then pairs (uint16 idx, value) until 0xFE
    const rows = [];
    const ncol = cols.length;
    let i = p;
    const isTextCol = new Array(ncol).fill(null);
    while (i < u8.length - 2) {
      if (u8[i] === 0xFF && u8[i + 1] === 0x1B) {
        i += 2;
        const row = new Array(ncol).fill(null);
        while (i < u8.length && u8[i] !== 0xFE) {
          const ci = dv.getUint16(i, true); i += 2;
          if (ci >= ncol) break;
          // decide string vs double: strings stored as uint32 length + UTF-16 chars (heuristic)
          let parsed = false;
          if (isTextCol[ci] !== false) {
            const len = dv.getUint32(i, true);
            if (len > 0 && len < 4096 && i + 4 + 2 * len <= u8.length) {
              let ok = true, s = '';
              for (let k = 0; k < len; k++) { const c = dv.getUint16(i + 4 + 2 * k, true); if (c < 9 || c > 0xFFFD) { ok = false; break; } s += String.fromCharCode(c); }
              const after = i + 4 + 2 * len;
              const nextOk = after < u8.length && (u8[after] === 0xFE || dv.getUint16(after, true) < ncol);
              if (ok && nextOk && (isTextCol[ci] === true || (/^[\x20-\x7E -ɏ]+$/.test(s)))) { row[ci] = s; i = after; parsed = true; isTextCol[ci] = true; }
            }
          }
          if (!parsed) { row[ci] = dv.getFloat64(i, true); i += 8; isTextCol[ci] = false; }
        }
        rows.push(row);
      } else i++;
    }
    const columns = cols.map((c, j) => {
      const vals = rows.map((r) => r[j]);
      const text = vals.some((v) => typeof v === 'string');
      return { name: c.name, type: text ? 'text' : 'numeric', values: vals.map((v) => (v === null || v === undefined ? null : text ? String(v) : v)) };
    });
    return { columns: uniqueNames(columns) };
  }

  function numericValues(col) { return col.values.filter((v) => typeof v === 'number' && isFinite(v)); }

  const Data = { parseDelimited, fromMatrix, toCSV, parseFDT, parseNumber, nRows, makeColumn, numericValues, uniqueNames };
  root.Data = Data;
  if (typeof module !== 'undefined' && module.exports) module.exports = Data;
})(typeof globalThis !== 'undefined' ? globalThis : this);

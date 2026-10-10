// JavaScript port of the edit-application code from CAMeL-Lab/text-editing
// (MIT, https://github.com/CAMeL-Lab/text-editing — edits/edit.py SubwordEdit,
// gec/tag.py rewrite / resolve_merges / detokenize_sent).
//
// The SWEET model tags every subword with an edit such as
//   K*            keep
//   R_[ة]         replace one char           (الصحه → الصحة)
//   KR_[أ]K*      keep, replace, keep rest   (لان → لأن)
//   MK*           merge with previous subword (ب الصحة → بالصحة)
//   KKI_[ ]K*     insert a space             (ياشباب → يا شباب)
//   D*            delete
// and these functions turn (subwords, edits) back into text.
// Behaviour is kept identical to the Python (checked by tests/camel.test.mjs).

const CHAR_EDIT_RE = /I_\[.*?\]+|A_\[.*?\]+|R_\[.*?\]+|K\*|D\*|./gu;
const inner = (e) => e.replace(/^[IAR]_\[(.*?)\]$/u, '$1');

// Python's s[:-n]: for n === 0 that is '' (not the whole string).
const pyCutEnd = (arr, n) => arr.slice(0, n === 0 ? 0 : -n);

function keepStar(chars, charEdits, editIdx) {
  const remaining = charEdits.slice(editIdx);
  const inserts = remaining.filter((x) => x.startsWith('I') || x.startsWith('A'));
  if (inserts.length === remaining.length) return chars.join('');
  return pyCutEnd(chars, remaining.length - inserts.length).join('');
}

function deleteStar(chars, charEdits, editIdx) {
  const remaining = charEdits.slice(editIdx);
  const inserts = remaining.filter((x) => x.startsWith('I') || x.startsWith('A'));
  if (inserts.length === remaining.length) return chars.length;
  return pyCutEnd(chars, remaining.length - inserts.length).length;
}

function applyCharEdits(sub, charEdits) {
  const chars = [...sub];
  let out = '';
  let idx = 0;
  charEdits.forEach((e, i) => {
    if (e === 'K') { out += chars[idx] ?? ''; idx++; }
    else if (e === 'D') idx++;
    else if (e.startsWith('I')) out += inner(e);
    else if (e.startsWith('A')) out += i ? ' ' + inner(e) : inner(e) + ' ';
    else if (e === 'K*') { const kept = keepStar(chars.slice(idx), charEdits, i + 1); idx += [...kept].length; out += kept; }
    else if (e === 'D*') idx += deleteStar(chars.slice(idx), charEdits, i + 1);
    else if (e.startsWith('R')) { out += inner(e); idx++; }
  });
  return out;
}

export function isApplicable(subword, edit) {
  const chars = [...subword.replace(/##/g, '')];
  const charEdits = edit.match(CHAR_EDIT_RE) || [];
  const core = charEdits.filter((e) => !e.startsWith('A') && !e.startsWith('M') && !e.startsWith('I'));
  if (edit === 'K' || edit.startsWith('KA')) return true;
  if (chars.length < core.length) return false;
  let idx = 0;
  for (let i = 0; i < core.length; i++) {
    const e = core[i];
    if (e.startsWith('R') || e === 'K' || e === 'D') idx++;
    else if (e === 'K*' || e === 'D*') {
      if (i === core.length - 1) { idx += chars.slice(idx).length; break; }
      idx = pyCutEnd(chars, core.length - (i + 1)).length;
    }
  }
  return idx >= chars.length;
}

export function applyEdit(subword, edit) {
  if (edit === 'K') return subword;
  if (edit.startsWith('KA') || edit.startsWith('DA')) {
    const inserts = (edit.match(/A_\[.*?\]+/gu) || []).map(inner);
    return edit.startsWith('KA') ? subword + ' ' + inserts.join(' ') : inserts.join('');
  }
  const sub = subword.replace(/##/g, '');
  const edited = applyCharEdits(sub, edit.match(CHAR_EDIT_RE) || []);
  return subword.includes('##') ? '##' + edited : edited;
}

export function resolveMerges(sent, edits) {
  const out = [];
  sent.forEach((sw, i) => {
    if (edits[i].startsWith('M') && out.length) out[out.length - 1] += sw;
    else out.push(sw);
  });
  return out;
}

export function detokenize(sent) {
  const out = [];
  for (const sw of sent) {
    if (sw.startsWith('##') && out.length) out[out.length - 1] += sw.replace(/##/g, '');
    else out.push(sw);
  }
  return out.join(' ');
}

/** rewrite(subwords, edits) → corrected text (one sentence). */
export function rewrite(subwords, edits) {
  const e = [...edits];
  while (e.length < subwords.length) e.push('K*');
  const rewritten = subwords.map((sw, i) => (isApplicable(sw, e[i]) ? applyEdit(sw, e[i]) : sw));
  return detokenize(resolveMerges(rewritten, e));
}

// Dictionary-based spell checking: is a word known, and which known words are
// one typo away from it («مفيذ» → «مفيد»، «الطاب» → «الطالب»، «حاك» → «حالك»).
// The word list (web/data/ar-words.txt) is ordered by frequency, so a word's
// line number doubles as its frequency rank.

import { plain } from './text.js';

// Short stand-alone words that often get glued to the next word.
const GLUE = new Set(['يا', 'لا', 'ما', 'كيف', 'هل', 'في', 'من', 'عن', 'على', 'إلى', 'الى', 'هذا', 'هذه', 'ذلك', 'تلك', 'عبد', 'أبو', 'ابو', 'إن', 'أن', 'ان', 'قد', 'لم', 'لن', 'كل', 'بعد', 'قبل', 'عند', 'مع', 'أو', 'او', 'ثم', 'حتى', 'كان', 'إذا', 'اذا', 'لكن', 'بين', 'غير']);

const LETTERS = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهويءأإآؤئةى'];

// Clitics that may be glued to a word but rarely appear in every combination
// in the word list: «وبمدرستهم» = و + ب + مدرسة + هم.
const PREFIXES = ['وب', 'ول', 'وك', 'وس', 'فب', 'فل', 'فس', 'و', 'ف', 'ب', 'ل', 'ك', 'س'];
const SUFFIXES = ['هما', 'كما', 'هم', 'هن', 'كم', 'كن', 'ها', 'نا', 'ني', 'ه', 'ك', 'ي'];

// Arabic keyboard rows (standard 101 layout) — neighbouring keys are easy to mix up.
const ROWS = ['ضصثقفغعهخحجد', 'شسيبلاتنمكط', 'ئءؤرلاىةوزظ'];
const NEAR = new Map();
ROWS.forEach((row, r) => [...row].forEach((ch, c) => {
  const set = NEAR.get(ch) || new Set();
  for (const [rr, cc] of [[r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c - 1]]) {
    const other = ROWS[rr]?.[cc];
    if (other) set.add(other);
  }
  NEAR.set(ch, set);
}));
// Letters that look or sound alike.
const ALIKE = ['اأإآ', 'ءئؤأإ', 'هة', 'يى', 'ذزد', 'ظضز', 'سص', 'تط', 'ثس', 'قك', 'حخج', 'عغ', 'ؤو', 'ئي'];
const alike = (a, b) => ALIKE.some((g) => g.includes(a) && g.includes(b));

/**
 * How likely `cand` is what the writer meant when they typed `typed`, as a
 * log-score penalty (0 = most likely): a dropped letter is the commonest
 * typo, then a neighbouring key / look-alike letter, then anything else.
 */
export function typoPrior(typed, cand) {
  const t = plain(typed), c = plain(cand);
  if (c.includes(' ')) return -0.5;                        // missing space
  if (c.length === t.length + 1) return 0;                 // a letter was left out
  if (c.length === t.length - 1) {                         // an extra letter
    const k = [...c].findIndex((ch, i) => ch !== t[i]);
    const at = k < 0 ? c.length : k;
    return t[at] === t[at - 1] || t[at] === t[at + 1] ? -0.2 : -0.7; // doubled key press is the commonest
  }
  if (c.length !== t.length) return -3;
  const diff = [...t].map((ch, i) => [ch, c[i]]).filter(([x, y]) => x !== y);
  if (diff.length === 2 && diff[0][0] === diff[1][1] && diff[0][1] === diff[1][0]) return -0.5; // swapped
  const [x, y] = diff[0] || [];
  if (alike(x, y)) return -0.4;
  if (NEAR.get(x)?.has(y)) return -0.5;
  return -2.5;
}

export function createLexicon(text) {
  const words = text.split('\n').map((w) => w.trim()).filter(Boolean);
  const rank = new Map();
  words.forEach((w, i) => { if (!rank.has(w)) rank.set(w, i + 1); });

  const rankOf = (w) => rank.get(w) ?? Infinity;

  /** Known as written, or as a known stem with clitics attached. */
  function isKnown(word) {
    const w = plain(word);
    if (rank.has(w)) return true;
    for (const p of ['', ...PREFIXES]) {
      if (p && !w.startsWith(p)) continue;
      const a = w.slice(p.length);
      for (const s of ['', ...SUFFIXES]) {
        if (!p && !s) continue;
        if (s && !a.endsWith(s)) continue;
        const stem = s ? a.slice(0, -s.length) : a;
        if (stem.length < 2) continue;
        // the ta marbuta becomes ta before a suffix: مدرستهم ← مدرسة
        const forms = s && stem.endsWith('ت') ? [stem, stem.slice(0, -1) + 'ة'] : [stem];
        if (forms.some((f) => rankOf(f) < 50000)) return true; // stems must be real, common words
      }
    }
    return false;
  }

  /** Known words one edit away (delete / swap / replace / insert / split). */
  function candidates(word, { maxRank = Infinity, limit = 8 } = {}) {
    const w = plain(word);
    const out = new Map();
    const add = (c) => { if (c !== w && !out.has(c)) { const r = c.includes(' ') ? Math.max(...c.split(' ').map(rankOf)) : rankOf(c); if (r < Infinity && r <= maxRank) out.set(c, r); } };
    for (let i = 0; i <= w.length; i++) {
      const a = w.slice(0, i), b = w.slice(i);
      if (b) add(a + b.slice(1));                                 // delete
      if (b.length > 1) add(a + b[1] + b[0] + b.slice(2));        // swap
      for (const L of LETTERS) {
        if (b) add(a + L + b.slice(1));                           // replace
        add(a + L + b);                                           // insert
      }
      if (GLUE.has(a) && b.length >= 2 && rankOf(b) < 150000) add(a + ' ' + b); // missing space: «ياصديقي» → «يا صديقي»
    }
    return [...out.entries()].sort((x, y) => x[1] - y[1]).slice(0, limit).map(([c, r]) => ({ word: c, rank: r }));
  }

  return { size: rank.size, rankOf, isKnown, candidates };
}

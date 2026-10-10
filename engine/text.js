// Arabic text helpers: normalisation, tokenisation and sentence splitting.
// Every token / sentence keeps its character offsets in the original text so
// suggestions can be applied in place (textarea, Word paragraph, web page).

export const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // + tatweel
export const ARABIC_LETTER = /[ء-يٱ-ۓ]/;
export const END_MARKS = '.!؟?…';
export const PUNCT_CHARS = '.!؟?…،,؛;:"«»()[]﴿﴾-–—\'';
const PUNCT_SET = new Set(PUNCT_CHARS);

export const isPunct = (ch) => PUNCT_SET.has(ch);
export const hasArabic = (s) => ARABIC_LETTER.test(s);

// Strip diacritics + tatweel (keeps the letters exactly).
export const plain = (w) => w.replace(DIACRITICS, '');

// Lookup key: plain + unify hamza-on-alef forms and alef maqsura, so a style
// is still recognised when the writer drops the hamza («اذا» ≈ «إذا»).
export const key = (w) => plain(w).replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي');

export const keySet = (iterable) => new Set([...iterable].map(key));

// Conjunction prefixes و / ف attached to particles: «وهل»، «فما».
export function stripConj(w) {
  const p = plain(w);
  if (p.length > 2 && (p[0] === 'و' || p[0] === 'ف')) return p.slice(1);
  return p;
}

/**
 * Tokenise into words with offsets. Punctuation is split off, so «حالك؟» gives
 * the word «حالك» and `after` = "؟" (the punctuation run that follows it).
 */
export function tokenize(text, base = 0) {
  const tokens = [];
  const re = /[^\s.!؟?…،,؛;:"«»()[\]﴿﴾\-–—']+/g;
  let m;
  while ((m = re.exec(text))) {
    tokens.push({ text: m[0], start: base + m.index, end: base + m.index + m[0].length, plain: plain(m[0]), key: key(m[0]) });
  }
  for (let i = 0; i < tokens.length; i++) {
    const from = tokens[i].end - base;
    const to = i + 1 < tokens.length ? tokens[i + 1].start - base : text.length;
    const gap = text.slice(from, to);
    tokens[i].after = gap.replace(/\s+/g, '');
    tokens[i].gap = gap;
  }
  return tokens;
}

/**
 * Split text into sentences. A sentence ends at a run of end marks (. ! ؟ ? …)
 * or at a line break. Decimal points («3.5») and dotted abbreviations inside
 * Latin text don't split.
 */
export function splitSentences(text) {
  const sentences = [];
  let start = 0;
  const push = (end, markStart, markEnd) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const s0 = start + lead;
    const body = text.slice(s0, markStart ?? end).replace(/\s+$/, '');
    if (body.trim()) {
      const bodyEnd = s0 + body.length;
      sentences.push({
        start: s0,
        end: markEnd ?? bodyEnd,
        bodyEnd,
        text: text.slice(s0, markEnd ?? bodyEnd),
        mark: markStart != null ? text.slice(markStart, markEnd) : '',
        markStart: markStart ?? bodyEnd,
        markEnd: markEnd ?? bodyEnd,
        // spaces between last word and mark, e.g. «حالك ؟»
        spaceBeforeMark: markStart != null && markStart > bodyEnd,
        tokens: tokenize(body, s0),
      });
    }
    start = end;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') { push(i); start = i + 1; continue; }
    if (!END_MARKS.includes(ch)) continue;
    // decimal point / Latin abbreviation: 3.5, e.g.
    if (ch === '.' && /\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || '')) continue;
    if (ch === '.' && /[A-Za-z]/.test(text[i + 1] || '')) continue;
    let j = i;
    while (j + 1 < text.length && END_MARKS.includes(text[j + 1])) j++;
    // include closing quotes/brackets after the mark
    let k = j;
    while (k + 1 < text.length && '"»)]﴾'.includes(text[k + 1])) k++;
    // find where the mark run begins: allow spaces between word and mark
    push(k + 1, i, j + 1);
    i = k;
  }
  if (start < text.length) push(text.length);
  return sentences;
}

// Split a sentence's tokens into clauses at commas/semicolons/colons.
export function clauses(tokens) {
  const out = [[]];
  for (const t of tokens) {
    out[out.length - 1].push(t);
    if (/[،,؛;:]/.test(t.after)) out.push([]);
  }
  return out.filter((c) => c.length);
}

// Present-tense verb prefix (حروف المضارعة) — rough but useful.
const NOT_VERB = /^(أن|أنه|أنها|أنهم|أنهما|أنك|أنكم|أنني|أننا|أنا|أنت|أنتم|أنتن|أنتما|أي|أيضا|أيضًا|أين|أول|أكثر|أقل|أمام|أثناء|تحت|نحو|نحن|يوم|يا)$/;
export const looksPresentVerb = (w) => /^[يتنأ][ء-ي]{2,}$/.test(plain(w)) && !plain(w).startsWith('ال') && !NOT_VERB.test(plain(w));
export const isDefinite = (w) => /^(و|ف|ب|ك|ل)?ال/.test(plain(w)) || plain(w).startsWith('لل');

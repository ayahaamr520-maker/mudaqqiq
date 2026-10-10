// E. Typos: one realistic typo per sentence (dropped letter, doubled letter,
// swapped letters, neighbouring key) injected into correct sentences. Measures
// how many the spell check flags and how many it corrects exactly, and how
// many correct words it flags in the same sentences.
import { createEngine, applyAll } from '../engine/engine.js';
import { plain } from '../engine/text.js';

const ROWS = ['ضصثقفغعهخحجد', 'شسيبلاتنمكط', 'ئءؤرلاىةوزظ'];
const neighbour = (ch, r) => {
  for (let i = 0; i < ROWS.length; i++) {
    const j = ROWS[i].indexOf(ch);
    if (j < 0) continue;
    const opts = [ROWS[i][j - 1], ROWS[i][j + 1]].filter(Boolean);
    return opts[Math.floor(r() * opts.length)] || null;
  }
  return null;
};
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

export const TYPO_KINDS = ['حرف ناقص', 'حرف مكرر', 'حرفان متبادلان', 'مفتاح مجاور'];

export function makeTypo(word, kind, r) {
  const w = [...word];
  const i = 1 + Math.floor(r() * (w.length - 2)); // not the first or last letter
  if (kind === 0) w.splice(i, 1);
  else if (kind === 1) w.splice(i, 0, w[i]);
  else if (kind === 2) [w[i], w[i + 1]] = [w[i + 1], w[i]];
  else { const n = neighbour(w[i], r); if (!n) return null; w[i] = n; }
  const t = w.join('');
  return t === word ? null : t;
}

/** spell = the spell provider (with or without a context scorer). */
export async function runTypoEval({ sentences, spell, limit = Infinity, onProgress = () => {} }) {
  const engine = createEngine({ rules: [], customRules: [] });
  engine.addProvider(spell);
  const r = rng(7);
  const out = { n: 0, hinted: 0, flagged: 0, fixed: 0, falseFlags: 0, words: 0, byKind: TYPO_KINDS.map((name) => ({ name, n: 0, flagged: 0, fixed: 0 })), examples: [] };
  const set = sentences.slice(0, limit);
  for (const [k, s] of set.entries()) {
    onProgress((k + 1) / set.length);
    const toks = s.split(' ');
    const idx = toks.map((t, i) => [t, i]).filter(([t]) => /^[\u0621-\u064A]{4,}$/.test(t));
    if (!idx.length) continue;
    const [word, pos] = idx[Math.floor(r() * idx.length)];
    const kind = Math.floor(r() * 4);
    const typo = makeTypo(word, kind, r);
    if (!typo) continue;
    const text = toks.map((t, i) => (i === pos ? typo : t)).join(' ');
    const start = toks.slice(0, pos).join(' ').length + (pos ? 1 : 0);
    const all = (await engine.analyzeAsync(text)).issues;
    const issues = all.filter((i) => i.severity !== 'hint');
    const hit = issues.find((i) => i.anchorStart <= start && start < i.anchorEnd);
    if (!hit && all.some((i) => i.anchorStart <= start && start < i.anchorEnd)) out.hinted++;
    out.n++; out.byKind[kind].n++;
    out.words += toks.length;
    if (hit) {
      out.flagged++; out.byKind[kind].flagged++;
      if (plain(hit.replacement) === plain(word)) { out.fixed++; out.byKind[kind].fixed++; }
    }
    out.falseFlags += issues.filter((i) => i !== hit).length;
    if (out.examples.length < 25) out.examples.push(`${word} → ${typo} → ${hit ? hit.replacement : '—'}`);
  }
  return {
    ...out,
    flaggedRate: out.flagged / out.n,
    fixedRate: out.fixed / out.n,
    hintedRate: out.hinted / out.n,
    falseFlagsPer1000Words: (1000 * out.falseFlags) / out.words,
    byKind: out.byKind.map((b) => ({ ...b, flaggedRate: b.flagged / b.n, fixedRate: b.fixed / b.n })),
  };
}

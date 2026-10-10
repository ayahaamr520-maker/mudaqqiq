// Spell-check provider for the engine.
//   • Dictionary only: words that don't exist («مفيذ») get "did you mean"
//     suggestions ranked by how common they are.
//   • With a context scorer (AraBERT): suggestions are ranked by how well they
//     fit the sentence, and real words that don't fit («كيف حاك؟» → «حالك»)
//     are flagged too.

import { plain } from './text.js';
import { typoPrior } from './spell.js';
import { fineTokens, explainChange } from './ai/spelling-diff.js';

const ARABIC_WORD = /^[ء-يً-ْـ]{2,}$/;
const SUSPICIOUS = -9.5;  // a known word scoring below this in context gets a second look
const MARGIN = 5;         // a candidate must beat the typed word by this much to flag a real word
const COMMON_RANK = 2000; // the 2,000 most common words (في، من، على…) are never second-guessed

export function createSpellProvider({ lexicon, scorer = null } = {}) {
  const provider = {
    name: 'Dictionary',
    lexicon,
    scorer,
    async analyze(doc) {
      const issues = [];
      for (const s of doc.sentences) {
        if (!/[ء-ي]/.test(s.text)) continue;
        const toks = fineTokens(s.text, s.start);
        const words = toks.map((t) => t.text);
        const unknown = [];
        const known = [];
        const variants = [];
        toks.forEach((t, i) => {
          if (!ARABIC_WORD.test(t.text)) return;
          const p = plain(t.text);
          if (!lexicon.isKnown(p)) {
            // only typo-like candidates (dropped letter, neighbouring key, look-alike, swap):
            // names and rare words usually differ from real words in arbitrary ways
            const cands = lexicon.candidates(p, { limit: 200 }).filter((c) => typoPrior(p, c.word) === 0 || (c.rank < 150000 && typoPrior(p, c.word) >= -0.8));
            if (cands.length) unknown.push({ i, t, p, cands });
          } else {
            const v = betterVariant(lexicon, p);
            if (v) variants.push({ t, v });
            else if (provider.scorer && lexicon.rankOf(p) > COMMON_RANK) known.push({ i, t, p });
          }
        });

        // known but far rarer than a spelling variant: «المدرسه» → «المدرسة»
        for (const { t, v } of variants) {
          const why = explainChange(t.text, v);
          issues.push({
            ruleId: 'spell-variant', title: why.title, category: 'spelling', source: 'rule', severity: 'warning', confidence: 0.75,
            start: t.start, end: t.end, replacement: v, anchorStart: t.start, anchorEnd: t.end,
            explanation: `${why.explanation}
«${v}» أكثر شيوعًا في الكتابة الصحيحة من «${t.text}» بكثير.`,
          });
        }

        // unknown words: rank suggestions (by context when available)
        let ctx = [];
        let suspicious = [];
        if (provider.scorer) {
          // one batched call: how well does each known word fit where it is?
          const own = known.length ? await provider.scorer.scoreMany(words, known.map((k) => ({ i: k.i, candidates: [k.t.text], withNext: false }))) : [];
          suspicious = known.filter((k, n) => own[n][0].own <= SUSPICIOUS)
            .map((k) => ({ ...k, cands: lexicon.candidates(k.p, { limit: 200 }) }))
            .filter((k) => k.cands.length);
          ctx = await rankAll(provider.scorer, words, [...unknown, ...suspicious.map((k) => ({ ...k, typed: k.t.text }))]);
        }
        unknown.forEach((u, n) => {
          const ranked = provider.scorer ? ctx[n].ranked.map((x) => x.word) : rankByDictionary(u.p, u.cands);
          // without context, only a clear typo (dropped letter / look-alike) is shown as an error
          const clear = typoPrior(u.p, ranked[0]) >= -0.5;
          issues.push(makeIssue(u.t, ranked, {
            severity: provider.scorer || clear ? 'warning' : 'hint',
            ruleId: 'spell-unknown',
            title: 'كلمة غير موجودة في المعجم',
            why: `«${u.t.text}» ليست كلمة معروفة في المعجم (أكثر من نصف مليون كلمة من ويكيبيديا العربية)، والأرجح أنها خطأ في الكتابة.`,
            byContext: !!provider.scorer,
          }));
        });

        // known words that don't fit the sentence
        suspicious.forEach((k, n) => {
          const { typed, ranked } = ctx[unknown.length + n];
          const best = ranked.filter((b) => b.score - typed >= MARGIN);
          if (!best.length) return;
          issues.push(makeIssue(k.t, best.map((b) => b.word), {
            ruleId: 'spell-context',
            title: 'كلمة لا تناسب السياق',
            why: `«${k.t.text}» كلمة صحيحة في ذاتها، لكنها لا تناسب سياق الجملة، والأرجح أنك قصدت «${best[0].word}» (بفرق حرف واحد).`,
            byContext: true,
            ai: true,
          }));
        });
      }
      return issues;
    },
  };
  return provider;
}

// ه/ة at the end, ا/أ/إ/آ at the start, ي/ى at the end: the spelling
// variants people mix up. A variant 50× more common is almost surely meant.
function betterVariant(lexicon, p) {
  const r = lexicon.rankOf(p);
  if (r < 2000) return null; // very common words are what they are
  const vs = [];
  if (/ه$/.test(p)) vs.push(p.slice(0, -1) + 'ة');
  if (/ة$/.test(p)) vs.push(p.slice(0, -1) + 'ه');
  if (/ي$/.test(p)) vs.push(p.slice(0, -1) + 'ى');
  if (/ى$/.test(p)) vs.push(p.slice(0, -1) + 'ي');
  const m = p.match(/^([وفبلك]?(?:ال)?)([اأإآ])(.+)$/);
  if (m) for (const a of 'اأإآ') if (a !== m[2]) vs.push(m[1] + a + m[3]);
  const best = vs.map((v) => [v, lexicon.rankOf(v)]).sort((x, y) => x[1] - y[1])[0];
  return best && best[1] * 50 < r ? best[0] : null;
}

// Without context: likely typo (dropped letter, neighbouring key…) first, then the more common word.
function rankByDictionary(typed, cands) {
  return cands
    .map((c) => ({ word: c.word, score: typoPrior(typed, c.word) - 0.3 * Math.log(c.rank) }))
    .sort((a, b) => b.score - a.score)
    .map((c) => c.word);
}

// With context: a cheap pass over the plausible candidates of every word, then
// a full (word + following word) score for each word's best five — two
// batched model calls per sentence.
async function rankAll(scorer, words, entries) {
  if (!entries.length) return [];
  const pools = entries.map((e) => e.cands.filter((c, n) => n < 8 || typoPrior(e.p, c.word) >= -0.8).slice(0, 30).map((c) => c.word));
  const quick = await scorer.scoreMany(words, entries.map((e, n) => ({ i: e.i, candidates: pools[n], withNext: false })));
  const tops = quick.map((list, n) => list
    .map((x) => ({ word: x.word, s: x.own + typoPrior(entries[n].p, x.word) }))
    .sort((a, b) => b.s - a.s).slice(0, 5).map((x) => x.word));
  const full = await scorer.scoreMany(words, entries.map((e, n) => ({ i: e.i, candidates: e.typed ? [e.typed, ...tops[n]] : tops[n] })));
  return full.map((list, n) => {
    const e = entries[n];
    const typed = e.typed ? list.shift().total : null;
    const ranked = list.map((x) => ({ word: x.word, score: x.total + typoPrior(e.p, x.word) })).sort((a, b) => b.score - a.score);
    return { typed, ranked };
  });
}

function makeIssue(t, ranked, { ruleId, title, why, byContext, ai = false, severity = 'warning' }) {
  const [best, ...alts] = ranked;
  const more = alts.slice(0, 3);
  return {
    ruleId, title, category: 'spelling', source: ai || byContext ? 'ai' : 'rule',
    severity, confidence: byContext ? 0.85 : 0.7,
    start: t.start, end: t.end, replacement: best,
    anchorStart: t.start, anchorEnd: t.end,
    alternatives: more,
    explanation: why + (more.length ? `\nاقتراحات أخرى: ${more.map((a) => `«${a}»`).join('، ')}.` : '') +
      (byContext ? '\n\n🤖 رُتّبت الاقتراحات حسب سياق الجملة بنموذج AraBERT.' : '\nرُتّبت الاقتراحات حسب شيوع الكلمات؛ فعّل «ذكاء اصطناعي: السياق» لترتيبها حسب معنى الجملة.'),
  };
}

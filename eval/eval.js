// Accuracy evaluation — runs in the browser (eval/index.html) with the same
// engine and AI models the app uses. Data: eval/data.json (tools/build_eval_data.py).
//
// A. Punctuation restoration: strip every mark, let the system put them back,
//    score each mark (precision / recall / F1) and the end-of-sentence mark.
// B. Wrong end mark: real questions ending in «.» instead of «؟».
// C. False alarms: suggestions on correct, published text (Wikipedia).
// D. Spelling: inject common mistakes into correct sentences, count fixes and
//    new errors introduced.

import { createEngine, applyAll } from '../engine/engine.js';
import { tokenize, plain } from '../engine/text.js';
import { diffBlocks } from '../engine/ai/spelling-diff.js';

const MARKS = ['.', '،', '؟', ':', '؛', '!'];
const STRIP = /[.،؛:!؟?,;]/g;
const norm = (m) => ({ '?': '؟', ',': '،', ';': '؛' })[m] || m;

// mark after each word: '' or the first punctuation char after it
function marksOf(text) {
  return tokenize(text).map((t) => (t.after ? norm([...t.after].find((c) => MARKS.includes(norm(c))) || '') : ''));
}
const wordsOf = (text) => tokenize(text).map((t) => plain(t.text));
const strip = (s) => s.replace(STRIP, ' ').replace(/\s+/g, ' ').trim();

function prf(tp, fp, fn) {
  const p = tp + fp ? tp / (tp + fp) : 0, r = tp + fn ? tp / (tp + fn) : 0;
  return { p, r, f1: p + r ? (2 * p * r) / (p + r) : 0, support: tp + fn };
}

function scoreMarks(pairs) {
  const c = Object.fromEntries(MARKS.map((m) => [m, { tp: 0, fp: 0, fn: 0 }]));
  let endOk = 0, endN = 0, all = { tp: 0, fp: 0, fn: 0 };
  for (const { gold, pred } of pairs) {
    if (gold.length !== pred.length) continue;
    gold.forEach((g, i) => {
      const p = pred[i];
      if (g && p === g) { c[g].tp++; all.tp++; }
      else {
        if (p) { c[p] && c[p].fp++; all.fp++; }
        if (g) { c[g].fn++; all.fn++; }
      }
    });
    endN++;
    if (pred[pred.length - 1] === gold[gold.length - 1]) endOk++;
  }
  const per = Object.fromEntries(MARKS.map((m) => [m, prf(c[m].tp, c[m].fp, c[m].fn)]));
  return { per, micro: prf(all.tp, all.fp, all.fn), endAccuracy: endN ? endOk / endN : 0, n: endN };
}

// deterministic corruptions for D
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const CORRUPT = [
  { name: 'حذف همزة القطع (أن → ان)', test: (w) => /^[أإ][ء-ي]{1,}$/.test(w), apply: (w) => 'ا' + w.slice(1) },
  { name: 'التاء المربوطة هاءً (مدرسة → مدرسه)', test: (w) => /[ء-ي]{2,}ة$/.test(w), apply: (w) => w.slice(0, -1) + 'ه' },
  { name: 'همزة الوصل قطعًا (الاستخدام → الإستخدام)', test: (w) => /^(ال)?ا(ست|[ء-ي]ت[ء-ي]ا)/.test(w), apply: (w) => w.replace(/^(ال)?ا/, '$1إ') },
  { name: 'فصل حرف الجر/العطف (والطلاب → و الطلاب)', test: (w) => /^[وب]ال[ء-ي]{2,}$/.test(w), apply: (w) => w[0] + ' ' + w.slice(1) },
  { name: 'الياء ألفًا مقصورة (في → فى)', test: (w) => /^(في|الذي|التي|هي)$/.test(w), apply: (w) => w.slice(0, -1) + 'ى' },
];

function corrupt(sentence, r) {
  const toks = sentence.split(' ');
  const cands = [];
  toks.forEach((t, i) => {
    const w = t.replace(STRIP, '');
    if (w !== t) return; // keep words with attached punctuation intact
    CORRUPT.forEach((c, k) => { if (c.test(w)) cands.push([i, k]); });
  });
  const picked = [];
  const used = new Set();
  while (cands.length && picked.length < 2) {
    const [i, k] = cands.splice(Math.floor(r() * cands.length), 1)[0];
    if (used.has(i)) continue;
    used.add(i);
    picked.push([i, k]);
  }
  for (const [i, k] of picked) toks[i] = CORRUPT[k].apply(toks[i]);
  return { text: toks.join(' '), injected: picked.map(([i, k]) => ({ index: i, kind: k })) };
}

export async function runEval({ data, punctProvider, spellProvider, limit = Infinity, onProgress = () => {} }) {
  const rules = createEngine();
  const hybrid = createEngine(); if (punctProvider) hybrid.addProvider(punctProvider);
  const speller = createEngine(); if (spellProvider) speller.addProvider(spellProvider);
  const both = createEngine(); for (const p of [spellProvider, punctProvider]) if (p) both.addProvider(p);
  const wiki = data.wikipedia.slice(0, limit), qs = data.questions.slice(0, limit);
  const res = { n: { wikipedia: wiki.length, questions: qs.length } };
  let done = 0;
  const total = (wiki.length + qs.length) * 2 + qs.length + wiki.length * 4;
  const tick = (what) => onProgress(++done / total, what);

  // ── A. restoration ──
  const A = { rules: [], model: [], hybrid: [] };
  const Aq = { rules: [], model: [], hybrid: [] };
  for (const [set, store] of [[wiki, A], [qs, Aq]]) {
    for (const s of set) {
      const gold = marksOf(s);
      const bare = strip(s);
      store.rules.push({ gold, pred: marksOf(applyAll(bare, rules.analyze(bare).issues)) });
      tick('A');
      if (punctProvider) {
        const words = tokenize(bare).map((t) => t.text);
        const preds = await punctProvider.predictPunctuation(words);
        store.model.push({ gold, pred: preds.map((p) => p.mark) });
        store.hybrid.push({ gold, pred: marksOf(applyAll(bare, (await hybrid.analyzeAsync(bare)).issues)) });
      }
      tick('A');
    }
  }
  const allA = (k) => [...A[k], ...Aq[k]];
  res.restoration = Object.fromEntries(['rules', 'model', 'hybrid'].filter((k) => allA(k).length).map((k) => [k, {
    all: scoreMarks(allA(k)),
    statementsEnd: scoreMarks(A[k]).endAccuracy,
    questionsEnd: scoreMarks(Aq[k]).endAccuracy,
  }]));

  // ── B. wrong end mark on questions («…؟» written as «….») ──
  const B = { rules: 0, hybrid: 0 };
  for (const q of qs) {
    const wrong = q.replace(/؟\s*$/, '.');
    if (applyAll(wrong, rules.analyze(wrong).issues).trim().endsWith('؟')) B.rules++;
    if (punctProvider && applyAll(wrong, (await hybrid.analyzeAsync(wrong)).issues).trim().endsWith('؟')) B.hybrid++;
    tick('B');
  }
  res.wrongEndMark = { n: qs.length, rules: B.rules / qs.length, hybrid: punctProvider ? B.hybrid / qs.length : null };

  // ── C. false alarms on correct text ──
  const C = { rules: {}, rulesCount: 0, ai: {}, aiCount: 0, examples: [] };
  for (const s of wiki) {
    const r = rules.analyze(s).issues.filter((i) => i.severity !== 'hint');
    C.rulesCount += r.length;
    r.forEach((i) => { C.rules[i.ruleId] = (C.rules[i.ruleId] || 0) + 1; if (C.examples.length < 40) C.examples.push({ rule: i.ruleId, sentence: s, from: i.anchorText, to: i.replacement }); });
    tick('C');
    if (spellProvider || punctProvider) {
      const a = (await both.analyzeAsync(s)).issues.filter((i) => i.source === 'ai' && i.severity !== 'hint');
      C.aiCount += a.length;
      a.forEach((i) => { C.ai[i.ruleId] = (C.ai[i.ruleId] || 0) + 1; if (C.examples.length < 80) C.examples.push({ rule: i.ruleId, sentence: s, from: i.anchorText, to: i.replacement }); });
    }
    tick('C');
  }
  res.falseAlarms = {
    sentences: wiki.length,
    rulesPer100: (100 * C.rulesCount) / wiki.length, rulesByRule: C.rules,
    aiPer100: (100 * C.aiCount) / wiki.length, aiByRule: C.ai,
    examples: C.examples,
  };

  // ── D. injected spelling mistakes ──
  const r = rng(42);
  const D = { rules: { fixed: 0, introduced: 0 }, ai: { fixed: 0, introduced: 0 }, injected: 0, byKind: CORRUPT.map((c) => ({ name: c.name, n: 0, rules: 0, ai: 0 })) };
  for (const s of wiki) {
    const { text, injected } = corrupt(s, r);
    if (!injected.length) { tick('D'); tick('D'); continue; }
    D.injected += injected.length;
    injected.forEach((x) => D.byKind[x.kind].n++);
    const orig = s.split(' ').map((w) => plain(w));
    const judge = (out, key) => {
      const blocks = diffBlocks(orig, out.split(' ').filter(Boolean).map((w) => plain(w)));
      for (const x of injected) if (!blocks.some((b) => b.i1 <= x.index && x.index < Math.max(b.i2, b.i1 + 1))) { D[key].fixed++; D.byKind[x.kind][key]++; }
      D[key].introduced += blocks.filter((b) => !injected.some((x) => b.i1 <= x.index && x.index < Math.max(b.i2, b.i1 + 1))).length;
    };
    judge(applyAll(text, rules.analyze(text).issues.filter((i) => i.category !== 'punctuation')), 'rules');
    tick('D');
    if (spellProvider) judge(applyAll(text, (await speller.analyzeAsync(text)).issues.filter((i) => i.category !== 'punctuation')), 'ai');
    tick('D');
  }
  res.spelling = {
    injected: D.injected,
    rules: { fixRate: D.rules.fixed / D.injected, newErrorsPer100: (100 * D.rules.introduced) / wiki.length },
    withAI: spellProvider ? { fixRate: D.ai.fixed / D.injected, newErrorsPer100: (100 * D.ai.introduced) / wiki.length } : null,
    byKind: D.byKind.map((k) => ({ ...k, rules: k.n ? k.rules / k.n : 0, ai: k.n ? k.ai / k.n : 0 })),
  };
  return res;
}

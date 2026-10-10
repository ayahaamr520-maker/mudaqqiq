// AI provider: Arabic spelling & grammar correction with CAMeL-Lab's SWEET
// text-editing model (CAMeL-Lab/text-editing-qalb14-nopnx, MIT, ACL 2025),
// exported to ONNX int8 and run in the browser. It fixes hamza, ta marbuta,
// alef maqsura, split/joined words and some grammar — and leaves punctuation
// to the punctuation model and the rules.

import { loadTokenClassifier } from './loader.js';
import { rewrite } from './camel-edits.js';
import { fineTokens, changesToIssues } from './spelling-diff.js';

const MIN_EDIT_PROB = 0.55; // below this an edit is treated as «keep» (int8 noise guard)
const DECODE_ITERATIONS = 2; // as in the model card
const MAX_WORDS = 100;

export async function createSpellingProvider(opts = {}) {
  const { tokenizer, run, config } = await loadTokenClassifier(opts);
  const id2label = config.id2label;
  const toTokens = (w) => (tokenizer.tokenize ? tokenizer.tokenize(w) : tokenizer._tokenizer.tokenize(w));
  const toIds = (toks) => tokenizer.convert_tokens_to_ids(toks);
  const cache = new Map();

  async function correctOnce(words) {
    const subs = words.flatMap(toTokens);
    if (!subs.length) return { words, minProb: 1 };
    const rows = await run(toIds(subs));
    let minProb = 1;
    const edits = rows.map((p) => {
      const k = p.indexOf(Math.max(...p));
      const label = id2label[k] ?? id2label[String(k)];
      if (label === 'K*') return label;
      if (p[k] < MIN_EDIT_PROB) return 'K*';
      minProb = Math.min(minProb, p[k]);
      return label;
    });
    return { words: rewrite(subs, edits).split(' ').filter(Boolean), minProb };
  }

  async function correct(words) {
    const key = words.join(' ');
    if (cache.has(key)) return cache.get(key);
    let out = [];
    let minProb = 1;
    for (let i = 0; i < words.length; i += MAX_WORDS) {
      let chunk = words.slice(i, i + MAX_WORDS);
      for (let it = 0; it < DECODE_ITERATIONS; it++) {
        const r = await correctOnce(chunk);
        chunk = r.words;
        minProb = Math.min(minProb, r.minProb);
      }
      out.push(...chunk);
    }
    const res = { words: out, minProb };
    if (cache.size > 500) cache.clear();
    cache.set(key, res);
    return res;
  }

  return {
    name: 'CAMeL SWEET',
    async analyze(doc) {
      const issues = [];
      for (const s of doc.sentences) {
        if (!/[ء-ي]/.test(s.text)) continue;
        const words = s.text.split(/\s+/).filter(Boolean);
        const { words: fixed, minProb } = await correct(words);
        issues.push(...changesToIssues(doc.text, fineTokens(s.text, s.start), fixed, minProb, this.name));
      }
      return issues;
    },
  };
}

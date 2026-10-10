// Context scorer: AraBERT masked language model (aubmindlab/bert-base-arabertv02),
// exported so it returns log-probabilities only at the masked positions.
// Used by the spell checker to ask "which word fits this sentence best?" —
// that is how «كيف حاك؟» is caught even though «حاك» is a real word.

import { loadTokenClassifier } from './loader.js';

const BATCH = 16;

export async function createContextScorer(opts = {}) {
  const { tokenizer, model, Tensor, CLS, SEP } = await loadTokenClassifier({ ...opts, maskedLM: true });
  const MASK = tokenizer.encode('[MASK]', { add_special_tokens: false })[0];
  const PAD = 0;
  const ids = (text) => (text ? tokenizer.encode(text, { add_special_tokens: false }) : []);
  const cache = new Map();

  // Run a batch of {seq, pos[], targets[]}; returns the summed log-prob of targets at pos.
  async function runBatch(items) {
    const out = [];
    for (let b = 0; b < items.length; b += BATCH) {
      const chunk = items.slice(b, b + BATCH);
      const n = Math.max(...chunk.map((x) => x.seq.length));
      const k = Math.max(...chunk.map((x) => x.pos.length));
      const flat = (fn, len) => BigInt64Array.from(chunk.flatMap((x) => Array.from({ length: len }, (_, j) => fn(x, j))), BigInt);
      const T = (data, len) => new Tensor('int64', data, [chunk.length, len]);
      const { logits } = await model({
        input_ids: T(flat((x, j) => x.seq[j] ?? PAD, n), n),
        attention_mask: T(flat((x, j) => (j < x.seq.length ? 1 : 0), n), n),
        token_type_ids: T(flat(() => 0, n), n),
        positions: T(flat((x, j) => x.pos[j] ?? 0, k), k),
      });
      const V = logits.dims[2];
      chunk.forEach((x, r) => {
        let s = 0;
        x.targets.forEach((t, j) => { s += logits.data[(r * k + j) * V + t]; });
        out.push(s);
      });
    }
    return out;
  }

  /**
   * Score candidate words for position i of `words` (words = the sentence,
   * punctuation as separate items). Returns, per candidate:
   *   own  — how well the candidate fits the gap (length-normalised log-prob)
   *   next — how well the following token fits once the candidate is in place
   */
  async function score(words, i, candidates, opts) {
    return (await scoreMany(words, [{ i, candidates, ...opts }]))[0];
  }

  /** Several positions of one sentence in a single batched model call. */
  async function scoreMany(words, groups) {
    const sentence = words.join(' ');
    const jobs = [];
    const out = groups.map(({ i, candidates, withNext = true }) => {
      const left = ids(words.slice(0, i).join(' '));
      const right = ids(words.slice(i + 1).join(' '));
      const base = 1 + left.length;
      return candidates.map((c) => {
        const key = `${sentence}|${i}|${c}|${withNext}`;
        const hit = cache.get(key);
        if (hit) return hit;
        const cid = ids(c);
        const it = { key, word: c, cid, own: 0, next: 0 };
        jobs.push({ it, kind: 'own', seq: [CLS, ...left, ...cid.map(() => MASK), ...right, SEP], pos: cid.map((_, j) => base + j), targets: cid });
        if (withNext && right.length) {
          jobs.push({ it, kind: 'next', seq: [CLS, ...left, ...cid, MASK, ...right.slice(1), SEP], pos: [base + cid.length], targets: [right[0]] });
        }
        return it;
      });
    });
    const res = await runBatch(jobs);
    jobs.forEach((j, n) => { j.it[j.kind] = j.kind === 'own' ? res[n] / Math.sqrt(j.it.cid.length) : res[n]; });
    return out.map((list) => list.map((it) => {
      if (it.total !== undefined) return it; // from cache
      const r = { word: it.word, own: it.own, next: it.next, total: it.own + it.next };
      if (cache.size > 5000) cache.clear();
      cache.set(it.key, r);
      return r;
    }));
  }

  return { name: 'AraBERT-Context', score, scoreMany };
}

// AI provider: Arabic punctuation restoration with AraBERT, running fully in
// the browser (ONNX Runtime Web via transformers.js — WebAssembly, or WebGPU
// when available). No text ever leaves the device.
//
// Model: makdadTaleb/arabic-punctuation-arabert (MIT), exported to ONNX int8
// by tools/export_onnx.py. Labels: none . ، ؟ ! ؛ :

import { loadTokenClassifier } from './loader.js';

const LABELS = ['', '.', '،', '؟', '!', '؛', ':'];
const COMMA = 2;
const COMMA_TAU = 0.7; // two-stage comma decision from the model card
const MAX_WORDS = 100;

export async function createPunctuationProvider(opts = {}) {
  const { tokenizer, run } = await loadTokenClassifier(opts);
  const cache = new Map();

  async function predictChunk(words) {
    const ids = [];
    const firstSub = [];
    for (const w of words) {
      firstSub.push(ids.length);
      const sub = tokenizer.encode(w, { add_special_tokens: false });
      ids.push(...(sub.length ? sub : tokenizer.encode('[UNK]', { add_special_tokens: false })));
    }
    const rows = await run(ids);
    return firstSub.map((pos) => {
      const p = rows[pos];
      let best = p.indexOf(Math.max(...p));
      if (best === COMMA && p[COMMA] < COMMA_TAU) {
        best = p.map((x, i) => (i === COMMA ? -1 : x)).reduce((bi, x, i, a) => (x > a[bi] ? i : bi), 0);
      }
      return { mark: LABELS[best], prob: p[best], probs: p };
    });
  }

  return {
    name: 'AraBERT-Punctuation',
    async predictPunctuation(words) {
      const k = words.join(' ');
      if (cache.has(k)) return cache.get(k);
      const out = [];
      for (let i = 0; i < words.length; i += MAX_WORDS) out.push(...(await predictChunk(words.slice(i, i + MAX_WORDS))));
      if (cache.size > 500) cache.clear();
      cache.set(k, out);
      return out;
    },
  };
}

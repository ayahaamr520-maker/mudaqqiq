// Runs the AI models in a background thread so typing never freezes while a
// model is thinking. The page talks to it through web/ai-client.js.
import { createPunctuationProvider } from '../engine/ai/punctuation-model.js';
import { createSpellingProvider } from '../engine/ai/spelling-model.js';
import { createContextScorer } from '../engine/ai/context-model.js';

const FACTORIES = { punct: createPunctuationProvider, spell: createSpellingProvider, context: createContextScorer };
const models = {};

self.onmessage = async ({ data: { id, op, kind, args } }) => {
  try {
    let result;
    if (op === 'load') {
      models[kind] = await FACTORIES[kind]({
        ...args,
        onProgress: (p) => self.postMessage({ id, progress: p }),
      });
      result = { name: models[kind].name };
    } else {
      const m = models[kind];
      if (op === 'predictPunctuation') result = await m.predictPunctuation(...args);
      else if (op === 'analyze') result = await m.analyze(...args);
      else if (op === 'score') result = await m.score(...args);
      else if (op === 'scoreMany') result = await m.scoreMany(...args);
    }
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: String(e?.message || e) });
  }
};

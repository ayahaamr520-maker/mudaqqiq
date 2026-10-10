// Runs the two AI models inside the extension (no network: transformers.js,
// ONNX Runtime and the model files are all packaged in the extension folder).
import * as T from './vendor/transformers.min.js';
import { createPunctuationProvider } from './engine/ai/punctuation-model.js';
import { createSpellingProvider } from './engine/ai/spelling-model.js';

const url = (p) => (globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL(p) : new URL(p, location.href).href);
T.env.backends.onnx.wasm.wasmPaths = url('vendor/');
T.env.backends.onnx.wasm.numThreads = 1;

const MODELS = {
  punct: () => createPunctuationProvider({ localPath: url('models/arabic-punctuation/'), transformers: T }),
  spell: () => createSpellingProvider({ localPath: url('models/arabic-spelling/'), transformers: T }),
};
const providers = {};
const load = (kind) => (providers[kind] ??= MODELS[kind]());

export async function handle(msg) {
  const p = await load(msg.kind);
  if (msg.kind === 'punct') return p.predictPunctuation(msg.words);
  return p.analyze(msg.doc);
}

globalThis.chrome?.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  handle(msg).then((result) => sendResponse({ ok: true, result }), (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});

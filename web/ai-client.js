// Page side of web/ai-worker.js: returns objects that look exactly like the
// in-page providers (same methods), but every call runs in the worker.
let worker = null;
let seq = 0;
const pending = new Map();

function call(op, kind, args, onProgress) {
  worker ??= createWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, op, kind, args });
  });
}

function createWorker() {
  const w = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
  w.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    if (data.progress) { p.onProgress?.(data.progress); return; }
    pending.delete(data.id);
    if (data.error) p.reject(new Error(data.error));
    else p.resolve(data.result);
  };
  return w;
}

// The engine's doc carries functions-free data only; keep what the models need.
const slimDoc = (doc) => ({ text: doc.text, sentences: doc.sentences.map((s) => ({ text: s.text, start: s.start, tokens: s.tokens, analysis: { expected: s.analysis?.expected ?? null } })) });

/** Load one model in the worker; resolves to a provider usable by the engine. */
export async function loadModel(kind, { localPath, remoteId, onProgress } = {}) {
  const { name } = await call('load', kind, { localPath, remoteId }, onProgress);
  if (kind === 'punct') return { name, predictPunctuation: (words) => call('predictPunctuation', kind, [words]) };
  if (kind === 'spell') return { name, analyze: (doc) => call('analyze', kind, [slimDoc(doc)]) };
  return { name, score: (...args) => call('score', kind, args), scoreMany: (...args) => call('scoreMany', kind, args) };
}

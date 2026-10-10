// Prepares extension/ for "Load unpacked": copies the shared engine, icons,
// the two AI models, and downloads (once) transformers.js + ONNX Runtime files,
// because extensions may not load code from the internet.
//
//   node tools/build-extension.mjs           full build (with AI, ~300 MB)
//   node tools/build-extension.mjs --no-ai   rules only (small)
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = join(root, 'extension');
const withAI = !process.argv.includes('--no-ai');

const VENDOR = {
  'transformers.min.js': 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js',
  'ort-wasm-simd-threaded.asyncify.mjs': 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm': 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/ort-wasm-simd-threaded.asyncify.wasm',
};

// engine (incl. engine/ai)
rmSync(join(ext, 'engine'), { recursive: true, force: true });
cpSync(join(root, 'engine'), join(ext, 'engine'), { recursive: true, filter: (src) => statSync(src).isDirectory() || src.endsWith('.js') });

// icons
mkdirSync(join(ext, 'icons'), { recursive: true });
for (const n of [16, 32, 128]) cpSync(join(root, 'word-addin', 'assets', `icon-${n}.png`), join(ext, 'icons', `icon-${n}.png`));

if (withAI) {
  // models
  for (const m of ['arabic-punctuation', 'arabic-spelling']) {
    const src = join(root, 'web', 'models', m);
    if (!existsSync(join(src, 'onnx', 'model_quantized.onnx'))) {
      console.warn(`! model ${m} missing (run tools/export_onnx.py) — the extension will work without it`);
      continue;
    }
    const dst = join(ext, 'models', m);
    if (!existsSync(join(dst, 'onnx', 'model_quantized.onnx')) || statSync(join(dst, 'onnx', 'model_quantized.onnx')).size !== statSync(join(src, 'onnx', 'model_quantized.onnx')).size) {
      cpSync(src, dst, { recursive: true });
    }
  }
  // vendor files (downloaded once)
  mkdirSync(join(ext, 'vendor'), { recursive: true });
  for (const [file, url] of Object.entries(VENDOR)) {
    const dst = join(ext, 'vendor', file);
    if (existsSync(dst)) continue;
    process.stdout.write(`downloading ${file}… `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
    console.log('ok');
  }
}
console.log(`extension/ ready${withAI ? ' (with AI)' : ' (rules only)'} — load it in chrome://extensions → "Load unpacked"`);

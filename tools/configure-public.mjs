// Points the project at its public homes in one go:
//   node tools/configure-public.mjs --site https://USER.github.io/REPO --hf HF-USERNAME
//
// --site  rewrites every https://localhost:3000 URL in word-addin/manifest.xml
// --hf    sets web/config.js to load the models from your Hugging Face repos
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const site = arg('--site')?.replace(/\/+$/, '');
const hf = arg('--hf')?.replace(/\/+$/, '');
if (!site && !hf) {
  console.log('usage: node tools/configure-public.mjs --site https://USER.github.io/REPO --hf HF-USERNAME');
  process.exit(1);
}

if (site) {
  if (!/^https:\/\//.test(site)) throw new Error('--site must start with https:// (Office requires HTTPS)');
  const f = join(root, 'word-addin', 'manifest.xml');
  const xml = readFileSync(f, 'utf8').replace(/https:\/\/localhost:3000|https:\/\/[^"<\s]+?(?=\/(word-addin|web)\/)/g, site);
  const domains = xml.replace(/<AppDomain>https:\/\/(?!cdn\.jsdelivr\.net|huggingface\.co)[^<]+<\/AppDomain>/, `<AppDomain>${new URL(site).origin}</AppDomain>`);
  writeFileSync(f, domains);
  console.log(`word-addin/manifest.xml → ${site}`);
}
if (hf) {
  const f = join(root, 'web', 'config.js');
  const js = readFileSync(f, 'utf8')
    .replace(/punct: '[^']*'/, `punct: '${hf}/arabic-punctuation-arabert-onnx'`)
    .replace(/spell: '[^']*'/, `spell: '${hf}/arabic-spelling-camel-onnx'`);
  writeFileSync(f, js);
  console.log(`web/config.js → models from huggingface.co/${hf}/…`);
}

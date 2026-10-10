// Loads a BERT token-classification model (ONNX) + tokenizer with
// transformers.js, from a local folder or a Hugging Face repo. Shared by the
// punctuation and spelling providers.

export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

/**
 * @param {object} o
 * @param {string} [o.localPath]   folder URL with config.json, tokenizer.json, onnx/model_quantized.onnx
 * @param {string} [o.remoteId]    Hugging Face repo id fallback
 * @param {object} [o.transformers] an already-imported transformers.js module (extension bundles its own copy)
 * @param {(p:{file, loaded, total})=>void} [o.onProgress]
 */
export async function loadTokenClassifier({ localPath, remoteId, transformers, onProgress, maskedLM = false } = {}) {
  const T = transformers || (await import(TRANSFORMERS_URL));
  const { AutoTokenizer, AutoModelForTokenClassification, AutoModelForMaskedLM, Tensor, env } = T;

  let modelId = remoteId;
  if (localPath) {
    const u = new URL(localPath.replace(/\/?$/, '/'), location.href);
    const ok = await fetch(new URL('config.json', u), { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
    if (ok) {
      const parts = u.pathname.replace(/\/$/, '').split('/');
      modelId = parts.pop();
      // Origin-relative on purpose: transformers.js 4.x skips its local
      // file-existence check when localModelPath is a full http(s) URL.
      // (chrome-extension:// pages need the full URL, which works there.)
      env.localModelPath = u.protocol.startsWith('http') ? parts.join('/') + '/' : u.origin + parts.join('/') + '/';
      env.allowLocalModels = true;
      env.allowRemoteModels = !!remoteId;
    }
  }
  if (!modelId) throw new Error('لم يُعثر على ملفات النموذج محليًا ولم يُحدَّد مستودع على Hugging Face.');

  const progress_callback = (p) => {
    if (p.status === 'progress' && onProgress) onProgress({ file: `${modelId}/${p.file}`, loaded: p.loaded, total: p.total });
  };
  const tokenizer = await AutoTokenizer.from_pretrained(modelId, { progress_callback });
  const Model = maskedLM ? AutoModelForMaskedLM : AutoModelForTokenClassification;
  const model = await Model.from_pretrained(modelId, { dtype: 'q8', progress_callback });
  const [CLS, SEP] = tokenizer.encode('', { add_special_tokens: true });

  /** Run the model on token ids (without CLS/SEP); returns per-token probability rows. */
  async function run(ids) {
    const all = [CLS, ...ids, SEP];
    const n = all.length;
    const t = (arr) => new Tensor('int64', BigInt64Array.from(arr, BigInt), [1, n]);
    const { logits } = await model({ input_ids: t(all), attention_mask: t(all.map(() => 1)), token_type_ids: t(all.map(() => 0)) });
    const C = logits.dims[2];
    const rows = [];
    for (let i = 1; i < n - 1; i++) {
      const row = Array.from(logits.data.slice(i * C, i * C + C));
      const m = Math.max(...row);
      const e = row.map((x) => Math.exp(x - m));
      const s = e.reduce((a, b) => a + b, 0);
      rows.push(e.map((x) => x / s));
    }
    return rows;
  }

  return { tokenizer, model, run, config: model.config, Tensor, CLS, SEP };
}

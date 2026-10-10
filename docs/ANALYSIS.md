# Analysis & decisions (Oct 2026)

## 1. Is there a ready model on Hugging Face?

Searched the Hub for Arabic GEC / grammar / punctuation / spelling models. Shortlist:

| Model | What it does | Size | Browser (ONNX)? | Verdict |
|---|---|---|---|---|
| **makdadTaleb/arabic-punctuation-arabert** (MIT) | Predicts the mark after each word: none . ، ؟ ! ؛ : | 135 M params → **135 MB int8** | ✅ plain BERT token classifier, exported cleanly | **Used.** On our sentences: 14/15 correct in fp32. Model card F1: `؟` 0.96, `.` 0.996, `:` 0.80, `،` 0.75, `!` 0.43 |
| noone-m/arabert-punctuation | same labels, tiny (5 M) | ~6 MB | ✅ | Rejected: wrong on almost every test sentence |
| CAMeL-Lab/text-editing-qalb14-nopnx (MIT, ACL 2025) | Full GEC as edit tags (spelling, hamza, ة/ه, joined/split words, some grammar) | 135 M → **135 MB int8** | ✅ after porting the tag-to-text `rewrite()` to JS (`engine/ai/camel-edits.js`, parity-tested on all 250 labels) | **Used** for spelling/grammar (§2b) |
| CAMeL-Lab/arabart-qalb14-gec-ged-13 (MIT) | seq2seq GEC, needs a GED model + CAMeL morphological preprocessing | 140 M + BERT | ❌ needs camel_tools morphology in Python | Server-side only |
| alnnahwi/gemma-3-1b-arabic-gec-v1, CUAIStudents/Qwen-Ar-GEC, ArMistral-GEC | LLM rewrites | 1–7 B | ❌ too big for a browser; no explanations | Possible later via the provider interface, server-side |

**Conclusion:** no single model covers the brief (it needs *explanations*, *style recognition*, and Apply/Ignore per issue — models only output corrected text). So the design is **hybrid**:

- **Rules** (deterministic, explainable, instant): sentence styles, end marks, Latin→Arabic marks, spacing, vocative comma, common spelling, agreement checks.
- **AI model** (in the browser): commas/colons/semicolons, splitting run-on text, and end marks where the rules are unsure.

## 2. Why the hybrid matters — measured

- int8 quantisation (needed to get 539 MB → 135 MB) flips a few borderline cases, e.g. «ما أروع هذا المنظر» → model says «؟». The rule «ما + أفعل» (lexicon of أفعل forms) is certain it's an exclamation, so the rule wins (confidence ≥ 0.8).
- The other way round: in «السلام عليكم كيف حالك اليوم أتمنى…» the model is only 52% sure a sentence ends after «اليوم». We re-run the style rules on that piece; it starts with «كيف», so we use «؟» confidently. Result: «السلام عليكم، كيف حالك اليوم؟ أتمنى أن تكون بخير.»
- Speed in the browser (WASM): ~40–60 ms per sentence after the one-time download (cached by the browser).

## 2b. The spelling/grammar model (added 10 Oct)

- CAMeL's SWEET model tags each word piece with an edit (keep, replace a letter, merge, split…). Their Python decoder was ported to JS and checked against the original on **4,250 label × word-piece cases: identical**.
- The corrected sentence is diffed against the original, and every change becomes its own suggestion with an explanation of the rule behind it (hamza, ta marbuta, alef maqsura, joining/splitting, case endings).
- **int8 caveat:** compressing to 135 MB keeps the *spelling* edits but loses some *grammar* edits («هذه»، «التي»، «إن المعلمين»), which the rules already cover. It also produced one wrong low-confidence edit, hence a 55% confidence floor. Tried per-channel, MatMul-only (284 MB) and others: none better.
- Measured (docs/EVALUATION.md): fixes **89%** of injected common mistakes (rules alone 30%), with **81%** precision on published text.

## 3. Client-side (as requested)

- transformers.js 4.2.0 + ONNX Runtime Web, model files served next to the site.
- GitHub Pages limits files to 100 MB, so for a public demo upload the model to your HF account (`tools/upload_to_hf.py`) and set `MODEL_REMOTE` in `web/app.js`; HF serves it with CORS.
- Gotcha found: transformers.js 4.x silently skips local files when `env.localModelPath` is a full `http://` URL. The provider uses an origin-relative path.

## 4. Known limitations (honest list for the report)

- Arabic is written without diacritics, so some sentences are truly ambiguous: «ما ذهبت» can be negation or a question; «من يجتهد ينجح» condition or question. Rules leave these to the AI model (or say nothing).
- Grammar rules are a small, high-precision set (agreement with sound plurals, إنّ, demonstratives, الذي/التي, verb gender for a list of intransitive verbs). They don't do full إعراب.
- Spelling *rules* cover a curated list + hamzat-wasl patterns; the spelling *model* handles the rest (ة/ه, hamza in any word, joined/split words). It can stumble on proper names.
- Word: corrections show in the side panel (Word doesn't allow a floating window inside the document). Card click selects the text in the document.
- The browser extension runs both models in an offscreen document (offline, packaged in the extension). Its messaging path is untested in a real Chrome install; the model code itself was tested as a plain page. The Google Docs add-on is rules-only.
- System-wide "any Windows app" checking would need a native keyboard hook / UI Automation app — out of scope for a prototype; the extension + Word cover where students actually write.

## 5. Roadmap

Done on 10 Oct: spelling/grammar model in the browser (§2b), accuracy evaluation (docs/EVALUATION.md), Google Docs add-on, AI inside the browser extension (offscreen document), one-command public deployment (GitHub Pages + Hugging Face).

Next:
1. **Real student test set:** 50–100 student paragraphs corrected by a teacher, to measure accuracy on the writing the tool is actually for.
2. **Optional LLM provider** (server or API) implementing `analyze(doc) → Issue[]` for long-range grammar, keeping the rule explanations as the source of "why".
3. **Proper-name guard** for the spelling model (skip capitalised Latin-origin names, or a small gazetteer), the main source of its wrong suggestions.
4. **fp16 spelling model** as an opt-in "high-accuracy" mode (≈ 270 MB) to recover the grammar edits lost to int8.
5. **Collect Apply/Ignore choices** (locally) to tune thresholds per user.

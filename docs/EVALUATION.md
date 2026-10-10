# Accuracy evaluation (10 Oct 2026)

How well does Mudaqqiq work on **real Arabic text**? Everything below was produced by `eval/index.html`, which runs the same engine and AI models as the app, in the browser, on a fixed test set. Re-run it any time (section 6). Raw numbers are in `eval/results.json`.

## 1. Test data

| Set | Size | Source | Licence |
|---|---|---|---|
| Statements | 600 sentences (6–40 words), with 383 commas, 14 colons, 12 semicolons | Random Arabic Wikipedia articles (intros) | CC BY-SA 4.0 |
| Questions | 300 questions written by people | ARCD reading-comprehension dataset (`hsseinmz/arcd`) | MIT |

Built by `tools/build_eval_data.py` with a fixed random seed.

**Caveat:** Wikipedia isn't perfect. Part of section 4 is about the mistakes the tool *finds* in it.

## 2. Systems compared

- **Rules only:** the JavaScript rule engine (what the browser extension and Google Docs add-on use by default).
- **Model only:** the AraBERT punctuation model on its own (`makdadTaleb/arabic-punctuation-arabert`, int8 ONNX).
- **Hybrid:** rules + model, as in the website and Word add-in (rules decide when they are confident, the model fills the rest).
- **Spelling model:** CAMeL-Lab SWEET (`text-editing-qalb14-nopnx`, int8 ONNX), on top of the rules.

## 3. Results

### A. Putting punctuation back (all marks removed from 900 sentences)
F1 combines precision (are the suggested marks right?) and recall (are the needed marks found?).

| System | «.» F1 | «،» F1 | «؟» F1 | «:» F1 | All marks F1 | End of statement correct | End of question correct |
|---|---|---|---|---|---|---|---|
| Rules only | 92.8% | — | 78.5% | — | 72.0% | 98.0% | 64.7% |
| Model only | 98.2% | 47.8% | 96.0% | 19.0% | 74.2% | 99.5% | 95.3% |
| **Hybrid** | **98.4%** | **50.6%** | **96.5%** | **32.3%** | **78.8%** | **99.5%** | **95.3%** |

- **End marks are very reliable:** 99.5% of statements end with «.», and 95% of questions get «؟».
- **Commas are the weak point** (F1 ≈ 50%). The model puts commas in many places where the Wikipedia author didn't (precision ≈ 38%). Arabic comma use is partly a matter of style, so many of these are acceptable. That's why commas are shown as gentle *hints*, not errors.
- Colons and semicolons are too rare in the data (14 and 12) to judge.

### B. A question written with «.» instead of «؟» (300 real questions)

| Rules only | Hybrid |
|---|---|
| 65% fixed | **88% fixed** |

The rules catch questions that start with a question word (هل، كيف، لماذا…). The model also catches questions that don't, such as «تحب القهوة أم الشاي».

### C. Flags raised on published, edited text (600 Wikipedia sentences)

| | Flags per 100 sentences | Checked by hand |
|---|---|---|
| Rules | 7.7 | **46 of 46 are real mistakes in Wikipedia**: spaces before punctuation (32), Latin `, ;` in Arabic (11), «لانها»، «بإسم»… |
| Spelling model | 10.3 | **50 of 62 are real mistakes (81%)**: «التاثيرات → التأثيرات»، «مبتكره → مبتكرة»، «و خاصة → وخاصة»… The other 12: 5 proper names (place names, «امحمد»), 7 real model errors («الاجتماعية → الإجتماعية»، «كقوله → كقولة»). |

The hand review found four rule false-alarms in an earlier run («أي» meaning "that is", «إلا» mistaken for «ألا», the loanword «الإستونية», and «أشكال القيادة الذي»). They were fixed and added as regression tests. Because those fixes were made after looking at this data, the rules' 46/46 is slightly optimistic.

### D. Spelling mistakes injected into correct sentences (1,109 mistakes)

| Mistake type | Count | Rules fixed | Rules + spelling model fixed |
|---|---|---|---|
| Dropped hamza (أن → ان) | 256 | 28.9% | **89.8%** |
| Ta marbuta as ha (مدرسة → مدرسه) | 506 | 0% | **86.0%** |
| Hamzat wasl written as qat' (الاستخدام → الإستخدام) | 52 | 80.8% | **90.4%** |
| Prefix split off (والطلاب → و الطلاب) | 79 | 0% | **70.9%** |
| ي written as ى (في → فى) | 216 | 100% | 100% |
| **All** | **1,109** | **29.9%** | **88.7%** |

Other changes made to the sentences: 1.5 per 100 sentences with rules, 11.8 with the model. Section C shows that roughly 4 in 5 of those are real Wikipedia mistakes being corrected, not new errors.

### E. Typos (added 11 Oct)
One realistic typo per sentence, injected into correct Wikipedia sentences (`eval/typos.js`, fixed seed): a dropped letter, a doubled letter, two swapped letters, or the neighbouring key on the Arabic keyboard. "Corrected" = the first suggestion is exactly the original word.

| System | Sentences | Typo flagged | Corrected exactly | False flags per 1,000 words |
|---|---|---|---|---|
| Dictionary only (all 600) | 599 | 64.6% | 59.8% | 5.3 |
| Dictionary only (first 200) | 200 | 64.5% | 59.5% | 5.2 |
| **Dictionary + context model** (first 200) | 200 | **85.0%** | **82.0%** | 6.1 |

By typo type (corrected exactly, first 200 sentences):

| Typo | Dictionary | + Context |
|---|---|---|
| Dropped letter | 25.5% | **68.6%** |
| Doubled letter | 75.5% | **87.8%** |
| Swapped letters | 65.3% | **83.7%** |
| Neighbouring key | 72.5% | **88.2%** |

- A dropped letter often produces another real word («الآلية» → «الآلة», «بالقرب» → «بالرب»). The dictionary can't see those; the context model can («بالرب» → «بالقرب», «السفاد» → «الفساد», and the motivating example «كيف حاك؟» → «حالك»).
- The context model's threshold (a candidate must beat the written word by 8 log-points, words scored without vowel marks) was tuned on 100 held-out Wikipedia sentences: at 5 it raised 13.5 false flags per 1,000 words, at 8 about 4 (of which three were real errors in Wikipedia). The remaining false flags are mostly names and rare words («الداروني»، «شاحبة»).
- Speed: about 2–5 seconds per new sentence with the context model on (in a background thread); the dictionary is instant.

## 4. What this means

- **Punctuation:** end marks are excellent (≥ 95%). The comma suggestions are useful but should be read as suggestions.
- **Spelling:** the AI model is the big win, fixing 89% of common mistakes against 30% for rules alone, at about 81% precision.
- **Typos:** the dictionary corrects 60% of typos on its own; with the context model 82%, including real words in the wrong place («كيف حاك؟» → «حالك»).
- **Grammar** (agreement, إنّ and its sisters, demonstratives, الذي/التي) is covered by a small set of rules that rarely misfire. It isn't measured here because no suitable public test set with those errors exists. `npm test` has hand-made cases.

## 5. Settings chosen from this evaluation

- **AI comma threshold 0.85** (was 0.70 from the model card). It was tuned on the first 300 Wikipedia sentences: F1 rose from 47.4% to 51.2%. On the other 300 it gives about 49%. Precision levels off around 40–45% whatever the threshold, which confirms the "style choice" reading.
- **Spelling-model edits need ≥ 55% confidence.** The int8 model occasionally made a wrong edit at about 48% («مخلصون → مخلصين»), while correct edits scored 59–99%.
- Edits touching numbers are skipped (a «2,25» glitch).

## 6. Re-running it

1. Double-click `1-start-website.bat` (or `npm start`).
2. Open **http://localhost:8080/eval/** and click **تشغيل التقييم**. A full run takes about 5 minutes; "سريع" mode runs 100 sentences.
3. **تنزيل النتائج** downloads the raw JSON.

To rebuild the test set from new Wikipedia articles: `python tools/build_eval_data.py`.

## 7. Limits of this evaluation

- Wikipedia and ARCD questions are not student essays. Student writing has more errors and less formal style. A small set of real student paragraphs, corrected by a teacher, would be the best next test.
- Section D uses *synthetic* mistakes of five common kinds. Real mistakes are more varied.
- The models are int8-compressed for the browser. The original full-size models are slightly more accurate, especially for grammar edits by the spelling model (see `docs/ANALYSIS.md`).

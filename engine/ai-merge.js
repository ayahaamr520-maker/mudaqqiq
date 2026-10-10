// Merges per-word punctuation predictions from an AI model with the rule
// issues. Policy:
//   • A rule that is confident about a sentence's end mark (≥ 0.8) wins —
//     e.g. «ما أروع هذا المنظر» is an exclamation even if the model says «؟».
//   • Where rules are unsure (plain statements, «ما فعلت…»), the model decides.
//   • Inside the sentence the model adds missing commas / colons / semicolons
//     and splits run-on sentences, above per-mark confidence thresholds.

import { STYLE_INFO, analyzeSentence, explainStyle } from './styles.js';

// Thresholds. Comma: 0.85 = best F1 on half of eval/data.json (see docs/EVALUATION.md).
const MID_THRESHOLD = { '،': 0.85, ':': 0.6, '؛': 0.8, '.': 0.85, '؟': 0.85, '!': 0.9 };
const END_INSERT_THRESHOLD = 0.6;
const END_REPLACE_THRESHOLD = 0.85;

const MARK_WHY = {
  '،': 'تُوضع الفاصلة (،) بين الجمل المتعاطفة أو المتصلة في المعنى، وبعد المنادى، وبين جملتي الشرط والجواب إذا طالت، وبين أقسام الشيء.',
  ':': 'تُوضع النقطتان (:) بعد القول وما في معناه قبل الكلام المنقول، وقبل التفصيل والأمثلة.',
  '؛': 'تُوضع الفاصلة المنقوطة (؛) بين جملتين تكون الثانية سببًا للأولى أو نتيجة لها.',
  '.': 'تُوضع النقطة (.) في نهاية الجملة التامة المعنى؛ ويبدو أن جملة انتهت هنا وبدأت أخرى.',
  '؟': 'تُوضع علامة الاستفهام (؟) بعد الجملة الاستفهامية؛ ويبدو أن هذه الجملة سؤال.',
  '!': 'تُوضع علامة التعجب (!) بعد جمل التعجب والانفعال كالفرح والدهشة والدعاء.',
};
const MARK_NAME = { '،': 'فاصلة', ':': 'نقطتان', '؛': 'فاصلة منقوطة', '.': 'نقطة', '؟': 'علامة استفهام', '!': 'علامة تعجب' };
const pct = (p) => `${Math.round(p * 100)}%`;

export function mergePunctuationPredictions(doc, ruleIssues, predsPerSentence, providerName = 'AI') {
  const issues = [...ruleIssues];
  const aiNote = (p) => `\n\n🤖 اقتراح من نموذج الذكاء الاصطناعي (${providerName}) بنسبة ثقة ${pct(p)}.`;

  doc.sentences.forEach((s, si) => {
    const preds = predsPerSentence[si];
    if (!preds || preds.length !== s.tokens.length) return;
    const n = s.tokens.length;

    // inside the sentence
    let segStart = 0;
    let clauseStart = 0; // predicted commas also open a new clause for style checks
    for (let i = 0; i < n - 1; i++) {
      const t = s.tokens[i];
      let { mark, prob } = preds[i];
      let why = MARK_WHY[mark];
      if (t.after) { if (/[.!؟?]/.test(t.after)) segStart = i + 1; continue; }
      // The model thinks a sentence ends here (run-on text). Check the piece
      // with the style rules: «…كيف حالك اليوم» → a question → «؟».
      const pr = preds[i].probs;
      const pEnd = pr ? pr[1] + pr[3] + pr[4] : (['.', '؟', '!'].includes(mark) ? prob : 0);
      if (pEnd >= 0.5) {
        const seg = s.tokens.slice(Math.max(segStart, clauseStart), i + 1);
        const exp = analyzeSentence({ tokens: seg, start: seg[0].start, bodyEnd: t.end }).expected;
        if (exp && exp.confidence >= 0.8) {
          mark = exp.mark; prob = Math.max(pEnd, exp.confidence);
          why = explainStyle(exp.style) + ' ويبدو أن الجملة انتهت هنا وبدأت جملة جديدة.';
        } else if (['.', '؟', '!'].includes(mark) && pEnd >= 0.85) {
          prob = pEnd;
        } else if (mark !== '،' && mark !== ':' && mark !== '؛') {
          continue;
        }
        if (['.', '؟', '!'].includes(mark)) segStart = i + 1;
      }
      if (pr && pr[2] + pr[5] >= 0.5) clauseStart = i + 1;
      if (!mark || prob < (['.', '؟', '!'].includes(mark) ? 0.5 : (MID_THRESHOLD[mark] ?? 1))) continue;
      // never put a comma between «يا» and the name, or right after a preposition-like particle
      if (/^(يا|أيها|أيتها|في|على|من|إلى|عن|و|ف|ثم|أو|أن|إن|لا|لم|لن|قد)$/.test(t.text)) continue;
      issues.push({
        ruleId: 'ai-punct', category: 'punctuation', severity: 'hint', source: 'ai', confidence: prob,
        title: `${MARK_NAME[mark]} مقترحة`,
        start: t.end, end: t.end, replacement: mark, anchorStart: t.start, anchorEnd: t.end,
        explanation: why + aiNote(prob),
        original: '', anchorText: t.text,
      });
    }

    // end of the sentence
    const last = s.tokens[n - 1];
    const { mark, prob } = preds[n - 1];
    if (!['.', '؟', '!'].includes(mark)) return;
    const exp = s.analysis.expected;
    if (exp && exp.confidence >= 0.8) return; // rules are sure
    const current = s.mark.replace(/\?/g, '؟');
    if (current.includes('…') || current.includes('...') || (current.includes('؟') && current.includes('!'))) return;
    if (current.replace(/(.)\1+/g, '$1') === mark) {
      // model agrees with the writer → drop a weak rule complaint on this sentence
      remove(issues, (i) => i.ruleId === 'end-mark' && i.sentenceIndex === si);
      return;
    }
    if (current ? prob < END_REPLACE_THRESHOLD : prob < END_INSERT_THRESHOLD) {
      return;
    }
    // the model's opinion replaces a weak rule-based end-mark issue
    remove(issues, (i) => i.ruleId === 'end-mark' && i.sentenceIndex === si);
    const isLastInText = si === doc.sentences.length - 1 && doc.text.slice(s.end).trim() === '';
    issues.push({
      ruleId: 'ai-end-mark', category: 'punctuation', source: 'ai', confidence: prob,
      severity: current ? 'warning' : isLastInText ? 'hint' : 'warning',
      title: current ? `علامة نهاية الجملة الأنسب «${mark}»` : `${MARK_NAME[mark]} ناقصة في نهاية الجملة`,
      start: s.bodyEnd, end: s.markEnd, replacement: mark,
      anchorStart: last.start, anchorEnd: current ? s.markEnd : last.end,
      explanation: (mark === '.' ? STYLE_INFO.statement.why : MARK_WHY[mark]) + aiNote(prob),
      original: doc.text.slice(s.bodyEnd, s.markEnd), anchorText: doc.text.slice(last.start, current ? s.markEnd : last.end),
      sentenceIndex: si,
    });
  });
  return issues;
}

function remove(arr, pred) {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) arr.splice(i, 1);
}

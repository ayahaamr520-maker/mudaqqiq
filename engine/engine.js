// مُدقِّق — the checking engine. Pure JavaScript, no dependencies, runs the
// same in a browser page, a Word add-in task pane, a browser extension or Node.
//
//   const engine = createEngine();
//   const { sentences, issues } = engine.analyze(text);          // rules only, sync
//   const res = await engine.analyzeAsync(text);                  // rules + AI providers
//   text = applyIssue(text, issues[0]);
//
// Extension points:
//   engine.addRule(rule | simpleRuleDefinition)   — requirement 9 (new rules)
//   engine.addProvider(provider)                  — requirement 10 (AI models)

import { splitSentences, hasArabic } from './text.js';
import { analyzeSentence, explainStyle, STYLE_INFO } from './styles.js';
import { DEFAULT_RULES, compileSimpleRule } from './rules.js';
export { MARK_GUIDE } from './rules-marks.js';
import { CUSTOM_RULES } from './custom-rules.js';

export { STYLE_INFO, explainStyle };

const PRIORITY = { grammar: 3, spelling: 3, punctuation: 2 };
const RULE_PRIORITY = { 'quran-brackets': 2.7, 'bracket-reversed': 2.6, 'end-mark': 2.5, 'latin-punct': 2.4 };

export const CATEGORY_LABEL = { punctuation: 'ترقيم', grammar: 'نحو', spelling: 'إملاء' };

export function issueKey(text, i) {
  return `${i.ruleId}|${text.slice(i.anchorStart, i.anchorEnd)}|${i.replacement}`;
}

// Two edits conflict if their ranges overlap, or if both insert at the same point.
function overlaps(a, b) {
  if (a.start === a.end && b.start === b.end) return a.start === b.start;
  if (a.start === a.end) return b.start < a.start && a.start < b.end;
  if (b.start === b.end) return a.start < b.start && b.start < a.end;
  return a.start < b.end && b.start < a.end;
}

function resolve(issues) {
  const score = (i) => (RULE_PRIORITY[i.ruleId] ?? PRIORITY[i.category] ?? 1) + (i.source === 'ai' ? -1 : 0) + i.confidence / 10;
  const sorted = [...issues].sort((a, b) => score(b) - score(a));
  const kept = [];
  for (const i of sorted) if (!kept.some((k) => overlaps(k, i))) kept.push(i);
  return kept.sort((a, b) => a.anchorStart - b.anchorStart || a.start - b.start);
}

export function createEngine({ rules = DEFAULT_RULES, customRules = CUSTOM_RULES, minConfidence = 0.5 } = {}) {
  const ruleList = [...rules, ...customRules.map(compileSimpleRule)];
  const providers = [];

  function parse(text) {
    const sentences = splitSentences(text);
    for (const s of sentences) s.analysis = hasArabic(s.text) ? analyzeSentence(s) : { styles: [], expected: null, vocLen: 0 };
    return { text, sentences };
  }

  function runRules(doc) {
    const out = [];
    for (const r of ruleList) {
      try {
        for (const i of r.check(doc)) {
          i.original = doc.text.slice(i.start, i.end);
          i.anchorText = doc.text.slice(i.anchorStart, i.anchorEnd);
          if (i.confidence >= minConfidence) out.push(i);
        }
      } catch (e) {
        console.error(`rule ${r.id} failed`, e);
      }
    }
    return out;
  }

  function finish(doc, issues, ignored) {
    const visible = issues.filter((i) => !ignored?.has(issueKey(doc.text, i)));
    const resolved = resolve(visible);
    resolved.forEach((i, n) => { i.id = `${i.ruleId}@${i.start}-${i.end}#${n}`; i.key = issueKey(doc.text, i); });
    return { text: doc.text, sentences: doc.sentences, issues: resolved };
  }

  return {
    rules: ruleList,
    providers,
    addRule(rule) { ruleList.push(rule.check ? rule : compileSimpleRule(rule)); },
    addProvider(p) { providers.push(p); },
    removeProvider(p) { const i = providers.indexOf(p); if (i >= 0) providers.splice(i, 1); },

    /** Rules only — fast enough to run on every keystroke. */
    analyze(text, { ignored } = {}) {
      const doc = parse(text);
      return finish(doc, runRules(doc), ignored);
    },

    /**
     * Rules + AI providers. A provider is either
     *   { name, predictPunctuation(words[]) → Promise<[{mark, prob}]> }  (per-word marks)
     * or
     *   { name, analyze(doc) → Promise<Issue[]> }                         (any other model, e.g. an LLM)
     */
    async analyzeAsync(text, { ignored, signal } = {}) {
      const doc = parse(text);
      let issues = runRules(doc);
      for (const p of providers) {
        if (signal?.aborted) break;
        try {
          if (p.predictPunctuation) {
            const { mergePunctuationPredictions } = await import('./ai-merge.js');
            const preds = [];
            for (const s of doc.sentences) {
              preds.push(hasArabic(s.text) && s.tokens.length ? await p.predictPunctuation(s.tokens.map((t) => t.text)) : null);
              if (signal?.aborted) break;
            }
            issues = mergePunctuationPredictions(doc, issues, preds, p.name);
          }
          if (p.analyze) {
            const extra = await p.analyze(doc);
            for (const i of extra) {
              i.source = 'ai';
              i.anchorStart ??= i.start; i.anchorEnd ??= i.end;
              i.original = text.slice(i.start, i.end);
              i.anchorText = text.slice(i.anchorStart, i.anchorEnd);
              issues.push(i);
            }
          }
        } catch (e) {
          console.error(`provider ${p.name} failed`, e);
        }
      }
      return finish(doc, issues, ignored);
    },
  };
}

/** Apply one issue to the text. */
export function applyIssue(text, i) {
  return text.slice(0, i.start) + i.replacement + text.slice(i.end);
}

/** Apply several non-overlapping issues (back to front so offsets stay valid). */
export function applyAll(text, issues) {
  return [...issues].sort((a, b) => b.start - a.start || b.end - a.end).reduce(applyIssue, text);
}

// Built-in rules. A rule is { id, category, title, check(doc) → Issue[] }.
//
// Issue = {
//   ruleId, category: 'punctuation' | 'grammar' | 'spelling',
//   severity: 'error' | 'warning' | 'hint',
//   start, end, replacement,      // the edit: text[start:end] → replacement
//   anchorStart, anchorEnd,       // what to underline (defaults to start/end)
//   title, explanation,           // short label + the «why» shown to the user
//   confidence, source: 'rule' | 'ai'
// }
// Zero-width edits (start === end) are insertions, e.g. a missing «؟».

import * as L from './lexicon.js';
import { plain, key, hasArabic, isDefinite } from './text.js';
import { explainStyle, STYLE_INFO } from './styles.js';
import { MARK_RULES } from './rules-marks.js';

const AR = '\\u0621-\\u064A';
const issue = (o) => ({ severity: 'error', confidence: 0.9, source: 'rule', anchorStart: o.start, anchorEnd: o.end, ...o });

// ───────────────────────── punctuation ─────────────────────────

const LATIN_TO_AR = { ',': '،', '?': '؟', ';': '؛' };

const latinPunct = {
  id: 'latin-punct',
  category: 'punctuation',
  title: 'علامة ترقيم لاتينية',
  check({ text }) {
    const out = [];
    const re = new RegExp(`(?<=[${AR}][\\s]*)[,?;]|[,?;](?=\\s*[${AR}])`, 'g');
    let m;
    while ((m = re.exec(text))) {
      const ar = LATIN_TO_AR[m[0]];
      out.push(issue({
        ruleId: this.id, category: this.category, title: this.title,
        start: m.index, end: m.index + 1, replacement: ar,
        explanation: `في النص العربي تُستخدم العلامة العربية «${ar}» بدلًا من العلامة اللاتينية «${m[0]}»؛ فهي مقلوبة الاتجاه لتناسب الكتابة من اليمين إلى اليسار.`,
      }));
    }
    return out;
  },
};

const spaceBeforePunct = {
  id: 'space-before-punct',
  category: 'punctuation',
  title: 'مسافة قبل علامة الترقيم',
  check({ text }) {
    const out = [];
    const re = new RegExp(`(?<=[${AR}])([ \\t]+)([،؛:؟!.,?;])(?!\\.)`, 'g');
    let m;
    while ((m = re.exec(text))) {
      out.push(issue({
        ruleId: this.id, category: this.category, title: this.title, severity: 'warning',
        start: m.index, end: m.index + m[0].length, replacement: m[2],
        anchorStart: m.index - 1,
        explanation: 'علامات الترقيم (، ؛ : ؟ ! .) تلتصق بالكلمة التي قبلها ولا تُترك قبلها مسافة، ثم تأتي المسافة بعدها.',
      }));
    }
    return out;
  },
};

const spaceAfterPunct = {
  id: 'space-after-punct',
  category: 'punctuation',
  title: 'لا توجد مسافة بعد علامة الترقيم',
  check({ text }) {
    const out = [];
    const re = new RegExp(`(?<=[${AR}])([،؛:؟!.])(?=[${AR}])`, 'g');
    let m;
    while ((m = re.exec(text))) {
      out.push(issue({
        ruleId: this.id, category: this.category, title: this.title, severity: 'warning',
        start: m.index + 1, end: m.index + 1, replacement: ' ',
        anchorStart: m.index, anchorEnd: m.index + 1,
        explanation: 'يجب ترك مسافة واحدة بعد علامة الترقيم لتنفصل عن الكلمة التالية.',
      }));
    }
    return out;
  },
};

const repeatedPunct = {
  id: 'repeated-punct',
  category: 'punctuation',
  title: 'علامة ترقيم مكررة',
  check({ text }) {
    const out = [];
    const re = /([،؛:؟!?,])\1+|(?<!\.)\.{2}(?!\.)|\.{4,}/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[0] === '...' ) continue;
      const one = m[0][0] === '.' ? (m[0].length >= 4 ? '...' : '.') : m[0][0];
      out.push(issue({
        ruleId: this.id, category: this.category, title: this.title, severity: 'warning',
        start: m.index, end: m.index + m[0].length, replacement: one,
        explanation: 'لا تُكرَّر علامة الترقيم؛ تكفي علامة واحدة. (يجوز الجمع بين «؟!» للاستفهام المصحوب بالتعجب، والنقاط الثلاث «...» للحذف.)',
      }));
    }
    return out;
  },
};

const endMark = {
  id: 'end-mark',
  category: 'punctuation',
  check({ text, sentences }) {
    const out = [];
    sentences.forEach((s, idx) => {
      const exp = s.analysis.expected;
      if (!exp || !hasArabic(s.text) || !s.tokens.length) return;
      const last = s.tokens[s.tokens.length - 1];
      const mark = s.mark.replace(/\?/g, '؟');
      const why = exp.style.type === 'statement' ? STYLE_INFO.statement.why : explainStyle(exp.style);
      const isLastInText = idx === sentences.length - 1 && text.slice(s.end).trim() === '';

      if (!mark) {
        if (exp.style.type === 'statement' && s.tokens.length < 3) return;
        out.push(issue({
          ruleId: this.id, category: this.category,
          title: exp.mark === '.' ? 'نقطة ناقصة في نهاية الجملة' : `علامة ${exp.mark === '؟' ? 'استفهام' : 'تعجب'} ناقصة`,
          severity: isLastInText ? 'hint' : 'warning',
          start: s.bodyEnd, end: s.bodyEnd, replacement: exp.mark,
          anchorStart: last.start, anchorEnd: last.end,
          explanation: why, confidence: exp.confidence, style: exp.style, sentenceIndex: idx,
        }));
        return;
      }
      if (mark.includes('…') || mark.includes('...') || (mark.includes('؟') && mark.includes('!'))) return;
      if (exp.mark === '.' || exp.confidence < 0.8) return; // don't fight the writer over «.» vs «!»
      if (mark.replace(/(.)\1+/g, '$1') === exp.mark) return;
      out.push(issue({
        ruleId: this.id, category: this.category,
        title: `علامة الترقيم في نهاية الجملة يجب أن تكون «${exp.mark}»`,
        start: s.bodyEnd, end: s.markEnd, replacement: exp.mark,
        anchorStart: last.start, anchorEnd: s.markEnd,
        explanation: why, confidence: exp.confidence, style: exp.style, sentenceIndex: idx,
      }));
    });
    return out;
  },
};

const vocativeComma = {
  id: 'vocative-comma',
  category: 'punctuation',
  title: 'فاصلة بعد المنادى',
  check({ sentences }) {
    const out = [];
    for (const s of sentences) {
      const n = s.analysis.vocLen;
      if (!n || s.tokens.length <= n) continue;
      const t = s.tokens[n - 1];
      if (t.after) continue;
      const voc = s.tokens.slice(0, n).map((x) => x.text).join(' ');
      out.push(issue({
        ruleId: this.id, category: this.category, title: this.title, severity: 'warning',
        start: t.end, end: t.end, replacement: '،',
        anchorStart: s.tokens[0].start, anchorEnd: t.end,
        explanation: `«${voc}» أسلوب نداء؛ ويُفصل المنادى عن الكلام الذي بعده بفاصلة (،).`,
        confidence: 0.9,
      }));
    }
    return out;
  },
};

// ───────────────────────── spelling ─────────────────────────

const spellingDict = {
  id: 'spelling-dict',
  category: 'spelling',
  title: 'خطأ إملائي شائع',
  check({ sentences }) {
    const out = [];
    for (const s of sentences) for (const t of s.tokens) {
      let p = plain(t.text);
      let prefix = '';
      let fix = L.SPELLING_FIXES[p];
      if (!fix && p.length > 2 && /^[وف]/.test(p)) { prefix = p[0]; fix = L.SPELLING_FIXES[p.slice(1)]; }
      if (!fix) continue;
      out.push(issue({
        ruleId: this.id, category: this.category, title: this.title,
        start: t.start, end: t.end, replacement: prefix + fix[0], explanation: fix[1],
      }));
    }
    return out;
  },
};

// Masdar of افتعل / انفعل / استفعل starts with hamzat wasl: «الإهتمام» → «الاهتمام».
const WASL_RE = new RegExp(`^([وفبل]?(?:ال|لل)?)إ((?:ست[${AR}]{3,}|[${AR}][تطد][${AR}]ا[${AR}]|ن[${AR}]{2}ا[${AR}])(?:ي|ية|يا|ات|يات|ه|ها|هم|ك|نا)?)$`);
// Foreign names that really start with «إست…» (Estonia, Istanbul …).
const WASL_LOANWORDS = /إستون|إستانبول|إسطنبول|إستر|إستاد/;
const hamzatWasl = {
  id: 'hamzat-wasl',
  category: 'spelling',
  title: 'همزة وصل كُتبت همزة قطع',
  check({ sentences }) {
    const out = [];
    for (const s of sentences) for (const t of s.tokens) {
      const m = plain(t.text).match(WASL_RE);
      if (!m || WASL_LOANWORDS.test(plain(t.text))) continue;
      out.push(issue({
        ruleId: this.id, category: this.category, title: this.title,
        start: t.start, end: t.end, replacement: m[1] + 'ا' + m[2],
        explanation: 'مصادر الأفعال الخماسية والسداسية (مثل: اهتمام، انتظار، استخدام) تبدأ بهمزة وصل، فلا تُكتب الهمزة تحت الألف.',
        confidence: 0.85,
      }));
    }
    return out;
  },
};

const phraseFixes = {
  id: 'phrase-fix',
  category: 'spelling',
  title: 'خطأ إملائي شائع',
  check({ text }) {
    const out = [];
    for (const f of L.PHRASE_FIXES) {
      f.pattern.lastIndex = 0;
      let m;
      while ((m = f.pattern.exec(text))) {
        const start = m.index + m[1].length;
        if (m[2] === f.replacement) continue;
        out.push(issue({ ruleId: this.id, category: this.category, title: this.title, start, end: start + m[2].length, replacement: f.replacement, explanation: f.explanation }));
      }
    }
    return out;
  },
};

// ───────────────────────── grammar ─────────────────────────

const stem = (w) => plain(w).replace(/^[وفبكل]?(ال|لل)/, '');
const FEM_PL_ALLOW = new Set([...L.FEM_PLURAL_ALLOW].map(plain));
function isFemPlural(w) {
  const p = plain(w);
  if (FEM_PL_ALLOW.has(p) || FEM_PL_ALLOW.has(stem(w))) return true;
  const s = stem(w);
  if (!s.endsWith('ات') || s.length < 5) return false;
  if (s.length === 5 && s[0] === 'أ' && s[3] === 'ا') return false; // أفعال: أصوات، أوقات
  return true;
}
const isMascPluralWaw = (w) => stem(w).endsWith('ون') && stem(w).length >= 6;
const isMascPluralYa = (w) => stem(w).endsWith('ين') && stem(w).length >= 6;
const isPredicateCandidate = (w) => !isDefinite(w) && !/^(في|على|من|إلى|عن|مع|عند|لدى|هنا|هناك|قد|لا|لم|لن|ما)$/.test(plain(w));
const INNA = new Set([...L.INNA_SISTERS].map(plain).concat(['ان', 'وان', 'فان']));
const swapEnding = (word, from, to) => word.slice(0, word.length - from.length) + to;

const innaAgreement = {
  id: 'inna-agreement',
  category: 'grammar',
  check({ sentences }) {
    const out = [];
    const push = (o) => out.push(issue({ ruleId: this.id, category: this.category, confidence: 0.8, ...o }));
    for (const s of sentences) {
      const tk = s.tokens;
      for (let i = 0; i < tk.length; i++) {
        const isInna = INNA.has(plain(tk[i].text)) && !tk[i].after;
        const clauseStart = i === 0 || /[،,؛;:]/.test(tk[i - 1].after);
        // ism / mubtada + khabar positions
        let a, b, ctx;
        if (isInna && tk[i + 1] && tk[i + 2]) { a = tk[i + 1]; b = tk[i + 2]; ctx = `«${tk[i].text}»`; }
        else if (clauseStart && tk[i + 1] && isDefinite(tk[i].text) && tk.length <= i + 4) { a = tk[i]; b = tk[i + 1]; ctx = null; }
        else continue;
        if (a.after) continue;
        const bp = plain(b.text);

        // اسم إنّ جمع مذكر سالم منصوب بالياء: «إن المعلمون» → «إن المعلمين»
        if (ctx && isMascPluralWaw(a.text) && isDefinite(a.text)) {
          push({
            title: `اسم ${ctx} منصوب`,
            start: a.start, end: a.end, replacement: swapEnding(plain(a.text), 'ون', 'ين'),
            explanation: `«${a.text}» اسم ${ctx}، واسم إنّ وأخواتها منصوب، وجمع المذكر السالم يُنصب بالياء: «${swapEnding(plain(a.text), 'ون', 'ين')}».`,
          });
        }
        if (!isPredicateCandidate(b.text)) continue;
        const role = ctx ? `خبر ${ctx}` : 'الخبر';
        const subj = ctx ? `اسم ${ctx}` : 'المبتدأ';

        if (isFemPlural(a.text) && (bp.endsWith('ون') || bp.endsWith('ين')) && bp.length >= 5) {
          const fix = bp.slice(0, -2) + 'ات';
          push({
            title: 'عدم تطابق المذكر والمؤنث',
            start: b.start, end: b.end, replacement: fix,
            explanation: `${role} يطابق ${subj} في التذكير والتأنيث والعدد. «${a.text}» جمع مؤنث، فالصواب «${fix}» لا «${b.text}» (جمع مذكر).`,
          });
        } else if ((isMascPluralWaw(a.text) || isMascPluralYa(a.text)) && bp.endsWith('ات') && bp.length >= 5 && !isFemPlural(a.text)) {
          const fix = bp.slice(0, -2) + 'ون';
          push({
            title: 'عدم تطابق المذكر والمؤنث',
            start: b.start, end: b.end, replacement: fix,
            explanation: `${role} يطابق ${subj} في التذكير والعدد. «${a.text}» جمع مذكر، فالصواب «${fix}».`,
          });
        } else if (ctx && (isMascPluralWaw(a.text) || isMascPluralYa(a.text)) && bp.endsWith('ين') && bp.length >= 6) {
          const fix = bp.slice(0, -2) + 'ون';
          push({
            title: `خبر ${ctx} مرفوع`,
            start: b.start, end: b.end, replacement: fix,
            explanation: `خبر إنّ وأخواتها مرفوع، وجمع المذكر السالم يُرفع بالواو: «${fix}».`,
          });
        }
      }
    }
    return out;
  },
};

const MASC_TA = new Set([...L.MASCULINE_TA_MARBUTA].map(plain));
const isFemSingularDefinite = (w) => isDefinite(w) && /ة$/.test(plain(w)) && !MASC_TA.has(plain(w)) && !MASC_TA.has('ال' + stem(w));

const demonstrativeAgreement = {
  id: 'demonstrative-agreement',
  category: 'grammar',
  title: 'اسم الإشارة لا يطابق المشار إليه',
  check({ sentences }) {
    const out = [];
    const pairs = { 'هذا': 'هذه', 'ذلك': 'تلك', 'وهذا': 'وهذه', 'وذلك': 'وتلك' };
    for (const s of sentences) s.tokens.forEach((t, i) => {
      const fix = pairs[plain(t.text)];
      const next = s.tokens[i + 1];
      if (!fix || !next || t.after || !isFemSingularDefinite(next.text)) return;
      out.push(issue({
        ruleId: this.id, category: this.category, title: this.title,
        start: t.start, end: t.end, replacement: fix, anchorEnd: next.end, confidence: 0.85,
        explanation: `«${next.text}» اسم مؤنث، واسم الإشارة يطابق المشار إليه في التذكير والتأنيث؛ فنقول «${fix} ${next.text}».`,
      }));
    });
    return out;
  },
};

// Nouns that often head an إضافة, so a following «الذي» may describe them, not the feminine noun.
const CONSTRUCT_HEADS = /^(شكل|أشكال|نوع|أنواع|أحد|بعض|كل|جميع|معظم|أكثر|عدد|قسم|جزء|أجزاء|مبنى|موضوع|مركز|رئيس|مدير|عضو|أعضاء|مجلس|برنامج|نظام|فريق|كتاب|باب|فصل)$/;
const relativeAgreement = {
  id: 'relative-agreement',
  category: 'grammar',
  title: 'الاسم الموصول لا يطابق ما قبله',
  check({ sentences }) {
    const out = [];
    for (const s of sentences) s.tokens.forEach((t, i) => {
      const prev = s.tokens[i - 1];
      if (plain(t.text) !== 'الذي' || !prev || prev.after || !isFemSingularDefinite(prev.text)) return;
      const head = s.tokens[i - 2];
      if (head && !head.after && CONSTRUCT_HEADS.test(plain(head.text))) return; // «شكل من أشكال القيادة الذي»: الذي → أشكال
      out.push(issue({
        ruleId: this.id, category: this.category, title: this.title,
        start: t.start, end: t.end, replacement: 'التي', anchorStart: prev.start, confidence: 0.85,
        explanation: `«${prev.text}» مؤنث، فيُستخدم معه الاسم الموصول «التي» لا «الذي».`,
      }));
    });
    return out;
  },
};

const verbSubjectGender = {
  id: 'verb-subject-gender',
  category: 'grammar',
  title: 'تأنيث الفعل مع الفاعل المؤنث',
  check({ sentences }) {
    const out = [];
    for (const s of sentences) s.tokens.forEach((t, i) => {
      let p = plain(t.text);
      let prefix = '';
      if (!L.INTRANSITIVE_PAST_VERBS.has(p) && /^[وف]/.test(p) && L.INTRANSITIVE_PAST_VERBS.has(p.slice(1))) { prefix = p[0]; p = p.slice(1); }
      const next = s.tokens[i + 1];
      if (!L.INTRANSITIVE_PAST_VERBS.has(p) || !next || t.after || !isFemSingularDefinite(next.text)) return;
      const fix = prefix + (p.endsWith('ى') ? p.slice(0, -1) + 'ت' : p + 'ت');
      out.push(issue({
        ruleId: this.id, category: this.category, title: this.title,
        start: t.start, end: t.end, replacement: fix, anchorEnd: next.end,
        confidence: L.LOW_CONFIDENCE_VERBS.has(p) ? 0.6 : 0.8,
        explanation: `الفاعل «${next.text}» مؤنث وجاء بعد الفعل مباشرة، فتلحق الفعلَ تاءُ التأنيث الساكنة: «${fix} ${next.text}».`,
      }));
    });
    return out;
  },
};

export const DEFAULT_RULES = [
  latinPunct, spaceBeforePunct, spaceAfterPunct, repeatedPunct, endMark, vocativeComma,
  spellingDict, hamzatWasl, phraseFixes,
  innaAgreement, demonstrativeAgreement, relativeAgreement, verbSubjectGender,
  ...MARK_RULES,
];

/**
 * Turn a simple declarative rule into a rule object, so new rules can be added
 * without writing code:
 *   { id, category, find: 'كلمة' | /regex/g, replace: 'بديل' | (m)=>…, title, explanation }
 * String `find` matches whole words only.
 */
export function compileSimpleRule(def) {
  const re = def.find instanceof RegExp
    ? new RegExp(def.find.source, def.find.flags.includes('g') ? def.find.flags : def.find.flags + 'g')
    : new RegExp(`(?<![${AR}])${def.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![${AR}])`, 'g');
  return {
    id: def.id,
    category: def.category || 'spelling',
    title: def.title || 'قاعدة مخصصة',
    check({ text }) {
      const out = [];
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const replacement = typeof def.replace === 'function' ? def.replace(m) : m[0].replace(new RegExp(re.source, re.flags.replace('g', '')), def.replace);
        if (replacement === m[0]) continue;
        out.push(issue({
          ruleId: def.id, category: this.category, title: this.title, severity: def.severity || 'error',
          start: m.index, end: m.index + m[0].length, replacement, explanation: def.explanation || '', confidence: def.confidence ?? 0.9,
        }));
        if (!m[0].length) re.lastIndex++;
      }
      return out;
    },
  };
}

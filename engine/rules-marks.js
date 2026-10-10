// Rules for the remaining Arabic punctuation marks (علامات الترقيم):
// quotation marks « » " ", brackets ( ) [ ] ﴿ ﴾, colon, semicolon, comma after
// openers and answer words, dash, and the ellipsis.

import * as L from './lexicon.js';
import { plain, key, isDefinite, stripConj } from './text.js';

const AR = '\\u0621-\\u064A';
const issue = (o) => ({ severity: 'warning', confidence: 0.85, source: 'rule', category: 'punctuation', anchorStart: o.start, anchorEnd: o.end, ...o });

// Paragraphs (lines) with their offsets.
function paragraphs(text) {
  const out = [];
  let start = 0;
  for (const line of text.split('\n')) {
    out.push({ text: line, start });
    start += line.length + 1;
  }
  return out;
}
const sentenceAt = (sentences, pos) => sentences.find((s) => s.start <= pos && pos <= s.end);

// ───────────── quotation marks ─────────────

const quotes = {
  id: 'quotes',
  check({ text, sentences }) {
    const out = [];
    const why = {
      open: 'علامتا التنصيص تأتيان زوجًا: تُفتح قبل الكلام المنقول وتُغلق بعده. هذه العلامة فُتحت ولم تُغلق.',
      close: 'علامتا التنصيص تأتيان زوجًا. هذه علامة إغلاق لا تقابلها علامة فتح.',
      space: 'لا توضع مسافة بين علامة التنصيص والكلام الذي بداخلها: «هكذا».',
      outer: 'تُترك مسافة بين علامة التنصيص والكلمة التي قبلها أو بعدها.',
    };
    for (const p of paragraphs(text)) {
      if (!/[ء-ي]/.test(p.text)) continue;
      // « » balance
      const stack = [];
      for (let i = 0; i < p.text.length; i++) {
        const c = p.text[i];
        if (c === '«') stack.push(p.start + i);
        else if (c === '»') {
          if (stack.length) stack.pop();
          else {
            const s = sentenceAt(sentences, p.start + i);
            const at = s && s.start < p.start + i ? s.start : p.start;
            out.push(issue({ ruleId: 'quote-unopened', title: 'علامة تنصيص غير مفتوحة', start: at, end: at, replacement: '«', anchorStart: p.start + i, anchorEnd: p.start + i + 1, explanation: why.close, confidence: 0.75 }));
          }
        }
      }
      for (const pos of stack) {
        const s = sentenceAt(sentences, pos);
        const at = s && s.bodyEnd > pos ? s.bodyEnd : p.start + p.text.length;
        out.push(issue({ ruleId: 'quote-unclosed', title: 'علامة تنصيص غير مغلقة', start: at, end: at, replacement: '»', anchorStart: pos, anchorEnd: pos + 1, explanation: why.open, confidence: 0.75 }));
      }
      // straight quotes: odd = opening, even = closing
      const dq = [...p.text.matchAll(/"/g)].map((m) => p.start + m.index);
      dq.forEach((pos, n) => {
        const opening = n % 2 === 0;
        const rel = pos - p.start;
        if (opening && /\s/.test(p.text[rel + 1] || '') && n + 1 < dq.length) {
          const len = p.text.slice(rel + 1).match(/^\s+/)[0].length;
          out.push(issue({ ruleId: 'quote-space', title: 'مسافة داخل علامتي التنصيص', start: pos + 1, end: pos + 1 + len, replacement: '', anchorStart: pos, anchorEnd: pos + 1 + len, explanation: why.space, severity: 'hint' }));
        }
        if (!opening && /\s/.test(p.text[rel - 1] || '')) {
          const len = p.text.slice(0, rel).match(/\s+$/)[0].length;
          out.push(issue({ ruleId: 'quote-space', title: 'مسافة داخل علامتي التنصيص', start: pos - len, end: pos, replacement: '', anchorStart: pos - len, anchorEnd: pos + 1, explanation: why.space, severity: 'hint' }));
        }
      });
      if (dq.length % 2 === 1) {
        const pos = dq[dq.length - 1];
        const s = sentenceAt(sentences, pos);
        const at = s && s.bodyEnd > pos ? s.bodyEnd : p.start + p.text.length;
        out.push(issue({ ruleId: 'quote-unclosed', title: 'علامة تنصيص غير مغلقة', start: at, end: at, replacement: '"', anchorStart: pos, anchorEnd: pos + 1, explanation: why.open, confidence: 0.6, severity: 'hint' }));
      }
    }
    // « » inner and outer spacing
    for (const m of text.matchAll(/«([ \t]+)/g)) out.push(issue({ ruleId: 'quote-space', title: 'مسافة داخل علامتي التنصيص', start: m.index + 1, end: m.index + m[0].length, replacement: '', anchorStart: m.index, anchorEnd: m.index + m[0].length, explanation: why.space }));
    for (const m of text.matchAll(/([ \t]+)»/g)) out.push(issue({ ruleId: 'quote-space', title: 'مسافة داخل علامتي التنصيص', start: m.index, end: m.index + m[1].length, replacement: '', anchorStart: m.index, anchorEnd: m.index + m[0].length, explanation: why.space }));
    for (const m of text.matchAll(new RegExp(`(?<=[${AR}])«`, 'g'))) out.push(issue({ ruleId: 'quote-space', title: 'مسافة قبل علامة التنصيص', start: m.index, end: m.index, replacement: ' ', anchorStart: m.index - 1, anchorEnd: m.index + 1, explanation: why.outer, severity: 'hint' }));
    for (const m of text.matchAll(new RegExp(`»(?=[${AR}])`, 'g'))) out.push(issue({ ruleId: 'quote-space', title: 'مسافة بعد علامة التنصيص', start: m.index + 1, end: m.index + 1, replacement: ' ', anchorStart: m.index, anchorEnd: m.index + 2, explanation: why.outer, severity: 'hint' }));
    return out;
  },
};

// ───────────── brackets ( ) [ ] ﴿ ﴾ ─────────────

const PAIRS = [
  { open: '(', close: ')', name: 'القوسين الهلاليين ( )', use: 'يوضع بينهما التفسير والكلام الاعتراضي غير الأساسي والأرقام والتواريخ.' },
  { open: '[', close: ']', name: 'القوسين المعقوفين [ ]', use: 'يوضع بينهما ما يضيفه الكاتب إلى نص منقول من شرح أو زيادة.' },
  { open: '﴿', close: '﴾', name: 'القوسين المزهرين ﴿ ﴾', use: 'تُكتب بينهما الآيات القرآنية الكريمة.' },
];
const esc = (c) => c.replace(/[()[\]]/g, '\\$&');

const brackets = {
  id: 'brackets',
  check({ text, sentences }) {
    const out = [];
    for (const b of PAIRS) {
      const O = esc(b.open), C = esc(b.close);
      // reversed pair (common when typing right-to-left): «)نص(» → «(نص)»
      const reversed = new RegExp(`${C}([^${O}${C}\\n]*[${AR}][^${O}${C}\\n]*)${O}`, 'g');
      const swapped = new Set();
      for (const m of text.matchAll(reversed)) {
        swapped.add(m.index); swapped.add(m.index + m[0].length - 1);
        out.push(issue({ ruleId: 'bracket-reversed', title: 'القوسان مقلوبان', start: m.index, end: m.index + m[0].length, replacement: b.open + m[1] + b.close, explanation: `فُتح ${b.name} بعلامة الإغلاق وأُغلقا بعلامة الفتح. في الكتابة العربية يُكتب القوس الأول قبل الكلام والثاني بعده. ${b.use}`, confidence: 0.85 }));
      }
      // balance per paragraph
      for (const p of paragraphs(text)) {
        if (!/[ء-ي]/.test(p.text)) continue;
        const stack = [];
        for (let i = 0; i < p.text.length; i++) {
          const pos = p.start + i;
          if (swapped.has(pos)) continue;
          if (p.text[i] === b.open) stack.push(pos);
          else if (p.text[i] === b.close) {
            if (stack.length) stack.pop();
            else if (!/^\s*\d+$/.test(p.text.slice(0, i))) { // «1)» numbering is fine
              const s = sentenceAt(sentences, pos);
              const at = s && s.start < pos ? s.start : p.start;
              out.push(issue({ ruleId: 'bracket-unopened', title: 'قوس غير مفتوح', start: at, end: at, replacement: b.open, anchorStart: pos, anchorEnd: pos + 1, explanation: `${b.name} يأتيان زوجًا؛ وهذا قوس إغلاق بلا قوس فتح. ${b.use}`, confidence: 0.7 }));
            }
          }
        }
        for (const pos of stack) {
          const s = sentenceAt(sentences, pos);
          const at = s && s.bodyEnd > pos ? s.bodyEnd : p.start + p.text.length;
          out.push(issue({ ruleId: 'bracket-unclosed', title: 'قوس غير مغلق', start: at, end: at, replacement: b.close, anchorStart: pos, anchorEnd: pos + 1, explanation: `${b.name} يأتيان زوجًا؛ وهذا القوس فُتح ولم يُغلق. ${b.use}`, confidence: 0.75 }));
        }
      }
      // spacing inside / outside (skipped for reversed pairs: the swap fixes those)
      for (const m of text.matchAll(new RegExp(`${O}([ \\t]+)`, 'g'))) if (!swapped.has(m.index)) out.push(issue({ ruleId: 'bracket-space', title: 'مسافة داخل القوسين', start: m.index + 1, end: m.index + m[0].length, replacement: '', anchorStart: m.index, anchorEnd: m.index + m[0].length, explanation: `لا توضع مسافة بين القوس والكلام الذي بداخله. ${b.use}`, severity: 'hint' }));
      for (const m of text.matchAll(new RegExp(`([ \\t]+)${C}`, 'g'))) if (!swapped.has(m.index + m[1].length)) out.push(issue({ ruleId: 'bracket-space', title: 'مسافة داخل القوسين', start: m.index, end: m.index + m[1].length, replacement: '', anchorStart: m.index, anchorEnd: m.index + m[0].length, explanation: `لا توضع مسافة بين القوس والكلام الذي بداخله. ${b.use}`, severity: 'hint' }));
      for (const m of text.matchAll(new RegExp(`(?<=[${AR}])${O}`, 'g'))) if (!swapped.has(m.index)) out.push(issue({ ruleId: 'bracket-space', title: 'مسافة قبل القوس', start: m.index, end: m.index, replacement: ' ', anchorStart: m.index - 1, anchorEnd: m.index + 1, explanation: 'تُترك مسافة بين القوس والكلمة التي قبله.', severity: 'hint' }));
      for (const m of text.matchAll(new RegExp(`${C}(?=[${AR}])`, 'g'))) if (!swapped.has(m.index)) out.push(issue({ ruleId: 'bracket-space', title: 'مسافة بعد القوس', start: m.index + 1, end: m.index + 1, replacement: ' ', anchorStart: m.index, anchorEnd: m.index + 2, explanation: 'تُترك مسافة بين القوس والكلمة التي بعده.', severity: 'hint' }));
    }
    return out;
  },
};

// Quranic verses go between ﴿ ﴾: «قال تعالى: (…)» → «قال تعالى: ﴿…﴾»
const quranBrackets = {
  id: 'quran-brackets',
  check({ text }) {
    const out = [];
    const re = new RegExp(`(تعالى|عز وجل|سبحانه وتعالى|جل جلاله|جل وعلا|قوله)([\\s:]*)(«|"|\\()([^«»"()﴿﴾\\n]{2,400}?)(»|"|\\))`, 'g');
    const match = { '«': '»', '"': '"', '(': ')' };
    for (const m of text.matchAll(re)) {
      if (match[m[3]] !== m[5] || !/[ء-ي]/.test(m[4])) continue;
      const start = m.index + m[1].length + m[2].length;
      const end = m.index + m[0].length;
      out.push(issue({
        ruleId: 'quran-brackets', title: 'الآية القرآنية بين قوسين مزهرين',
        start, end, replacement: '﴿' + m[4].trim() + '﴾',
        explanation: 'تُكتب الآيات القرآنية الكريمة بين القوسين المزهرين ﴿ ﴾ تمييزًا لها عن غيرها من النصوص المقتبسة، التي توضع بين علامتي التنصيص « ».',
        confidence: 0.85,
      }));
    }
    return out;
  },
};

// ───────────── colon ─────────────

const SPEECH = new Set([...L.SPEECH_VERBS].map(plain));
const colon = {
  id: 'colon',
  check({ sentences, text }) {
    const out = [];
    for (const s of sentences) {
      const tk = s.tokens;
      tk.forEach((t, i) => {
        // speech verb … then quoted speech without «:»
        if (/^[«"]/.test(t.after) && !t.after.includes(':')) {
          const from = Math.max(0, i - 4);
          if (tk.slice(from, i + 1).some((x) => SPEECH.has(plain(stripConj(x.text))))) {
            out.push(issue({
              ruleId: 'colon-speech', title: 'نقطتان قبل الكلام المنقول', start: t.end, end: t.end, replacement: ':', anchorStart: t.start, anchorEnd: t.end,
              explanation: 'توضع النقطتان الرأسيتان (:) بعد فعل القول وما في معناه (قال، أجاب، سأل…) قبل الكلام المنقول.',
            }));
          }
        }
        // «كالتالي» / «ما يلي» before a list
        const p = plain(t.text);
        const listIntro = /^(كالتالي|كالآتي|كالاتي)$/.test(p) || (/^(يلي|يأتي)$/.test(p) && i > 0 && /^(ما|فيما|كما)$/.test(plain(tk[i - 1].text)));
        if (listIntro && tk[i + 1] && !t.after) {
          out.push(issue({
            ruleId: 'colon-list', title: 'نقطتان قبل التعداد', start: t.end, end: t.end, replacement: ':', anchorStart: t.start, anchorEnd: t.end,
            explanation: 'توضع النقطتان الرأسيتان (:) قبل التعداد والتفصيل، بعد عبارات مثل: «ما يلي»، «كالتالي»، «كما يأتي».',
          }));
        }
      });
    }
    // «ملاحظة …» / «مثال …» at the start of a line
    for (const p of paragraphs(text)) {
      const m = p.text.match(/^(\s*)(ملاحظة|تنبيه|مثال|تعريف|المطلوب|الخلاصة)(?=[ \t]+[ء-ي])/);
      if (m) {
        const end = p.start + m[1].length + m[2].length;
        out.push(issue({
          ruleId: 'colon-label', title: 'نقطتان بعد العنوان', start: end, end, replacement: ':', anchorStart: end - m[2].length, anchorEnd: end, severity: 'hint', confidence: 0.7,
          explanation: 'توضع النقطتان الرأسيتان (:) بعد الكلمات التي تقدّم لما بعدها، مثل: ملاحظة، تنبيه، مثال، تعريف.',
        }));
      }
    }
    return out;
  },
};

// ───────────── semicolon ─────────────

const CAUSE = new Set([...L.CAUSE_RESULT].map(plain));
const semicolon = {
  id: 'semicolon',
  check({ sentences, text }) {
    const out = [];
    for (const s of sentences) s.tokens.forEach((t, i) => {
      if (i < 3 || !CAUSE.has(plain(t.text))) return;
      const prev = s.tokens[i - 1];
      if (/^(ذلك|وذلك|هذا|وهذا|إلا|إلى|من|فقط|وما|إنما)$/.test(plain(prev.text))) return;
      const gap = text.slice(prev.end, t.start);
      const why = 'توضع الفاصلة المنقوطة (؛) بين جملتين تكون الثانية سببًا في الأولى أو نتيجة لها، كما قبل «لأن» و«لذلك»: «لم ينجح؛ لأنه لم يدرس».';
      if (!prev.after) {
        out.push(issue({ ruleId: 'semicolon-cause', title: 'فاصلة منقوطة قبل السبب أو النتيجة', start: prev.end, end: prev.end, replacement: '؛', anchorStart: prev.start, anchorEnd: t.end, explanation: why, severity: 'hint', confidence: 0.7 }));
      } else if (prev.after === '،' || prev.after === ',') {
        const k = gap.search(/[،,]/);
        out.push(issue({ ruleId: 'semicolon-cause', title: 'فاصلة منقوطة قبل السبب أو النتيجة', start: prev.end + k, end: prev.end + k + 1, replacement: '؛', anchorStart: prev.start, anchorEnd: t.end, explanation: why, severity: 'hint', confidence: 0.7 }));
      }
    });
    return out;
  },
};

// ───────────── comma after openers and answer words ─────────────

const OPENERS = L.OPENERS.map((o) => o.split(' ').map(key));
const ANSWER = new Set([...L.ANSWER_WORDS].map(plain));
const openerComma = {
  id: 'opener-comma',
  check({ sentences }) {
    const out = [];
    for (const s of sentences) {
      const tk = s.tokens;
      for (const o of OPENERS) {
        if (tk.length <= o.length || !o.every((w, j) => key(tk[j].text) === w)) continue;
        const last = tk[o.length - 1];
        if (o.slice(0, -1).some((_, j) => tk[j].after) || last.after) break;
        out.push(issue({
          ruleId: 'opener-comma', title: 'فاصلة بعد العبارة الافتتاحية', start: last.end, end: last.end, replacement: '،', anchorStart: tk[0].start, anchorEnd: last.end,
          explanation: `توضع الفاصلة بعد الألفاظ التي تفتتح الكلام أو ترتّبه، مثل: «أما بعد»، «أولًا»، «ثانيًا»، «أخيرًا»، «مثلًا».`,
          confidence: 0.85,
        }));
        break;
      }
      const t0 = tk[0], t1 = tk[1];
      if (t0 && t1 && ANSWER.has(plain(t0.text)) && !t0.after && !isDefinite(t1.text) && !/(ين|ان)$/.test(plain(t1.text))) {
        out.push(issue({
          ruleId: 'answer-comma', title: 'فاصلة بعد حرف الجواب', start: t0.end, end: t0.end, replacement: '،', anchorStart: t0.start, anchorEnd: t0.end,
          explanation: `«${t0.text}» حرف جواب، ويُفصل عن الجملة التي بعده بفاصلة: «${t0.text}، …».`,
          confidence: 0.85,
        }));
      }
    }
    return out;
  },
};

// ───────────── dash and ellipsis ─────────────

const dash = {
  id: 'dash',
  check({ text }) {
    const out = [];
    const why = 'الشرطة (-) توضع في أول السطر قبل الأرقام أو الحوار، والشرطتان تحصران الجملة الاعتراضية؛ وتُترك مسافة بين الشرطة والكلمة.';
    for (const m of text.matchAll(new RegExp(`(^|\\n)([ \\t]*)[-–—](?=[${AR}])`, 'g'))) {
      const at = m.index + m[0].length;
      out.push(issue({ ruleId: 'dash-space', title: 'مسافة بعد الشرطة', start: at, end: at, replacement: ' ', anchorStart: at - 1, anchorEnd: at + 1, explanation: why, severity: 'hint' }));
    }
    for (const m of text.matchAll(new RegExp(`(?<=[${AR}]) [-–—](?=[${AR}])`, 'g'))) {
      out.push(issue({ ruleId: 'dash-space', title: 'مسافة حول الشرطة', start: m.index + 2, end: m.index + 2, replacement: ' ', anchorStart: m.index + 1, anchorEnd: m.index + 3, explanation: why, severity: 'hint' }));
    }
    for (const m of text.matchAll(new RegExp(`(?<=[${AR}])[-–—] (?=[${AR}])`, 'g'))) {
      out.push(issue({ ruleId: 'dash-space', title: 'مسافة حول الشرطة', start: m.index, end: m.index, replacement: ' ', anchorStart: m.index - 1, anchorEnd: m.index + 1, explanation: why, severity: 'hint' }));
    }
    return out;
  },
};

const ellipsis = {
  id: 'ellipsis',
  check({ text }) {
    const out = [];
    const why = 'علامة الحذف ثلاث نقاط (...) تدل على كلام محذوف أو مسكوت عنه؛ تلتصق بالكلمة التي قبلها وتُترك بعدها مسافة.';
    for (const m of text.matchAll(new RegExp(`(?<=[${AR}])([ \\t]+)(\\.\\.\\.|…)`, 'g'))) {
      out.push(issue({ ruleId: 'ellipsis-space', title: 'مسافة قبل علامة الحذف', start: m.index, end: m.index + m[1].length, replacement: '', anchorStart: m.index - 1, anchorEnd: m.index + m[0].length, explanation: why, severity: 'hint' }));
    }
    for (const m of text.matchAll(new RegExp(`(\\.\\.\\.|…)(?=[${AR}])`, 'g'))) {
      out.push(issue({ ruleId: 'ellipsis-space', title: 'مسافة بعد علامة الحذف', start: m.index + m[0].length, end: m.index + m[0].length, replacement: ' ', anchorStart: m.index, anchorEnd: m.index + m[0].length + 1, explanation: why, severity: 'hint' }));
    }
    return out;
  },
};

export const MARK_RULES = [quotes, brackets, quranBrackets, colon, semicolon, openerComma, dash, ellipsis];

/** Reference for the in-app guide: every punctuation mark and its uses. */
export const MARK_GUIDE = [
  { mark: '.', name: 'النقطة', use: 'في نهاية الجملة التامة المعنى، وفي نهاية الفقرة.', example: 'ذهب الولد إلى المدرسة.' },
  { mark: '،', name: 'الفاصلة', use: 'بين الجمل المتعاطفة، وبعد المنادى، وبعد حرف الجواب، وبعد الألفاظ الافتتاحية، وبين جملتي الشرط والجواب إذا طالت.', example: 'يا محمد، ادرس دروسك.' },
  { mark: '؛', name: 'الفاصلة المنقوطة', use: 'بين جملتين تكون الثانية سببًا في الأولى أو نتيجة لها.', example: 'لم ينجح؛ لأنه لم يدرس.' },
  { mark: ':', name: 'النقطتان الرأسيتان', use: 'بعد القول وما في معناه قبل الكلام المنقول، وقبل التعداد والتفصيل، وبعد كلمات مثل «مثال» و«ملاحظة».', example: 'قال المعلم: «اكتبوا الدرس».' },
  { mark: '؟', name: 'علامة الاستفهام', use: 'بعد الجملة الاستفهامية.', example: 'كيف حالك؟' },
  { mark: '!', name: 'علامة التعجب', use: 'بعد جمل التعجب والانفعال، والندبة والاستغاثة، والإغراء والتحذير.', example: 'ما أجمل السماء!' },
  { mark: '« »', name: 'علامتا التنصيص', use: 'يوضع بينهما الكلام المنقول بنصه. ويجوز استخدام " ".', example: 'قال المعلم: «العلم نور».' },
  { mark: '-', name: 'الشرطة', use: 'في أول السطر قبل الأرقام والحوار، وبين العدد والمعدود في التعداد.', example: '- أولًا: الترقيم.' },
  { mark: '- -', name: 'الشرطتان', use: 'تحصران الجملة الاعتراضية.', example: 'إن العلم - أيها الطالب - نور.' },
  { mark: '( )', name: 'القوسان الهلاليان', use: 'يوضع بينهما التفسير والكلام الاعتراضي والأرقام والتواريخ.', example: 'وُلد المتنبي (915م) في الكوفة.' },
  { mark: '[ ]', name: 'القوسان المعقوفان', use: 'يوضع بينهما ما يضيفه الكاتب إلى نص منقول.', example: 'قال: «إنه [أي العلم] نور».' },
  { mark: '﴿ ﴾', name: 'القوسان المزهران', use: 'تُكتب بينهما الآيات القرآنية الكريمة.', example: 'قال تعالى: ﴿وقل ربِّ زدني علمًا﴾.' },
  { mark: '...', name: 'علامة الحذف', use: 'تدل على كلام محذوف أو مسكوت عنه.', example: 'تعلمت أشياء كثيرة: الصبر، والأمانة...' },
];

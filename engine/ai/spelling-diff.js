// Turns "original sentence → corrected sentence" (from the spelling model)
// into separate Issues with character offsets and an Arabic explanation of
// the kind of mistake (hamza, ta marbuta, joined/split words, …).

import { plain } from '../text.js';

const WORD = /[ء-غـ-ٟ٠-٩ٰ-ۓ\w]+|[^\sء-غـ-ٟ٠-٩ٰ-ۓ\w]/gu;
const isWord = (t) => /[ء-ي\w]/u.test(t);

/** Fine-grained tokens (words and single punctuation chars) with offsets. */
export function fineTokens(text, base = 0) {
  const out = [];
  let m;
  WORD.lastIndex = 0;
  while ((m = WORD.exec(text))) out.push({ text: m[0], start: base + m.index, end: base + m.index + m[0].length });
  return out;
}

/** LCS diff of two token arrays → list of differing blocks {i1,i2,j1,j2}. */
export function diffBlocks(a, b, eq = (x, y) => x === y) {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = eq(a[i], b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const blocks = [];
  let i = 0, j = 0, bi = 0, bj = 0;
  const flush = () => { if (i > bi || j > bj) blocks.push({ i1: bi, i2: i, j1: bj, j2: j }); };
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { flush(); i++; j++; bi = i; bj = j; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  i = n; j = m;
  flush();
  return blocks;
}

const HAMZA = 'اأإآءؤئ';
// Loose key for alignment: ignores hamza / ta marbuta / alef maqsura.
const k2 = (w) => plain(w).replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
// B's spacing with A's letters (same length without spaces) — isolates the
// join/split part of a change from the letter part.
function withSpacing(lettersOfA, B) {
  let k = 0;
  return [...B].map((c) => (/\s/.test(c) ? c : lettersOfA[k++])).join('');
}
const swapOnly = (a, b, set) => a.length === b.length && [...a].every((c, k) => c === b[k] || (set.includes(c) && set.includes(b[k])));

/** Classify a change and explain it. a = original words, b = corrected words. */
export function explainChange(a, b) {
  const A = plain(a), B = plain(b);
  const sA = A.replace(/\s+/g, ''), sB = B.replace(/\s+/g, '');
  if (sA === sB) {
    if ((B.match(/\s/g) || []).length < (A.match(/\s/g) || []).length) {
      const [first, second = ''] = A.split(/\s+/);
      return /^[بلكوف]$/.test(first) && second.length >= 2
        ? { category: 'spelling', title: 'وصل حرف بالكلمة', explanation: `الحرف «${first}» (من حروف الجر أو العطف المكوّنة من حرف واحد) يُكتب متصلًا بالكلمة التي بعده: «${b}».` }
        : { category: 'spelling', title: 'وصل أجزاء الكلمة', explanation: `«${b}» كلمة واحدة فتُكتب متصلة دون مسافة.` };
    }
    return { category: 'spelling', title: 'فصل الكلمات', explanation: `«${b}» كلمتان مستقلتان، فيجب الفصل بينهما بمسافة.` };
  }
  // joined/split words *and* a letter fix: «ب الصحه» → «بالصحة»
  const spaces = (x) => (x.match(/\s/g) || []).length;
  if (spaces(A) !== spaces(B) && k2(sA) === k2(sB)) {
    const join = explainChange(A, withSpacing([...sA], B));
    const letters = explainChange(sA, sB);
    return { category: 'spelling', title: `${join.title} + ${letters.title}`, explanation: `${join.explanation} ${letters.explanation}` };
  }
  if (A.length === B.length) {
    const diffs = [...A].map((c, k) => [c, B[k], k]).filter(([x, y]) => x !== y);
    if (diffs.every(([x, y, k]) => x === 'ه' && y === 'ة' && (k === A.length - 1 || /\s/.test(A[k + 1] || ' '))))
      return { category: 'spelling', title: 'التاء المربوطة', explanation: 'تُكتب التاء المربوطة (ة) في آخر الأسماء المؤنثة مثل «مدرسة، سيارة»، وتُنطق تاءً عند الوصل؛ أما الهاء (ه) فتكون ضميرًا أو أصلًا في الكلمة.' };
    if (diffs.every(([x, y]) => x === 'ة' && y === 'ه'))
      return { category: 'spelling', title: 'الهاء لا التاء المربوطة', explanation: 'هذه الهاء ضمير أو أصل في الكلمة، فلا تُكتب تاءً مربوطة (ة).' };
    if (diffs.every(([x, y]) => (x === 'ي' && y === 'ى') || (x === 'ى' && y === 'ي')))
      return { category: 'spelling', title: 'الألف المقصورة والياء', explanation: diffs[0][1] === 'ى' ? 'تُكتب هذه الكلمة بالألف المقصورة (ى) في آخرها، مثل: «على، إلى، مستشفى».' : 'تُكتب هذه الكلمة بالياء (ي) لا بالألف المقصورة، مثل: «في، الذي، التي».' };
    if (swapOnly(A, B, HAMZA)) {
      const to = diffs.map(([, y]) => y).join('');
      if (/^ا+$/.test(to)) return { category: 'spelling', title: 'همزة وصل', explanation: 'الهمزة هنا همزة وصل (تُنطق في أول الكلام وتسقط في وسطه) فلا تُكتب على الألف، كما في: «اهتمام، استخدام، اسم، ابن».' };
      if (/^[أإآ]+$/.test(to)) return { category: 'spelling', title: 'همزة قطع', explanation: `الهمزة في «${b}» همزة قطع (تُنطق دائمًا) فتُكتب: فوق الألف إذا كانت مفتوحة أو مضمومة (أ)، وتحتها إذا كانت مكسورة (إ).` };
      return { category: 'spelling', title: 'كتابة الهمزة', explanation: `تُكتب الهمزة في «${b}» على الحرف المناسب لحركتها وحركة ما قبلها.` };
    }
  }
  // ending changes → grammar (case / agreement): مجتهدون ↔ مجتهدين، جميل → جميلا
  const ends = /(ون|ين|ات|ان|ا|ًا)$/;
  if (A.split(/\s+/).length === B.split(/\s+/).length && A.replace(ends, '') === B.replace(ends, '') && A !== B)
    return { category: 'grammar', title: 'علامة الإعراب أو المطابقة', explanation: `تغيّرت نهاية الكلمة («${a}» ← «${b}») لتوافق موقعها في الجملة: كنصب خبر «كان» واسم «إنّ» (جميلًا، المعلمين)، أو رفع الخبر (مجتهدون)، أو مطابقة الصفة والخبر للموصوف والمبتدأ.` };
  if (sB.length < sA.length && [...sB].every((c) => sA.includes(c)))
    return { category: 'spelling', title: 'حرف زائد', explanation: `يوجد حرف زائد؛ والصواب «${b}». (بعض الكلمات تُنطق بألف لا تُكتب، مثل: هذا، لكن، ذلك.)` };
  return { category: 'spelling', title: 'تصحيح إملائي', explanation: `الصواب «${b}».` };
}

/**
 * @param text       full document text
 * @param tokens     fine tokens of the original sentence (fineTokens)
 * @param outTokens  tokens of the corrected sentence (model output split on spaces)
 */

/**
 * Split one diff block into the smallest aligned groups, so «ب الصحه و لا»
 * vs «بالصحة ولا» becomes two separate corrections, each with its own reason.
 */
function subGroups(ow, nw) {
  const groups = [];
  let i = 0, j = 0;
  while (i < ow.length && j < nw.length) {
    let a = k2(ow[i].text), b = k2(nw[j]);
    let i2 = i + 1, j2 = j + 1;
    while (a !== b) {
      if (a.length < b.length && i2 < ow.length && b.startsWith(a)) a += k2(ow[i2++].text);
      else if (b.length < a.length && j2 < nw.length && a.startsWith(b)) b += k2(nw[j2++]);
      else break;
    }
    if (a !== b) { i2 = i + 1; j2 = j + 1; } // no clean alignment: pair word by word
    groups.push([i, i2, j, j2]);
    i = i2; j = j2;
  }
  if (groups.length && (i < ow.length || j < nw.length)) {
    const g = groups[groups.length - 1];
    g[1] = ow.length; g[3] = nw.length;
  }
  return groups;
}

/**
 * @param text       full document text
 * @param tokens     fine tokens of the original sentence (fineTokens)
 * @param outTokens  tokens of the corrected sentence (model output split on spaces)
 */
export function changesToIssues(text, tokens, outTokens, confidence, providerName) {
  const issues = [];
  const blocks = diffBlocks(tokens.map((t) => plain(t.text)), outTokens.map(plain));
  for (const { i1, i2, j1, j2 } of blocks) {
    const owAll = tokens.slice(i1, i2).filter((t) => isWord(t.text));
    const nwAll = outTokens.slice(j1, j2).filter(isWord);
    if (!owAll.length || !nwAll.length || nwAll.some((w) => w.includes('[UNK]'))) continue; // pure insert/delete or punctuation only
    for (const [a1, a2, b1, b2] of subGroups(owAll, nwAll)) {
      const ow = owAll.slice(a1, a2), nw = nwAll.slice(b1, b2);
      if (!ow.length || !nw.length) continue;
      if (ow.some((t) => /\d/.test(t.text)) || nw.some((w) => /\d/.test(w))) continue; // numbers: «2,25» etc.
      const start0 = ow[0].start, end0 = ow[ow.length - 1].end;
      const origText = text.slice(start0, end0);
      const newText = nw.join(' ');
      if (plain(origText).replace(/\s+/g, ' ') === newText) continue;
      // smallest edit inside the span (keeps the rest of the text untouched)
      let p = 0;
      while (p < origText.length && p < newText.length && origText[p] === newText[p]) p++;
      let q = 0;
      while (q < origText.length - p && q < newText.length - p && origText[origText.length - 1 - q] === newText[newText.length - 1 - q]) q++;
      const why = explainChange(origText, newText);
      issues.push({
        ruleId: 'ai-spelling', source: 'ai', severity: 'warning', confidence,
        category: why.category, title: why.title,
        start: start0 + p, end: end0 - q, replacement: newText.slice(p, newText.length - q),
        anchorStart: start0, anchorEnd: end0,
        explanation: `${why.explanation}

🤖 اقتراح من نموذج الذكاء الاصطناعي (${providerName}) المدرَّب على نصوص عربية مصحَّحة (QALB).`,
      });
    }
  }
  return issues;
}

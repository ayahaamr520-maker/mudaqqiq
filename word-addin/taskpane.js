/* global Office, Word */
// Word task pane: runs the same engine as the website on the document's
// paragraphs. Corrections are applied in place with Word's own API, so they
// land in the undo history (Ctrl+Z) like any edit.

import { createEngine, CATEGORY_LABEL } from '../engine/engine.js';
import { MODEL_REMOTE } from '../web/config.js';

const engine = createEngine();
const ignored = new Set();
const $ = (s) => document.querySelector(s);
const list = $('#list');
const msg = $('#msg');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cls = (i) => (i.source === 'ai' ? 'ai' : i.category);

/** Current findings: [{ para: index | 'current', text, issue }] */
let findings = [];
let mode = 'document';
let aiProvider = null;

const analyze = (text) => ($('#ai').checked && aiProvider ? engine.analyzeAsync(text, { ignored }) : Promise.resolve(engine.analyze(text, { ignored })));

// The smallest span that contains both the underline and the edit, plus its
// corrected version — this is what we search for in Word and replace.
function span(text, i) {
  const a = Math.min(i.anchorStart, i.start);
  const b = Math.max(i.anchorEnd, i.end);
  let occ = 0;
  const find = text.slice(a, b);
  for (let k = text.indexOf(find); k !== -1 && k < a; k = text.indexOf(find, k + 1)) occ++;
  return { find, replace: text.slice(a, i.start) + i.replacement + text.slice(i.end, b), occ };
}

function render() {
  $('#fix-all').disabled = !findings.length;
  $('#fix-all').textContent = findings.length ? `تصحيح الكل (${findings.length})` : 'تصحيح الكل';
  if (!findings.length) {
    list.innerHTML = '<div class="empty"><b>✓</b>لا توجد ملاحظات.</div>';
    return;
  }
  list.innerHTML = `<div class="section-title">${mode === 'current' ? 'الفقرة الحالية' : 'المستند كاملًا'}</div>` + findings.map((f, n) => {
    const { issue: i } = f;
    const s = span(f.text, i);
    return `
    <div class="card ${cls(i)}" data-n="${n}">
      <div class="head"><span class="chip">${i.source === 'ai' ? 'ذكاء اصطناعي' : CATEGORY_LABEL[i.category]}</span>${typeof f.para === 'number' ? `<span class="para">الفقرة ${f.para + 1}</span>` : ''}</div>
      <div class="title">${esc(i.title)}</div>
      <div class="diff"><del>${esc(s.find)}</del><span class="arrow">←</span><ins>${esc(s.replace)}</ins></div>
      <div class="why" hidden>${esc(i.explanation)}</div>
      <div class="actions">
        <button class="btn apply" data-act="apply">✓ تطبيق التصحيح</button>
        <button class="btn" data-act="ignore">✕ تجاهل</button>
        <button class="btn ghost" data-act="why">💡 لماذا؟</button>
      </div>
    </div>`;
  }).join('');
}

async function getParagraph(ctx, f) {
  if (f.para === 'current') return ctx.document.getSelection().paragraphs.getFirst();
  const ps = ctx.document.body.paragraphs;
  ps.load('items');
  await ctx.sync();
  return ps.items[f.para];
}

/** Find the range of one finding inside its paragraph (null if the text changed). */
async function locate(ctx, f) {
  const p = await getParagraph(ctx, f);
  p.load('text');
  await ctx.sync();
  if (p.text !== f.text) return null;
  const s = span(f.text, f.issue);
  const res = p.search(s.find, { matchCase: true });
  res.load('items');
  await ctx.sync();
  return { range: res.items[s.occ], replace: s.replace };
}

async function apply(f) {
  await Word.run(async (ctx) => {
    const hit = await locate(ctx, f);
    if (!hit?.range) { msg.textContent = 'تغيّر النص منذ آخر فحص؛ أعد الفحص.'; return; }
    hit.range.insertText(hit.replace, 'Replace');
    await ctx.sync();
  });
  await recheck();
}

async function select(f) {
  await Word.run(async (ctx) => {
    const hit = await locate(ctx, f);
    if (hit?.range) { hit.range.select(); await ctx.sync(); }
  });
}

list.addEventListener('click', async (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const f = findings[+card.dataset.n];
  const act = e.target.closest('[data-act]')?.dataset.act;
  try {
    if (act === 'apply') await apply(f);
    else if (act === 'ignore') { ignored.add(f.issue.key); await recheck(); }
    else if (act === 'why') card.querySelector('.why').hidden = !card.querySelector('.why').hidden;
    else await select(f);
  } catch (err) { msg.textContent = 'خطأ: ' + err.message; }
});

async function checkDocument() {
  mode = 'document';
  msg.textContent = 'جارٍ الفحص…';
  await Word.run(async (ctx) => {
    const ps = ctx.document.body.paragraphs;
    ps.load('items/text');
    await ctx.sync();
    findings = [];
    for (let n = 0; n < ps.items.length; n++) {
      const text = ps.items[n].text;
      if (!/[؀-ۿ]/.test(text)) continue;
      for (const issue of (await analyze(text)).issues) findings.push({ para: n, text, issue });
    }
  });
  msg.textContent = `${findings.length} ملاحظة`;
  render();
}

async function checkCurrent() {
  mode = 'current';
  await Word.run(async (ctx) => {
    const p = ctx.document.getSelection().paragraphs.getFirst();
    p.load('text');
    await ctx.sync();
    const text = p.text;
    findings = /[؀-ۿ]/.test(text) ? (await analyze(text)).issues.map((issue) => ({ para: 'current', text, issue })) : [];
  });
  msg.textContent = '';
  render();
}

const recheck = () => (mode === 'current' ? checkCurrent() : checkDocument());

async function fixAll() {
  // back to front inside each paragraph so earlier offsets stay valid
  const order = (f) => (f.para === 'current' ? 0 : f.para);
  const byPara = [...findings].sort((a, b) => order(a) - order(b) || b.issue.start - a.issue.start);
  for (const f of byPara) {
    await Word.run(async (ctx) => {
      const p = await getParagraph(ctx, f);
      p.load('text');
      await ctx.sync();
      const i = f.issue;
      // recompute the span on the paragraph's current text (later edits already applied)
      const cur = { ...f, text: p.text };
      if (p.text.slice(i.start, i.end) !== f.text.slice(i.start, i.end)) return;
      const hit = await locate(ctx, cur);
      if (hit?.range) { hit.range.insertText(hit.replace, 'Replace'); await ctx.sync(); }
    });
  }
  await recheck();
}

let liveTimer = 0;
function onSelectionChanged() {
  if (!$('#live').checked) return;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => checkCurrent().catch(() => {}), 700);
}

$('#ai').addEventListener('change', async (e) => {
  if (!e.target.checked) { aiProvider?.forEach((p) => engine.removeProvider(p)); return recheck(); }
  if (!aiProvider) {
    msg.textContent = 'جارٍ تحميل نموذج الترقيم (مرة واحدة)…';
    try {
      const [{ createPunctuationProvider }, { createSpellingProvider }] = await Promise.all([
        import('../engine/ai/punctuation-model.js'), import('../engine/ai/spelling-model.js'),
      ]);
      const files = {};
      const onProgress = ({ file, loaded, total }) => {
        files[file] = [loaded || 0, total || 0];
        const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
        msg.textContent = `تحميل نموذجَي الذكاء الاصطناعي (مرة واحدة): ${t ? Math.round((100 * l) / t) : 0}%`;
      };
      const local = (m) => new URL(`../web/models/${m}/`, location.href).href;
      aiProvider = [
        await createPunctuationProvider({ localPath: local('arabic-punctuation'), remoteId: MODEL_REMOTE.punct, onProgress }),
        await createSpellingProvider({ localPath: local('arabic-spelling'), remoteId: MODEL_REMOTE.spell, onProgress }),
      ];
    } catch (err) {
      msg.textContent = 'تعذّر تحميل النموذج: ' + err.message;
      e.target.checked = false;
      return;
    }
  }
  aiProvider.forEach((p) => engine.addProvider(p));
  msg.textContent = 'الذكاء الاصطناعي مفعّل (الترقيم + الإملاء والنحو).';
  recheck();
});

Office.onReady((info) => {
  if (info.host !== Office.HostType.Word) {
    msg.textContent = 'افتح هذه الصفحة من داخل Word (إضافة مدقق). للتجربة في المتصفح استخدم صفحة web/.';
    return;
  }
  $('#check').addEventListener('click', () => checkDocument().catch((e) => (msg.textContent = 'خطأ: ' + e.message)));
  $('#fix-all').addEventListener('click', () => fixAll().catch((e) => (msg.textContent = 'خطأ: ' + e.message)));
  Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, onSelectionChanged);
  checkCurrent().catch(() => {});
});

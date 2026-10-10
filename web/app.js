import { createEngine, CATEGORY_LABEL, explainStyle, STYLE_INFO, MARK_GUIDE } from '../engine/engine.js';
import { MODEL_REMOTE } from './config.js';
import { createLexicon } from '../engine/spell.js';
import { createSpellProvider } from '../engine/spell-provider.js';
import { loadModel } from './ai-client.js';

// Where the ONNX models live: the local folder first (served with the site);
// if it isn't there, the Hugging Face repo from web/config.js.
const AI_MODELS = {
  punct: {
    local: new URL('./models/arabic-punctuation/', location.href).href,
    remote: MODEL_REMOTE.punct,
    name: 'الترقيم', button: '#ai-punct',
  },
  spell: {
    local: new URL('./models/arabic-spelling/', location.href).href,
    remote: MODEL_REMOTE.spell,
    name: 'الإملاء والنحو', button: '#ai-spell',
  },
  context: {
    local: new URL('./models/arabic-context/', location.href).href,
    remote: MODEL_REMOTE.context,
    name: 'السياق', button: '#ai-context',
    // the context model doesn't check text itself: it ranks the spell checker's suggestions
    attach: (p) => { if (spellProvider) spellProvider.scorer = p; },
    detach: () => { if (spellProvider) spellProvider.scorer = null; },
  },
};

const SAMPLES = {
  brief: 'كيف حالك.\nما أجمل السماء\nهل حضرت المحاضرة.\nيا محمد ادرس دروسك\nإن الطالبات مجتهدون.\nلا تهمل واجباتك\nنعم الصديق الكتاب',
  raw: 'السلام عليكم كيف حالك اليوم أتمنى أن تكون بخير\nقال المعلم للطلاب اكتبوا الدرس في الدفتر\nذهب الولد إلى المدرسة وعاد في المساء\nتحب القهوة أم الشاي',
  grammar: 'انا ذاهب الى المكتبة لان الإمتحان قريب.\nإن المعلمون مخلصون في عملهم.\nهذا المدرسة كبيرة, وفيها ملعب واسع.\nرأيت المرأة الذي ساعدتني أمس .\nذهب الطالبة إلى المكتبة انشاء الله.',
  styles: [
    'هل حضرت المحاضرة', 'ما أجمل السماء', 'يا محمد ادرس دروسك', 'نعم الصديق الكتاب', 'بئس الخلق الكذب', 'العلم أفضل من المال',
    'نحن العرب نكرم الضيف', 'الصدق الصدق', 'إياك والكذب', 'إن العلم نور', 'والله لأجتهدن', 'وامعتصماه',
    'إنما يخشى الله العلماء', 'نجح الطلاب إلا خالدا', 'يا للعلماء للجهلاء', 'لعل الفرج قريب', 'ليت الشباب يعود يوما',
    'الكتاب قرأته', 'اكتبوا الدرس', 'لا تهمل واجباتك', 'لم أتأخر عن الدرس', 'إذا درست نجحت',
  ].join('\n'),
  marks: [
    'قال المعلم «العلم نور».', 'قال تعالى: (وقل رب زدني علما).', 'ولد المتنبي ( 915م في الكوفة.', 'الأسباب كالتالي الفقر والجهل.',
    'لم ينجح الطالب في الامتحان لأنه لم يدرس.', 'أما بعد فإن العلم نور.', 'نعم سأحضر غدا.', '-أولا الترقيم.', 'تعلمت أشياء كثيرة ...',
  ].join('\n'),
  typos: ['كيف حاك؟', 'هذا الكتاب مفيذ جدا.', 'الطاب مجتهد في دراسته.', 'انا سعيد جدا بلقئك.'].join('\n'),
  spelling: 'السياره الجديده سريعه جدا.\nيجب الإهتمام ب الصحه و لا سيما الصحه النفسيه.\nكان الجو جميل اليوم.\nلاكن المشكله ان الوقت ضيق ياصديقي.',
};

const $ = (s) => document.querySelector(s);
const input = $('#input');
const highlights = $('#highlights');
const popover = $('#popover');
const issueList = $('#tab-issues');
const styleList = $('#tab-styles');

const engine = createEngine();
const ignored = new Set();
let result = { text: '', sentences: [], issues: [] };
let activeId = null;
const aiState = { punct: { provider: null, on: false }, spell: { provider: null, on: false }, context: { provider: null, on: false } };
const aiOn = () => aiState.punct.on || aiState.spell.on || aiState.context.on;
let spellProvider = null; // dictionary spell check, loaded at start-up
let aiTimer = 0;
let aiRun = 0;

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cls = (i) => (i.source === 'ai' ? 'ai' : i.category);

// ───────────── analysis ─────────────
function analyzeNow() {
  result = engine.analyze(input.value, { ignored });
  render();
  if (aiOn() || spellProvider) scheduleAI();
}

function scheduleAI() {
  clearTimeout(aiTimer);
  aiTimer = setTimeout(async () => {
    const run = ++aiRun;
    const text = input.value;
    const r = await engine.analyzeAsync(text, { ignored });
    if (run === aiRun && text === input.value) { result = r; render(); }
  }, aiOn() ? 450 : 200);
}

// Dictionary spell check: ~530k Arabic words, loaded once in the background.
fetch(new URL('./data/ar-words.txt', location.href))
  .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
  .then((text) => {
    spellProvider = createSpellProvider({ lexicon: createLexicon(text), scorer: aiState.context.on ? aiState.context.provider : null });
    engine.addProvider(spellProvider);
    analyzeNow();
  })
  .catch((e) => console.warn('spell-check dictionary not loaded', e));

let ruleTimer = 0;
input.addEventListener('input', () => {
  hidePopover();
  clearTimeout(ruleTimer);
  ruleTimer = setTimeout(analyzeNow, 120);
  highlights.textContent = input.value + '\n'; // keep backdrop in sync immediately
});
input.addEventListener('scroll', syncScroll);
new ResizeObserver(syncScroll).observe(input);
function syncScroll() { highlights.parentElement.scrollTop = input.scrollTop; highlights.style.width = input.clientWidth + 'px'; }

// ───────────── rendering ─────────────
function preview(i, text = result.text) {
  const a = Math.min(i.anchorStart, i.start);
  const b = Math.max(i.anchorEnd, i.end);
  return { before: text.slice(a, b), after: text.slice(a, i.start) + i.replacement + text.slice(i.end, b) };
}

function render() {
  const { text, issues, sentences } = result;
  // backdrop highlights (non-overlapping anchors)
  let html = '';
  let pos = 0;
  for (const i of [...issues].sort((x, y) => x.anchorStart - y.anchorStart)) {
    if (i.anchorStart < pos || i.anchorEnd <= i.anchorStart) continue;
    html += esc(text.slice(pos, i.anchorStart));
    html += `<mark class="hl ${cls(i)} ${i.severity === 'hint' ? 'hint' : ''} ${i.id === activeId ? 'active' : ''}" data-id="${i.id}">${esc(text.slice(i.anchorStart, i.anchorEnd))}</mark>`;
    pos = i.anchorEnd;
  }
  highlights.innerHTML = html + esc(text.slice(pos)) + '\n';
  syncScroll();

  // suggestion cards
  $('#issue-count').textContent = issues.length;
  $('#fix-all').disabled = !issues.length;
  $('#fix-all').textContent = issues.length ? `تصحيح الكل (${issues.length})` : 'تصحيح الكل';
  issueList.innerHTML = issues.length
    ? issues.map((i) => cardHTML(i)).join('')
    : `<div class="empty"><b>✓</b>${text.trim() ? 'لا توجد ملاحظات. أحسنت!' : 'ابدأ الكتابة وستظهر الاقتراحات هنا.'}</div>`;

  // sentence styles
  const arabic = sentences.filter((s) => s.analysis.styles.length);
  styleList.innerHTML = arabic.length
    ? arabic.map((s, n) => `
      <div class="sent">
        <div class="txt">${esc(s.text)}</div>
        <div class="badges">${s.analysis.styles.map((st, k) => `<button class="badge ${st.type}" data-s="${n}" data-k="${k}">${st.label}${st.trigger ? ` · ${esc(st.trigger)}` : ''}</button>`).join('')}</div>
        <div class="why" hidden></div>
      </div>`).join('')
    : '<div class="empty">اكتب جملًا لترى تحليل أساليبها (استفهام، تعجب، نداء، أمر، نهي، نفي، شرط، مدح، ذم).</div>';
  styleList.querySelectorAll('.badge').forEach((b) => b.addEventListener('click', () => {
    const st = arabic[+b.dataset.s].analysis.styles[+b.dataset.k];
    const why = b.closest('.sent').querySelector('.why');
    why.textContent = st.type === 'statement' ? 'لم تبدأ الجملة بأداة أسلوب خاص، فهي جملة خبرية.' : explainStyle(st);
    why.hidden = false;
  }));

  // status bar
  const by = (c) => issues.filter((i) => cls(i) === c).length;
  const words = (text.match(/[^\s.!؟?…،,؛;:]+/g) || []).length;
  $('#status').innerHTML = `
    <span class="k"><i class="swatch punctuation"></i>ترقيم ${by('punctuation')}</span>
    <span class="k"><i class="swatch grammar"></i>نحو ${by('grammar')}</span>
    <span class="k"><i class="swatch spelling"></i>إملاء ${by('spelling')}</span>
    ${aiOn() ? `<span class="k"><i class="swatch ai"></i>ذكاء اصطناعي ${by('ai')}</span>` : ''}
    <span class="spacer"></span><span>${words} كلمة · ${sentences.length} جملة</span>`;

  if (activeId && !issues.some((i) => i.id === activeId)) { activeId = null; hidePopover(); }
}

function cardHTML(i, { open = false } = {}) {
  const p = preview(i);
  const conf = i.source === 'ai' ? `ثقة ${Math.round(i.confidence * 100)}%` : '';
  return `
  <div class="card ${cls(i)} ${i.id === activeId ? 'active' : ''}" data-id="${i.id}">
    <div class="head"><span class="chip">${i.source === 'ai' ? 'ذكاء اصطناعي' : CATEGORY_LABEL[i.category]}</span>${i.severity === 'hint' ? '<span>اقتراح</span>' : ''}<span>${conf}</span></div>
    <div class="title">${esc(i.title)}</div>
    <div class="diff"><del>${esc(p.before) || '∅'}</del><span class="arrow">←</span><ins>${esc(p.after)}</ins></div>
    <div class="why" ${open ? '' : 'hidden'}>${esc(i.explanation)}</div>
    <div class="actions">
      <button class="btn apply" data-act="apply">✓ تطبيق التصحيح</button>
      <button class="btn" data-act="ignore">✕ تجاهل</button>
      <button class="btn ghost" data-act="why">💡 لماذا؟</button>
    </div>
    ${i.alternatives?.length ? `<div class="actions alts">أو: ${i.alternatives.map((a) => `<button class="btn" data-act="alt" data-val="${esc(a)}">${esc(a)}</button>`).join('')}</div>` : ''}
  </div>`;
}

// ───────────── actions ─────────────
function applyIssue(i) {
  input.focus();
  input.setSelectionRange(i.start, i.end);
  // execCommand keeps the browser's undo stack (Ctrl+Z) working
  if (!document.execCommand('insertText', false, i.replacement)) {
    input.setRangeText(i.replacement, i.start, i.end, 'end');
    input.dispatchEvent(new Event('input'));
  }
  activeId = null;
  hidePopover();
  analyzeNow();
}

function ignoreIssue(i) {
  ignored.add(i.key);
  activeId = null;
  hidePopover();
  analyzeNow();
}

function handleAction(e) {
  const btn = e.target.closest('[data-act]');
  const card = e.target.closest('.card');
  if (!card) return;
  const i = result.issues.find((x) => x.id === card.dataset.id);
  if (!i) return;
  if (!btn) { focusIssue(i); return; }
  if (btn.dataset.act === 'apply') applyIssue(i);
  else if (btn.dataset.act === 'alt') applyIssue({ ...i, replacement: btn.dataset.val });
  else if (btn.dataset.act === 'ignore') ignoreIssue(i);
  else card.querySelector('.why').hidden = !card.querySelector('.why').hidden;
}
issueList.addEventListener('click', handleAction);
popover.addEventListener('click', handleAction);
popover.addEventListener('mousedown', (e) => e.preventDefault()); // keep textarea focus

function focusIssue(i) {
  input.focus();
  input.setSelectionRange(i.anchorEnd, i.anchorEnd);
  showPopoverFor(i);
}

// ───────────── popover next to the text ─────────────
function showPopoverFor(i) {
  activeId = i.id;
  render();
  const mark = highlights.querySelector(`mark[data-id="${CSS.escape(i.id)}"]`);
  if (!mark) return;
  popover.innerHTML = cardHTML(i);
  popover.hidden = false;
  const r = mark.getClientRects()[0] || mark.getBoundingClientRect();
  const pw = popover.offsetWidth;
  let left = r.right + window.scrollX - pw; // RTL: align to the word's right edge
  left = Math.max(8, Math.min(left, document.documentElement.clientWidth - pw - 8));
  popover.style.left = left + 'px';
  popover.style.top = r.bottom + window.scrollY + 8 + 'px';
  issueList.querySelector(`.card[data-id="${CSS.escape(i.id)}"]`)?.scrollIntoView({ block: 'nearest' });
}
function hidePopover() { popover.hidden = true; }

function caretCheck() {
  const pos = input.selectionStart;
  if (input.selectionEnd !== pos) return hidePopover();
  const i = result.issues.find((x) => x.anchorStart <= pos && pos <= x.anchorEnd);
  if (i) showPopoverFor(i);
  else { if (activeId) { activeId = null; render(); } hidePopover(); }
}
input.addEventListener('click', caretCheck);
input.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') caretCheck(); });
input.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePopover(); });
document.addEventListener('click', (e) => { if (!popover.contains(e.target) && e.target !== input && !e.target.closest('.card')) hidePopover(); });
window.addEventListener('resize', hidePopover);

// ───────────── toolbar ─────────────
$('#fix-all').addEventListener('click', () => {
  const sorted = [...result.issues].sort((a, b) => b.start - a.start);
  let text = input.value;
  for (const i of sorted) text = text.slice(0, i.start) + i.replacement + text.slice(i.end);
  input.focus();
  input.select();
  if (!document.execCommand('insertText', false, text)) { input.value = text; }
  analyzeNow();
});
$('#clear').addEventListener('click', () => { input.value = ''; ignored.clear(); analyzeNow(); input.focus(); });
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(input.value); $('#copy').textContent = 'تم النسخ ✓'; } catch { $('#copy').textContent = 'تعذّر النسخ'; }
  setTimeout(() => ($('#copy').textContent = 'نسخ'), 1500);
});
$('#samples').addEventListener('change', (e) => {
  if (!e.target.value) return;
  input.value = SAMPLES[e.target.value];
  ignored.clear();
  analyzeNow();
  e.target.value = '';
});
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', x === t); });
  $('#tab-issues').hidden = t.dataset.tab !== 'issues';
  $('#tab-styles').hidden = t.dataset.tab !== 'styles';
  $('#tab-guide').hidden = t.dataset.tab !== 'guide';
}));

// ───────────── guide: every style and punctuation mark ─────────────
const STYLE_ORDER = ['vocative', 'praise', 'blame', 'question', 'exclamation', 'imperative', 'prohibition', 'negation', 'preference', 'condition', 'specification', 'enticement', 'warning', 'emphasis', 'oath', 'lament', 'restriction', 'exception', 'appeal', 'hope', 'wish', 'preoccupation'];
$('#tab-guide').innerHTML = `
  <div class="guide-h">الأساليب النحوية (${STYLE_ORDER.length})</div>
  ${STYLE_ORDER.map((k) => STYLE_INFO[k]).map((st) => `
    <div class="sent">
      <div class="badges"><span class="badge">أسلوب ${st.label}</span>${st.mark ? `<span class="muted-chip">ينتهي بـ «${st.mark}»</span>` : ''}</div>
      <div class="why">${esc(st.def)}</div>
      <button class="try" data-example="${esc(st.example)}">جرّب: ${esc(st.example)}</button>
    </div>`).join('')}
  <div class="guide-h">علامات الترقيم (${MARK_GUIDE.length})</div>
  ${MARK_GUIDE.map((m) => `
    <div class="sent">
      <div class="badges"><span class="badge mark">${esc(m.mark)}</span><b>${m.name}</b></div>
      <div class="why">${esc(m.use)}</div>
      <button class="try" data-example="${esc(m.example)}">مثال: ${esc(m.example)}</button>
    </div>`).join('')}`;
$('#tab-guide').addEventListener('click', (e) => {
  const b = e.target.closest('.try');
  if (!b) return;
  input.value = b.dataset.example;
  ignored.clear();
  analyzeNow();
  input.focus();
});

// ───────────── AI models ─────────────
async function toggleAI(kind) {
  const cfg = AI_MODELS[kind];
  const st = aiState[kind];
  const btn = $(cfg.button);
  const label = btn.querySelector('.label');
  if (st.on) {
    st.on = false;
    if (cfg.detach) cfg.detach(); else engine.removeProvider(st.provider);
    btn.setAttribute('aria-pressed', 'false');
    label.textContent = `ذكاء اصطناعي: ${cfg.name}`;
    analyzeNow();
    return;
  }
  if (!st.provider) {
    const bar = $('#ai-progress');
    btn.classList.add('loading');
    btn.disabled = true;
    label.textContent = 'جارٍ تحميل النموذج…';
    bar.hidden = false;
    const files = {};
    try {
      // the model runs in a background thread (web/ai-worker.js), so typing never freezes
      st.provider = await loadModel(kind, {
        localPath: cfg.local,
        remoteId: cfg.remote,
        onProgress: ({ file, loaded, total }) => {
          files[file] = [loaded || 0, total || 0];
          const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
          bar.querySelector('.bar').style.width = (t ? Math.round((l / t) * 100) : 0) + '%';
          bar.querySelector('.txt').textContent = `تحميل نموذج ${cfg.name} (مرة واحدة فقط، ثم يُحفظ في المتصفح): ${(l / 1e6).toFixed(0)} / ${(t / 1e6).toFixed(0)} م.ب`;
        },
      });
    } catch (err) {
      console.error(err);
      btn.classList.remove('loading');
      btn.disabled = false;
      label.textContent = 'تعذّر تحميل النموذج';
      bar.querySelector('.bar').style.width = '0';
      bar.querySelector('.txt').textContent = 'تعذّر تحميل النموذج: ' + (err.message || err) + ' — القواعد ما زالت تعمل.';
      return;
    }
    bar.hidden = true;
    btn.classList.remove('loading');
    btn.disabled = false;
  }
  st.on = true;
  if (cfg.attach) cfg.attach(st.provider); else engine.addProvider(st.provider);
  btn.setAttribute('aria-pressed', 'true');
  label.textContent = `${cfg.name}: مفعّل`;
  analyzeNow();
}
$('#ai-punct').addEventListener('click', () => toggleAI('punct'));
$('#ai-spell').addEventListener('click', () => toggleAI('spell'));
$('#ai-context').addEventListener('click', () => toggleAI('context'));

// start
input.value = SAMPLES.brief;
analyzeNow();

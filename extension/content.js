// مُدقِّق browser extension — checks Arabic text while you type in any text box
// on any website (Gmail, WhatsApp Web, forms…). Same engine as the website and
// the Word add-in; runs locally, nothing is sent anywhere.
(() => {
  if (window.__mudaqqiq) return;
  window.__mudaqqiq = true;

  const url = (p) => (globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL(p) : '/' + p);
  let engine = null;
  let CATEGORY_LABEL = {};
  // AI models run in the extension's offscreen page; here we only proxy calls.
  const hasExt = !!globalThis.chrome?.runtime?.sendMessage && !!chrome.runtime.id;
  const ask = (msg) => chrome.runtime.sendMessage({ target: 'background', ...msg }).then((r) => {
    if (!r?.ok) throw new Error(r?.error || 'AI unavailable');
    return r.result;
  });
  const AI = {
    aiPunct: { name: 'AraBERT-Punctuation', predictPunctuation: (words) => ask({ kind: 'punct', words }) },
    aiSpell: {
      name: 'CAMeL SWEET',
      analyze: (doc) => ask({ kind: 'spell', doc: { text: doc.text, sentences: doc.sentences.map((s) => ({ text: s.text, start: s.start })) } }),
    },
  };
  // dictionary spell check: always on (runs in the extension's offscreen page)
  const DICT = {
    name: 'Dictionary',
    analyze: (doc) => ask({ kind: 'dict', doc: { text: doc.text, sentences: doc.sentences.map((s) => ({ text: s.text, start: s.start })) } }),
  };
  const aiOn = { aiPunct: false, aiSpell: false };
  function syncProviders() {
    if (!engine) return;
    for (const k of Object.keys(AI)) {
      engine.removeProvider(AI[k]);
      if (aiOn[k]) engine.addProvider(AI[k]);
    }
    engine.removeProvider(DICT);
    if (hasExt) engine.addProvider(DICT);
  }
  if (hasExt && chrome.storage?.local) {
    chrome.storage.local.get(aiOn, (s) => { Object.assign(aiOn, s); syncProviders(); check(); });
    chrome.storage.onChanged.addListener((ch) => {
      for (const k of Object.keys(aiOn)) if (ch[k]) aiOn[k] = ch[k].newValue;
      syncProviders();
      check();
    });
  }
  const anyAI = () => hasExt; // the dictionary is always on inside the real extension
  let generation = 0;

  import(url('engine/engine.js')).then((m) => {
    engine = m.createEngine();
    CATEGORY_LABEL = m.CATEGORY_LABEL;
    syncProviders();
    // a field may already have focus before the engine finished loading
    const a = document.activeElement;
    if (!field && a) field = isTextInput(a) ? a : editableRoot(a);
    check();
  });

  const ignored = new Set();
  let field = null;
  let result = null;
  let timer = 0;
  const BLOCK = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TR|SECTION|ARTICLE)$/;

  // ── UI in a shadow root so page CSS can't touch it ──
  const host = document.createElement('mudaqqiq-ui');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif; }
    .badge { position: fixed; z-index: 2147483646; min-width: 26px; height: 26px; padding: 0 8px; border-radius: 13px; border: 0; cursor: pointer;
      background: #0f6b5c; color: #fff; font-size: 13px; font-weight: 700; box-shadow: 0 2px 8px rgba(0,0,0,.25); display: none; }
    .badge.err { background: #c2362f; }
    .panel { position: fixed; z-index: 2147483647; width: 340px; max-height: 60vh; overflow: auto; direction: rtl; text-align: right;
      background: #fff; color: #1d2321; border: 1px solid #e4e0d7; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.2); padding: 10px; display: none; font-size: 14px; }
    .card { border: 1px solid #e4e0d7; border-inline-start: 4px solid var(--c); border-radius: 10px; padding: 9px 10px; margin-bottom: 8px; }
    .punctuation { --c: #2563c9; } .grammar { --c: #c2362f; } .spelling { --c: #b86a00; } .ai { --c: #7a4fc9; }
    .chip { font-size: 11px; color: var(--c); font-weight: 700; }
    .title { font-weight: 600; margin: 2px 0 4px; }
    .diff { font-size: 16px; } del { color: #c2362f; } ins { color: #0f6b5c; text-decoration: none; font-weight: 700; }
    .why { font-size: 12.5px; color: #4c5652; background: #faf8f4; border-radius: 8px; padding: 6px 8px; margin-top: 6px; }
    .actions { display: flex; gap: 6px; margin-top: 8px; }
    button.a { font-size: 12.5px; border: 1px solid #e4e0d7; background: #faf8f4; border-radius: 8px; padding: 3px 9px; cursor: pointer; color: inherit; }
    button.apply { background: #0f6b5c; color: #fff; border-color: #0f6b5c; }
    .empty { color: #7c8581; text-align: center; padding: 14px; }
    @media (prefers-color-scheme: dark) { .panel { background: #1a201e; color: #e9eeec; border-color: #2c3532; } .card { border-color: #2c3532; } .why, button.a { background: #161b19; color: #b5c0bb; border-color: #2c3532; } }
  </style>
  <button class="badge" title="مُدقِّق"></button>
  <div class="panel" role="dialog"></div>`;
  const badge = root.querySelector('.badge');
  const panel = root.querySelector('.panel');
  (document.body || document.documentElement).appendChild(host);

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isTextInput = (el) => el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && /^(text|search|)$/i.test(el.type));
  const editableRoot = (el) => { while (el && el.parentElement?.isContentEditable) el = el.parentElement; return el?.isContentEditable ? el : null; };

  // ── read text + map offsets for contenteditable ──
  function readEditable(el) {
    const segs = [];
    let text = '';
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.nodeType === 3) { segs.push({ node: n, start: text.length }); text += n.data; }
      else if (n.tagName === 'BR') text += '\n';
      else if (BLOCK.test(n.tagName) && text && !text.endsWith('\n')) text += '\n';
    }
    return { text, segs };
  }
  function pointAt(segs, off) {
    for (let k = segs.length - 1; k >= 0; k--) if (segs[k].start <= off) return [segs[k].node, Math.min(off - segs[k].start, segs[k].node.data.length)];
    return null;
  }
  const getText = (el) => (isTextInput(el) ? el.value : readEditable(el).text);

  function check() {
    if (!field || !engine) return;
    const text = getText(field);
    if (!/[؀-ۿ]/.test(text)) { result = null; badge.style.display = 'none'; panel.style.display = 'none'; return; }
    show(engine.analyze(text, { ignored })); // rules: instant
    if (!anyAI()) return;
    const gen = ++generation;
    const el = field;
    engine.analyzeAsync(text, { ignored }).then((r) => {
      if (gen === generation && el === field && getText(field) === text) show(r);
    }).catch(() => {});
  }
  function show(r) {
    result = r;
    const n = result.issues.filter((i) => i.severity !== 'hint').length;
    badge.textContent = n ? n : '✓';
    badge.classList.toggle('err', n > 0);
    placeBadge();
    if (panel.style.display === 'block') renderPanel();
  }
  function placeBadge() {
    const r = field.getBoundingClientRect();
    badge.style.display = 'block';
    badge.style.left = r.left + 6 + 'px';
    badge.style.top = Math.max(4, r.bottom - 32) + 'px';
  }

  function renderPanel() {
    const issues = result?.issues || [];
    panel.innerHTML = issues.length ? issues.map((i, n) => {
      const a = Math.min(i.anchorStart, i.start), b = Math.max(i.anchorEnd, i.end), t = result.text;
      return `<div class="card ${i.source === 'ai' ? 'ai' : i.category}" data-n="${n}">
        <div class="chip">${i.source === 'ai' ? 'ذكاء اصطناعي · ' : ''}${CATEGORY_LABEL[i.category] || ''}</div>
        <div class="title">${esc(i.title)}</div>
        <div class="diff"><del>${esc(t.slice(a, b))}</del> ← <ins>${esc(t.slice(a, i.start) + i.replacement + t.slice(i.end, b))}</ins></div>
        <div class="why" hidden>${esc(i.explanation)}</div>
        <div class="actions"><button class="a apply" data-act="apply">✓ تطبيق التصحيح</button><button class="a" data-act="ignore">✕ تجاهل</button><button class="a" data-act="why">💡 لماذا؟</button></div>
      </div>`;
    }).join('') : '<div class="empty">✓ لا توجد ملاحظات</div>';
    const r = field.getBoundingClientRect();
    panel.style.display = 'block';
    panel.style.left = Math.max(8, Math.min(r.left, innerWidth - 350)) + 'px';
    const below = r.bottom + 8;
    panel.style.top = (below + 300 < innerHeight ? below : Math.max(8, r.top - 8 - Math.min(panel.scrollHeight, innerHeight * 0.6))) + 'px';
  }

  function applyIssue(i) {
    const el = field;
    el.focus();
    if (isTextInput(el)) {
      el.setSelectionRange(i.start, i.end);
      if (!document.execCommand('insertText', false, i.replacement)) {
        el.setRangeText(i.replacement, i.start, i.end, 'end');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else {
      const { segs } = readEditable(el);
      const s = pointAt(segs, i.start), e = pointAt(segs, i.end);
      if (!s || !e) return;
      const range = document.createRange();
      range.setStart(...s);
      range.setEnd(...e);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      if (!document.execCommand('insertText', false, i.replacement)) { range.deleteContents(); range.insertNode(document.createTextNode(i.replacement)); }
    }
    check();
  }

  badge.addEventListener('mousedown', (e) => e.preventDefault());
  badge.addEventListener('click', () => { if (panel.style.display === 'block') panel.style.display = 'none'; else renderPanel(); });
  panel.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret in the field
  panel.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!card || !act) return;
    const i = result.issues[+card.dataset.n];
    if (act === 'apply') applyIssue(i);
    else if (act === 'ignore') { ignored.add(i.key); check(); }
    else card.querySelector('.why').hidden = !card.querySelector('.why').hidden;
  });

  document.addEventListener('focusin', (e) => {
    const t = e.composedPath()[0];
    const el = isTextInput(t) ? t : editableRoot(t);
    if (!el || el === field) return;
    field = el;
    panel.style.display = 'none';
    check();
  }, true);
  document.addEventListener('input', (e) => {
    if (!field || !(e.composedPath()[0] === field || field.contains(e.composedPath()[0]))) return;
    clearTimeout(timer);
    timer = setTimeout(check, 400);
  }, true);
  document.addEventListener('mousedown', (e) => { if (!e.composedPath().includes(host) && e.composedPath()[0] !== field) panel.style.display = 'none'; }, true);
  addEventListener('scroll', () => field && result && placeBadge(), true);
})();

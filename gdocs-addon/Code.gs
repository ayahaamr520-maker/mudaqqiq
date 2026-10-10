/**
 * مُدقِّق — Google Docs add-on (Apps Script).
 * Adds a «مدقق» menu that opens a side panel. The panel runs the checking
 * engine itself (in the browser); this file only reads and edits the document.
 */

function onOpen() {
  DocumentApp.getUi()
    .createMenu('مدقق')
    .addItem('فتح المدقق العربي', 'showSidebar')
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function showSidebar() {
  var html = HtmlService.createTemplateFromFile('Sidebar').evaluate().setTitle('مُدقِّق');
  DocumentApp.getUi().showSidebar(html);
}

/** Used by Sidebar.html to inline Engine.html. */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Text of every paragraph (list items included), in document order. */
function getParagraphs() {
  return DocumentApp.getActiveDocument().getBody().getParagraphs().map(function (p) {
    return p.getText();
  });
}

/** The paragraph the cursor is in: {index, text} or null. */
function getCurrentParagraph() {
  var doc = DocumentApp.getActiveDocument();
  var p = cursorParagraph_(doc);
  if (!p) return null;
  return { index: indexOfParagraph_(doc, p), text: p.getText() };
}

/**
 * Replace text[start:end] with `replacement` in paragraph `index`, but only if
 * the paragraph still has the text the panel analysed.
 */
function applyEdit(index, expectedText, start, end, replacement) {
  var p = DocumentApp.getActiveDocument().getBody().getParagraphs()[index];
  if (!p || p.getText() !== expectedText) return { ok: false, reason: 'changed' };
  var t = p.editAsText();
  if (end > start) t.deleteText(start, end - 1);
  if (replacement) t.insertText(start, replacement);
  return { ok: true, text: p.getText() };
}

/** Apply many edits to one paragraph (offsets in the original text). */
function applyEdits(index, expectedText, edits) {
  var p = DocumentApp.getActiveDocument().getBody().getParagraphs()[index];
  if (!p || p.getText() !== expectedText) return { ok: false, reason: 'changed' };
  var t = p.editAsText();
  edits.sort(function (a, b) { return b.start - a.start; }).forEach(function (e) {
    if (e.end > e.start) t.deleteText(e.start, e.end - 1);
    if (e.replacement) t.insertText(e.start, e.replacement);
  });
  return { ok: true, text: p.getText() };
}

/** Select text[start:end] in paragraph `index` so the user sees where it is. */
function selectRange(index, start, end) {
  var doc = DocumentApp.getActiveDocument();
  var p = doc.getBody().getParagraphs()[index];
  if (!p || end <= start) return;
  var range = doc.newRange().addElement(p.editAsText(), start, end - 1).build();
  doc.setSelection(range);
}

function cursorParagraph_(doc) {
  var c = doc.getCursor();
  var el = c ? c.getElement() : null;
  if (!el) {
    var sel = doc.getSelection();
    if (sel && sel.getRangeElements().length) el = sel.getRangeElements()[0].getElement();
  }
  while (el && el.getType() !== DocumentApp.ElementType.PARAGRAPH && el.getType() !== DocumentApp.ElementType.LIST_ITEM) {
    el = el.getParent();
  }
  return el;
}

function indexOfParagraph_(doc, p) {
  var all = doc.getBody().getParagraphs();
  // Elements can't be compared directly; match by position within the parent + text.
  var parent = p.getParent();
  var childIdx = parent.getChildIndex(p);
  for (var i = 0; i < all.length; i++) {
    var q = all[i];
    if (q.getText() === p.getText() && q.getParent().getChildIndex(q) === childIdx) return i;
  }
  return -1;
}

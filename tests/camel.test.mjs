// Parity test: the JS port of CAMeL's edit code must behave exactly like the
// original Python for every edit label the model can output (fixture generated
// from the Python reference implementation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isApplicable, applyEdit, rewrite } from '../engine/ai/camel-edits.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/camel-edits.json', import.meta.url), 'utf8'));

test(`all ${fx.labels.length} edit labels × sample subwords match Python`, () => {
  const bad = [];
  for (const [sub, label, ok, out] of fx.cases) {
    const jsOk = isApplicable(sub, label);
    const jsOut = jsOk ? applyEdit(sub, label) : null;
    if (jsOk !== ok || jsOut !== out) bad.push({ sub, label, py: [ok, out], js: [jsOk, jsOut] });
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} mismatches`);
});

test('rewrite of whole sentences matches Python', () => {
  for (const [subs, edits, expected] of fx.rewrite) assert.equal(rewrite(subs, edits), expected);
});

import { fineTokens, changesToIssues } from '../engine/ai/spelling-diff.js';
import { applyAll } from '../engine/engine.js';

test('model output → separate issues with explanations, punctuation untouched', () => {
  const text = 'يجب الإهتمام ب الصحه و لا سيما ف ي الصحه النفسيه ياشباب المستقبل،،';
  // output of the Python reference pipeline for this sentence (model card example)
  const out = 'يجب الاهتمام بالصحة ولا سيما في الصحة النفسية يا شباب المستقبل ،'.split(' ');
  const issues = changesToIssues(text, fineTokens(text), out, 0.9, 'test');
  assert.equal(applyAll(text, issues), 'يجب الاهتمام بالصحة ولا سيما في الصحة النفسية يا شباب المستقبل،،');
  const titles = issues.map((i) => i.title);
  assert.ok(titles.includes('همزة وصل'));
  assert.ok(titles.includes('وصل حرف بالكلمة'));
  assert.ok(titles.includes('التاء المربوطة'));
  assert.ok(titles.includes('فصل الكلمات'));
});

test('grammar-type change is classified as grammar', () => {
  const text = 'كان الجو جميل اليوم';
  const [i] = changesToIssues(text, fineTokens(text), 'كان الجو جميلا اليوم'.split(' '), 0.9, 't');
  assert.equal(i.category, 'grammar');
  assert.equal(applyAll(text, [i]), 'كان الجو جميلا اليوم');
});

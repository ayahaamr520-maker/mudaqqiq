// Dictionary spell check (no AI): typos that make a non-word, and common
// spelling variants that are far rarer than the correct form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLexicon, typoPrior } from '../engine/spell.js';
import { createSpellProvider } from '../engine/spell-provider.js';
import { createEngine, applyAll } from '../engine/engine.js';

const lexicon = createLexicon(readFileSync(new URL('../web/data/ar-words.txt', import.meta.url), 'utf8'));
const engine = createEngine();
engine.addProvider(createSpellProvider({ lexicon }));
const fix = async (t) => applyAll(t, (await engine.analyzeAsync(t)).issues);

test('lexicon knows common words and clitic forms', () => {
  for (const w of ['المدرسة', 'وبالمدرسة', 'مدرستهم', 'حالك', 'سأحضر']) assert.ok(lexicon.isKnown(w), w);
  for (const w of ['مفيذ', 'بلقئك', 'الطاب']) assert.ok(!lexicon.isKnown(w), w);
});

test('typing prior prefers a dropped letter and look-alike letters', () => {
  assert.ok(typoPrior('الطاب', 'الطالب') > typoPrior('الطاب', 'الشاب'));
  assert.ok(typoPrior('مفيذ', 'مفيد') > typoPrior('مفيذ', 'مفيض'));
});

const CASES = [
  ['هذا الكتاب مفيذ جدا.', 'هذا الكتاب مفيد جدا.'],
  ['أنا سعيد جدا بلقئك.', 'أنا سعيد جدا بلقائك.'],
  ['ذهبت إلى المدرسه صباحا.', 'ذهبت إلى المدرسة صباحا.'],
  ['شكرا لك ياصديقي.', 'شكرا لك يا صديقي.'],
  ['ما هو قاءد الفريق؟', 'ما هو قائد الفريق؟'],
  ['يجب علينا تقق الأهداف.', 'يجب علينا تحقق الأهداف.'],
];
for (const [input, want] of CASES) test(`spell: ${input}`, async () => assert.equal(await fix(input), want));

const CLEAN = [
  'ذهب الطالب إلى المدرسة وعاد في المساء.',
  'كتبت الطالبات واجباتهن بعناية.',
  'سافر أخي إلى لندن الأسبوع الماضي.',
  'حاك الخياط الثوب الجديد.',
];
for (const t of CLEAN) {
  test(`spell clean: ${t}`, async () => {
    const issues = (await engine.analyzeAsync(t)).issues.filter((i) => i.ruleId.startsWith('spell') && i.severity !== 'hint');
    assert.deepEqual(issues.map((i) => `${i.anchorText}→${i.replacement}`), []);
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, applyAll } from '../engine/engine.js';

const engine = createEngine();
const fix = (t) => applyAll(t, engine.analyze(t).issues.filter((i) => i.severity !== 'hint' || i.ruleId === 'end-mark'));
const styles = (t) => engine.analyze(t).sentences.flatMap((s) => s.analysis.styles.map((x) => x.type));

// ── examples straight from the project brief ──
const BRIEF = [
  ['كيف حالك.', 'كيف حالك؟'],
  ['ما أجمل السماء', 'ما أجمل السماء!'],
  ['هل حضرت المحاضرة.', 'هل حضرت المحاضرة؟'],
  ['يا محمد ادرس دروسك', 'يا محمد، ادرس دروسك.'],
  ['إن الطالبات مجتهدون.', 'إن الطالبات مجتهدات.'],
];
for (const [input, expected] of BRIEF) {
  test(`brief: ${input}`, () => assert.equal(fix(input), expected));
}

test('styles are recognised', () => {
  assert.ok(styles('هل حضرت المحاضرة؟').includes('question'));
  assert.ok(styles('ما أجمل السماء!').includes('exclamation'));
  assert.deepEqual(styles('يا محمد، ادرس دروسك.'), ['vocative', 'imperative']);
  assert.ok(styles('لا تهمل واجباتك.').includes('prohibition'));
  assert.ok(styles('لم أذهب إلى السوق.').includes('negation'));
  assert.ok(styles('إذا درست نجحت.').includes('condition'));
  assert.ok(styles('نعم الصديق الكتاب.').includes('praise'));
  assert.ok(styles('بئس الخلق الكذب.').includes('blame'));
  assert.ok(styles('ليت الشباب يعود.').includes('wish'));
});

// ── punctuation ──
test('latin punctuation → arabic', () => assert.equal(fix('كيف حالك? أنا بخير, والحمد لله.'), 'كيف حالك؟ أنا بخير، والحمد لله.'));
test('space before mark', () => assert.equal(fix('كيف حالك ؟'), 'كيف حالك؟'));
test('space after mark', () => assert.equal(fix('ذهبت إلى السوق،واشتريت خبزا.'), 'ذهبت إلى السوق، واشتريت خبزا.'));
test('repeated marks', () => assert.equal(fix('ما أروع هذا!!!'), 'ما أروع هذا!'));
test('exclamation overrides question mark', () => assert.equal(fix('ما أروع هذا المنظر؟'), 'ما أروع هذا المنظر!'));
test('question in last clause', () => assert.equal(fix('السلام عليكم، كيف حالك.'), 'السلام عليكم، كيف حالك؟'));
test('«؟!» and ellipsis are left alone', () => {
  assert.equal(engine.analyze('هل هذا معقول؟!').issues.length, 0);
  assert.equal(engine.analyze('وكان ما كان...').issues.length, 0);
});

// ── spelling ──
test('hamza words', () => assert.equal(fix('انا ذاهب الى المدرسة.'), 'أنا ذاهب إلى المدرسة.'));
test('hamzat wasl in masdar', () => assert.equal(fix('يجب الإهتمام بالصحة.'), 'يجب الاهتمام بالصحة.'));
test('in sha Allah', () => assert.equal(fix('سأحضر انشاء الله.'), 'سأحضر إن شاء الله.'));

// ── grammar ──
test('ism inna is mansoub', () => assert.equal(fix('إن المعلمون مخلصون.'), 'إن المعلمين مخلصون.'));
test('khabar inna is marfou', () => assert.equal(fix('إن المهندسين مبدعين.'), 'إن المهندسين مبدعون.'));
test('mubtada/khabar agreement', () => assert.equal(fix('الطالبات مجتهدون.'), 'الطالبات مجتهدات.'));
test('demonstrative', () => assert.equal(fix('هذا المدرسة كبيرة.'), 'هذه المدرسة كبيرة.'));
test('relative pronoun', () => assert.equal(fix('رأيت المرأة الذي ساعدتني.'), 'رأيت المرأة التي ساعدتني.'));
test('verb gender', () => assert.equal(fix('ذهب الطالبة إلى المكتبة.'), 'ذهبت الطالبة إلى المكتبة.'));

// ── things that must NOT be flagged ──
const CLEAN = [
  'إن الطالبات مجتهدات.',
  'هذا الخليفة عادل.',
  'إن العيون جميلة.',
  'إن الأصوات عالية.',
  'ما أعرف الجواب.',
  'من الواضح أن الدرس سهل.',
  'زارت الطالبات المعلمين.',
  'حضر الحفل كثير من الناس.',
  'أين تسكن؟',
  'سعر الكتاب 3.5 دينار.',
  'نعم، سأحضر غدا.',
  'لا تزال الأمطار تهطل.',
  'وكان الاختبار صعبا.',
  'This is English text, no change?',
];
for (const t of CLEAN) {
  test(`clean: ${t}`, () => {
    const issues = engine.analyze(t).issues.filter((i) => i.severity !== 'hint');
    assert.deepEqual(issues.map((i) => `${i.ruleId}:${i.anchorText}→${i.replacement}`), []);
  });
}

test('custom rule via addRule', () => {
  const e = createEngine();
  e.addRule({ id: 't1', category: 'spelling', find: 'مثلن', replace: 'مثلًا', explanation: 'تنوين' });
  assert.equal(applyAll('مثلن هذا.', e.analyze('مثلن هذا.').issues), 'مثلًا هذا.');
});

test('AI provider merge: model decides ambiguous end, adds comma, rules keep exclamation', async () => {
  const e = createEngine();
  e.addProvider({
    name: 'fake',
    async predictPunctuation(words) {
      const joined = words.join(' ');
      if (joined === 'ما أروع هذا المنظر') return words.map((_, i) => ({ mark: i === words.length - 1 ? '؟' : '', prob: 0.95 }));
      if (joined === 'ذهب الولد إلى المدرسة وعاد في المساء') return words.map((w, i) => ({ mark: w === 'المدرسة' ? '،' : i === words.length - 1 ? '.' : '', prob: 0.9 }));
      if (joined === 'تحب القهوة') return words.map((_, i) => ({ mark: i === words.length - 1 ? '؟' : '', prob: 0.9 }));
      return words.map(() => ({ mark: '', prob: 0.99 }));
    },
  });
  const run = async (t) => applyAll(t, (await e.analyzeAsync(t)).issues);
  assert.equal(await run('ما أروع هذا المنظر'), 'ما أروع هذا المنظر!');
  assert.equal(await run('ذهب الولد إلى المدرسة وعاد في المساء'), 'ذهب الولد إلى المدرسة، وعاد في المساء.');
  assert.equal(await run('تحب القهوة\nنعم'), 'تحب القهوة؟\nنعم');
});

// ── regressions found by the Wikipedia evaluation (docs/EVALUATION.md) ──
const WIKI_CLEAN = [
  'تتطلب الاستشارة تحليلا دقيقا، أي تحيل كل كبيرة وصغيرة إلى القانون.',
  'بينما تمتع التحقيق بدعم الحزبين، إلا أنه أصبح عرضة للانتقاد.',
  'المالية هي الإدارة الحكومية الإستونية المسؤولة عن السياسات.',
  'تنظيم المجتمع هو شكل من أشكال القيادة الذي يمكن تحويل موارده.',
];
for (const t of WIKI_CLEAN) {
  test(`wiki clean: ${t}`, () => assert.deepEqual(engine.analyze(t).issues.filter((i) => i.severity !== 'hint').map((i) => i.ruleId), []));
}
test('ألا before a verb is still a question', () => assert.equal(fix('ألا تحب القراءة.'), 'ألا تحب القراءة؟'));

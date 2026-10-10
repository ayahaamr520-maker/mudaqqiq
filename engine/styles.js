// Recognises Arabic sentence styles (الأساليب النحوية) and decides which end
// mark the sentence needs. Each detected style carries the trigger word(s) so
// the UI can explain *why* («لأن الجملة بدأت بأداة الاستفهام «هل»»).

import * as L from './lexicon.js';
import { key, keySet, plain, stripConj, clauses, looksPresentVerb, isDefinite } from './text.js';

const Q = keySet(L.QUESTION_WORDS);
const Q_BEFORE_VERB = new Set([...L.QUESTION_BEFORE_VERB].map(plain)); // exact hamza: «ألا» ≠ «إلا»
const MAN_NEXT = keySet(L.MAN_QUESTION_NEXT);
const NEG = keySet(L.NEGATION_WORDS);
const COND = keySet(L.CONDITION_WORDS);
const PRAISE = keySet(L.PRAISE_WORDS);
const BLAME = keySet(L.BLAME_WORDS);
const TAMANNI = keySet(L.TAMANNI_WORDS);
const TARAJJI = keySet(L.TARAJJI_WORDS);
const IMPER = keySet(L.COMMON_IMPERATIVES);
const NOT_IMPER = keySet(L.NOT_IMPERATIVE);
const AFAL = keySet(L.EXCLAMATION_AFAL);
const AFAL_SUFFIXES = L.EXCLAMATION_SUFFIXES.map(key).sort((a, b) => b.length - a.length);
const QASAM = new Set([...L.QASAM_WORDS].map(plain));
const TAFDIL_EXTRA = new Set([...L.TAFDIL_EXTRA].map(plain));
const IGHRAA = new Set([...L.IGHRAA_NOUNS].map(plain));
const TAHDHIR = new Set([...L.TAHDHIR_NOUNS].map(plain));
const TAHDHIR_W = new Set([...L.TAHDHIR_WORDS].map(plain));

/**
 * Every style: label, end mark it needs (null = none), the reason shown to the
 * user, plus a definition and example for the in-app guide.
 */
export const STYLE_INFO = {
  question: { label: 'استفهام', mark: '؟', why: 'الجملة استفهامية لأنها تبدأ بأداة الاستفهام «{t}»، والجملة الاستفهامية تنتهي بعلامة الاستفهام (؟).', def: 'طلب العلم بشيء لم يكن معلومًا، بأدوات مثل: هل، الهمزة، ما، ماذا، مَن، متى، أين، كيف، كم، أي.', example: 'هل حضرت المحاضرة؟' },
  exclamation: { label: 'تعجب', mark: '!', why: 'الجملة تعجبية على صيغة «{t}»، وأسلوب التعجب ينتهي بعلامة التعجب (!).', def: 'التعبير عن الدهشة من أمر عظيم، بصيغتي «ما أفعلَه!» و«أفعِلْ به!» أو بصيغ سماعية مثل «لله درُّه!».', example: 'ما أجملَ السماءَ!' },
  vocative: { label: 'نداء', mark: null, why: '«{t}» أسلوب نداء؛ ويُفصل المنادى عمّا بعده بفاصلة (،).', def: 'طلب إقبال المخاطَب بحرف من حروف النداء (يا، أيا، أيها، أيتها)، ويُفصل المنادى عمّا بعده بفاصلة.', example: 'يا محمدُ، ادرس دروسك.' },
  imperative: { label: 'أمر', mark: '.', why: 'الجملة طلبية بفعل الأمر «{t}»، وتنتهي بنقطة (.)، ويجوز التعجب (!) عند الانفعال.', def: 'طلب حصول الفعل على وجه الإلزام، بفعل الأمر أو المضارع المقرون بلام الأمر أو اسم فعل الأمر.', example: 'اكتبوا الدرسَ.' },
  prohibition: { label: 'نهي', mark: '.', why: 'الجملة نهي بـ«لا» الناهية والفعل المضارع «{t}»، وتنتهي بنقطة (.).', def: 'طلب الكف عن الفعل، بـ«لا» الناهية والفعل المضارع المجزوم.', example: 'لا تهملْ واجباتك.' },
  negation: { label: 'نفي', mark: '.', why: 'الجملة منفية بالأداة «{t}»، وهي جملة خبرية تنتهي بنقطة (.).', def: 'نقض الإثبات بأدوات مثل: لم، لن، لا، ما، ليس.', example: 'لم أتأخرْ عن الدرس.' },
  condition: { label: 'شرط', mark: '.', why: 'الجملة شرطية بالأداة «{t}»؛ تنتهي بنقطة (.)، ويحسُن الفصل بين جملة الشرط وجوابه بفاصلة إذا طالت.', def: 'ربط حدثين بحيث يتوقف الثاني (الجواب) على الأول (الشرط)، بأدوات مثل: إنْ، إذا، لو، مَن، مهما، كلما.', example: 'إذا درستَ، نجحتَ.' },
  praise: { label: 'مدح', mark: '.', why: 'أسلوب مدح بـ«{t}»، وهو جملة خبرية تنتهي بنقطة (.).', def: 'الثناء على شيء بـ«نِعْمَ» أو «حبَّذا».', example: 'نِعْمَ الصديقُ الكتابُ.' },
  blame: { label: 'ذم', mark: '.', why: 'أسلوب ذم بـ«{t}»، وهو جملة خبرية تنتهي بنقطة (.).', def: 'التقبيح بـ«بئسَ» أو «ساءَ» أو «لا حبَّذا».', example: 'بئسَ الخلقُ الكذبُ.' },
  preference: { label: 'تفضيل', mark: '.', why: '«{t}» اسم تفضيل على وزن «أفعل»، يدل على أن شيئين اشتركا في صفة وزاد أحدهما على الآخر فيها.', def: 'المقارنة بين شيئين اشتركا في صفة وزاد أحدهما على الآخر، باسم التفضيل على وزن «أفعل» (أكبر، أفضل) ومؤنثه «فُعلى».', example: 'العلمُ أفضلُ من المال.' },
  specification: { label: 'اختصاص', mark: '.', why: 'بعد الضمير «{t}» جاء اسم منصوب يوضحه ويخصّه (المختص)، وهذا أسلوب الاختصاص؛ ويجوز وضع المختص بين فاصلتين أو شرطتين.', def: 'ذكر اسم ظاهر منصوب بعد ضمير المتكلم (غالبًا) لتوضيحه وتخصيصه، مثل: نحن العربَ.', example: 'نحن العربَ نكرمُ الضيف.' },
  enticement: { label: 'إغراء', mark: '!', why: '«{t}» أسلوب إغراء: حثّ المخاطَب على أمر محمود، ويكثر أن ينتهي بعلامة التعجب (!) لما فيه من انفعال.', def: 'تنبيه المخاطَب على أمر محمود ليفعله، بذكر الاسم منصوبًا مكررًا أو معطوفًا: الصدقَ الصدقَ.', example: 'الاجتهادَ الاجتهادَ!' },
  warning: { label: 'تحذير', mark: '!', why: '«{t}» أسلوب تحذير: تنبيه المخاطَب على أمر مكروه ليجتنبه، ويكثر أن ينتهي بعلامة التعجب (!).', def: 'تنبيه المخاطَب على أمر مكروه ليجتنبه، بـ«إياك» أو بتكرار الاسم المحذَّر منه أو عطفه.', example: 'إياك والكذبَ!' },
  emphasis: { label: 'توكيد', mark: '.', why: '«{t}» من أدوات التوكيد؛ والتوكيد تقوية المعنى وتثبيته في نفس السامع.', def: 'تقوية المعنى وتثبيته: بإنّ وأنّ، ولقد وقد مع الماضي، ونون التوكيد، والتوكيد المعنوي (نفس، عين، كل، جميع)، والتوكيد اللفظي بتكرار اللفظ.', example: 'إنَّ العلمَ نورٌ.' },
  oath: { label: 'قسم', mark: '.', why: '«{t}» أسلوب قسم: حلف لتوكيد الكلام، ويحتاج إلى جواب.', def: 'توكيد الكلام بالحلف بأحرف القسم (الواو، الباء، التاء) أو بفعل القسم (أقسم، أحلف).', example: 'واللهِ لأجتهدنَّ.' },
  lament: { label: 'ندبة', mark: '!', why: '«{t}» أسلوب ندبة: نداء المتفجَّع عليه أو المتوجَّع منه بـ«وا»، وينتهي بعلامة التعجب (!).', def: 'نداء المتفجَّع عليه أو المتوجَّع منه بالحرف «وا»، وتلحقه غالبًا ألف وهاء: وامعتصماه!', example: 'وامعتصماه!' },
  restriction: { label: 'تخصيص (قصر)', mark: '.', why: '«{t}» أسلوب قصر (تخصيص): إثبات الحكم لشيء ونفيه عمّا عداه.', def: 'تخصيص أمر بأمر بطريقة مخصوصة: بـ«إنما»، أو بالنفي والاستثناء (ما… إلا)، أو بتقديم ما حقه التأخير.', example: 'إنما يخشى اللهَ العلماءُ.' },
  exception: { label: 'استثناء', mark: '.', why: '«{t}» أداة استثناء: إخراج ما بعدها من حكم ما قبلها.', def: 'إخراج ما بعد أداة الاستثناء من حكم ما قبلها، بأدوات مثل: إلا، غير، سوى، عدا، خلا، حاشا.', example: 'نجح الطلابُ إلا خالدًا.' },
  appeal: { label: 'استغاثة', mark: '!', why: '«{t}» أسلوب استغاثة: نداء من يُخلِّص من شدّة، وينتهي بعلامة التعجب (!).', def: 'نداء من يُخلِّص من شدّة أو يُعين على دفعها، بـ«يا» واللام المفتوحة مع المستغاث به والمكسورة مع المستغاث له.', example: 'يا لَلعلماءِ لِلجهلاء!' },
  hope: { label: 'ترجٍّ', mark: '.', why: '«{t}» أداة ترجٍّ: طلب أمر محبوب ممكن الحصول.', def: 'طلب أمر محبوب قريب الحصول، بـ«لعلّ» و«عسى».', example: 'لعلَّ الفرجَ قريبٌ.' },
  wish: { label: 'تمنٍّ', mark: '.', why: '«{t}» أداة تمنٍّ: طلب أمر محبوب مستحيل أو بعيد الحصول.', def: 'طلب أمر محبوب لا يُرجى حصوله لاستحالته أو بُعده، بـ«ليت» غالبًا.', example: 'ليتَ الشبابَ يعودُ يومًا.' },
  preoccupation: { label: 'اشتغال', mark: '.', why: 'تقدّم الاسم «{t}» وجاء بعده فعل مشغول عنه بضمير يعود إليه، وهذا أسلوب الاشتغال.', def: 'أن يتقدم اسم ويتأخر عنه فعل عامل في ضميره (أو في سببيّه)، فيشتغل الفعل بالضمير عن الاسم: الكتابَ قرأتُه.', example: 'الكتابَ قرأتُه.' },
  statement: { label: 'خبر', mark: '.', why: 'الجملة خبرية، والجملة الخبرية التامة تنتهي بنقطة (.).', def: 'الكلام الذي يحتمل الصدق والكذب.', example: 'ذهب الولدُ إلى المدرسة.' },
};

const style = (type, tokens, confidence = 0.9) => ({
  type,
  label: STYLE_INFO[type].label,
  trigger: tokens.map((t) => t.text).join(' '),
  start: tokens[0].start,
  end: tokens[tokens.length - 1].end,
  confidence,
});

function isAfal(word) {
  const k = key(word);
  for (const suf of AFAL_SUFFIXES) {
    if (k.endsWith(suf) && AFAL.has(k.slice(0, k.length - suf.length))) return true;
  }
  return false;
}
const isAfalExclamation = isAfal;

/**
 * Vocative span: «يا محمد»، «يا عبد الله»، «يا أيها الطالب»، «أيها الناس».
 * Returns the number of tokens the vocative occupies (0 if none).
 */
export function vocativeLength(tokens, i = 0) {
  const t0 = tokens[i];
  if (!t0) return 0;
  const k0 = stripConj(t0.text);
  let n;
  if (k0 === 'يا' || k0 === 'أيا') {
    const t1 = tokens[i + 1];
    if (!t1) return 0;
    const k1 = key(t1.text);
    // «يا ليت» is a wish, «يا له من» / «يا لروعة» exclamations, «يا للعلماء» an appeal
    if (k1 === 'ليت' || k1 === 'ليتني' || /^ل(ه|ها|هم|ك)$/.test(k1) || /^لل/.test(k1)) return 0;
    if (L.YA_LA_NOUNS.some((n) => k1 === 'ل' + key(n))) return 0;
    n = 2;
  } else if (k0 === 'ايها' || k0 === 'ايتها') {
    n = 1;
  } else {
    return 0;
  }
  // absorb «أيها/أيتها» and following definite words / إضافة («عبد الله»)
  while (i + n < tokens.length) {
    const prev = tokens[i + n - 1];
    if (prev.after) break; // punctuation already closes the vocative
    const k = key(tokens[i + n].text);
    if (k === 'ايها' || k === 'ايتها' || k === 'الله' || k === 'الرحمن' || (isDefinite(tokens[i + n].text) && n <= 3)) n++;
    else break;
  }
  return n;
}

// Imperative with hamzat wasl: «ادرس»، «اكتبوا»، «استمع». Excludes nouns of
// the أفعال / افتعال patterns («أطفال»، «اختبار») that share the opening alef.
function looksImperative(word) {
  const w = plain(stripConj(word));
  if (!/^ا[ء-ي]{2,5}$/.test(w) || w.startsWith('ال') || NOT_IMPER.has(key(w))) return false;
  if (w.length === 5 && w[3] === 'ا') return false; // أفعال: اطفال، اولاد
  if (w.length === 6 && w[4] === 'ا') return false; // افتعال/انفعال: اختبار
  return true;
}

// Styles that begin a clause (tokens = the clause's words).
function clauseStyles(tokens, clauseIndex = 0) {
  const out = [];
  if (!tokens.length) return out;
  const [t0, t1] = tokens;
  const k0 = key(stripConj(t0.text));
  const k0raw = key(t0.text);
  const p0 = plain(t0.text);
  const k1 = t1 ? key(t1.text) : '';

  // --- appeal (استغاثة): «يا لَلعلماء لِلجهلاء» ---
  if (k0 === 'يا' && t1 && (/^لل/.test(k1) || k1 === 'لله') && tokens.slice(2).some((t) => plain(t.text).startsWith('ل'))) {
    out.push(style('appeal', [t0, t1], 0.9));
    return out;
  }
  // --- lament (ندبة): «وامعتصماه»، «وا أسفاه» ---
  if (/^وا[ء-ي]{2,}اه$/.test(p0) || (p0 === 'وا' && t1 && /اه$/.test(plain(t1.text)))) {
    out.push(style('lament', p0 === 'وا' ? [t0, t1] : [t0], 0.9));
    return out;
  }

  // --- exclamation ---
  if (k0 === 'ما' && t1 && isAfalExclamation(t1.text)) out.push(style('exclamation', [t0, t1], 0.95));
  else if (k0 === 'يا' && t1 && (/^ل(ه|ها|هم|ك)$/.test(k1) || L.YA_LA_NOUNS.some((n) => k1 === 'ل' + key(n)))) out.push(style('exclamation', [t0, t1], 0.9));
  else if (k0raw === 'لله' && k1.startsWith('در')) out.push(style('exclamation', [t0, t1], 0.95));
  else if (k0raw === 'سبحان' && k1 === 'الله' && tokens.length === 2) out.push(style('exclamation', [t0, t1], 0.7));
  else if (isAfalExclamation(t0.text) && t1 && plain(t1.text).startsWith('ب') && tokens.length <= 3) out.push(style('exclamation', [t0, t1], 0.8));

  // --- question ---
  if (!out.length) {
    // «أي» later in a sentence or before a verb means "that is" («…، أي تحيل…»)
    const ayExplain = k0 === 'اي' && (k1 === 'ان' || clauseIndex > 0 || (t1 && looksPresentVerb(t1.text)));
    if (Q.has(k0) && !ayExplain) {
      // «كم» before a first-person verb / «أنت» is usually exclamatory («كم أحبك»)
      if (k0 === 'كم' && t1 && /^ا/.test(k1)) out.push(style('question', [t0], 0.5));
      else out.push(style('question', [t0], 0.95));
    } else if (Q_BEFORE_VERB.has(plain(stripConj(t0.text))) && t1 && looksPresentVerb(t1.text)) {
      out.push(style('question', [t0], 0.85));
    } else if (k0 === 'من' && t1 && MAN_NEXT.has(k1)) {
      out.push(style('question', [t0], 0.9));
    } else if (L.QUESTION_PHRASES.some((p) => p.length === 2 && key(p[0]) === k0 && key(p[1]) === k1)) {
      out.push(style('question', [t0, t1], 0.95));
    } else if (k0 === 'ما' || k0 === 'ماذا') {
      // «ما اسمك» / «ما الحل» → question; «ما ذهبت» is ambiguous (negation or
      // question) and is left to the AI model.
      if (!t1 || isDefinite(t1.text) || MAN_NEXT.has(k1) || /^(اسم|معني|رايك|سبب|قصة|عمل|لون|نوع)/.test(k1)) {
        out.push(style('question', [t0], t1 ? 0.85 : 0.6));
      }
    }
  }
  if (out.some((s) => s.type === 'question' || s.type === 'exclamation')) return out;

  // --- warning / enticement (تحذير / إغراء) ---
  if (TAHDHIR_W.has(p0)) { out.push(style('warning', t1 ? [t0, t1] : [t0], 0.95)); return out; }
  if (/^(احذر|احذري|احذروا)$/.test(p0) && t1 && isDefinite(t1.text)) { out.push(style('warning', [t0, t1], 0.85)); return out; }
  if (/^(عليك|عليكم|عليكما|عليكن)$/.test(p0) && t1 && /^بال/.test(plain(t1.text))) { out.push(style('enticement', [t0, t1], 0.85)); return out; }
  if (t1 && isDefinite(t0.text) && !t0.after) {
    const s0 = plain(stripConj(t0.text)), s1 = plain(stripConj(t1.text));
    const repeated = s0 === s1;
    const coupled = /^و/.test(plain(t1.text)) && isDefinite(s1) && tokens.length <= 3;
    if (repeated || coupled) {
      const pick = TAHDHIR.has(s0) ? 'warning' : IGHRAA.has(s0) ? 'enticement' : repeated ? 'enticement' : null;
      if (pick) { out.push(style(pick, [t0, t1], TAHDHIR.has(s0) || IGHRAA.has(s0) ? 0.85 : 0.6)); return out; }
    }
  }

  // --- oath (قسم) ---
  if (QASAM.has(p0) || (/^[وبت]الله$/.test(p0))) out.push(style('oath', [t0], 0.9));

  // --- praise / blame with «لا حبذا» must win over «لا» negation ---
  if (k0 === 'لا' && k1 === 'حبذا') { out.push(style('blame', [t0, t1], 0.9)); return out; }
  // --- restriction (قصر) with «إنما» ---
  if (p0 === 'إنما' || p0 === 'وإنما') { out.push(style('restriction', [t0], 0.9)); return out; }
  // --- prohibition / negation ---
  if (k0 === 'لا' && t1 && /^ت/.test(plain(t1.text)) && looksPresentVerb(t1.text) && !/^(تزال|تزالون|تبرح|تنفك|توجد|تحتاج)$/.test(plain(t1.text))) {
    out.push(style('prohibition', [t0, t1], 0.8));
  } else if (NEG.has(k0) || (k0 === 'لا' && t1)) {
    out.push(style('negation', [t0], 0.85));
  }
  // --- condition ---
  else if (COND.has(k0)) out.push(style('condition', [t0], 0.9));
  else if (k0 === 'ان' && t1 && !isDefinite(t1.text) && (looksPresentVerb(t1.text) || /^[ء-ي]{3}(ت|تم|وا)?$/.test(plain(t1.text))) && plain(t0.text) !== 'أن') {
    out.push(style('condition', [t0], 0.6));
  }
  // --- emphasis with «إنّ» / «لقد» / «قد + ماضٍ» at the start ---
  else if (/^(إن|وإن|فإن|إنه|إنها|إنهم|إنك|إنكم|إني|إنني|إننا|إنا)$/.test(p0)) { // «إن + فعل» was taken as شرط above
    out.push(style('emphasis', [t0], 0.85));
  } else if (/^(لقد|ولقد|فلقد)$/.test(p0) || (/^(قد|وقد)$/.test(p0) && t1 && !looksPresentVerb(t1.text))) {
    out.push(style('emphasis', [t0], 0.85));
  }
  // --- praise / blame ---
  else if (PRAISE.has(k0) && t1 && isDefinite(t1.text)) out.push(style('praise', [t0], 0.9));
  else if (k0 === 'حبذا') out.push(style('praise', [t0], 0.9));
  else if (BLAME.has(k0) && t1 && isDefinite(t1.text)) out.push(style('blame', [t0], 0.9));
  // --- wish / hope ---
  else if (TAMANNI.has(k0) || (k0 === 'يا' && TAMANNI.has(k1))) out.push(style('wish', k0 === 'يا' ? [t0, t1] : [t0], 0.9));
  else if (TARAJJI.has(k0)) out.push(style('hope', [t0], 0.9));
  // --- specification (اختصاص): «نحن العربَ نكرم الضيف» ---
  else if (/^(نحن|ونحن|إنا|إننا|أنا|وأنا)$/.test(p0) && t1 && isDefinite(t1.text) && tokens[2] && looksPresentVerb(tokens[2].text)) {
    out.push(style('specification', [t0, t1], 0.75));
  }
  // --- preoccupation (اشتغال): «الكتابَ قرأتُه» ---
  else if (isDefinite(t0.text) && t1 && !isDefinite(t1.text) && looksBusyVerb(t1.text)) {
    out.push(style('preoccupation', [t0, t1], 0.7));
  }
  // --- imperative ---
  else if (IMPER.has(k0) || looksImperative(t0.text)) {
    out.push(style('imperative', [t0], IMPER.has(k0) ? 0.85 : 0.65));
  }
  return out;
}

// A verb carrying an object pronoun that can refer back to a fronted noun.
function looksBusyVerb(word) {
  const w = plain(word);
  if (/(ته|تها|تهم|تهن|ناه|ناها|ناهم|وه|وها|وهم|تموه|تموها)$/.test(w) && w.length >= 5) return true;
  if (looksPresentVerb(w) && /(ه|ها|هم|هن)$/.test(w) && w.length >= 5) return true;
  if (looksImperative(w.replace(/(ه|ها|هم)$/, '')) && /(ه|ها|هم)$/.test(w)) return true;
  return false;
}

// Styles that can appear anywhere in the sentence.
function wideStyles(tokens) {
  const out = [];
  const seen = new Set();
  const add = (s) => { if (!seen.has(s.type)) { seen.add(s.type); out.push(s); } };
  const negated = (i) => tokens.slice(0, i).some((t) => /^(ما|لا|ليس|ليست|لم|لن)$/.test(plain(stripConj(t.text))));

  tokens.forEach((t, i) => {
    const p = plain(t.text);
    const ps = plain(stripConj(t.text));
    const prev = tokens[i - 1];
    const next = tokens[i + 1];

    // استثناء / قصر بالنفي والاستثناء
    if ((ps === 'إلا' && p !== 'وإلا') && i > 0) {
      if (next && /^(أن|أنه|أنها|أنهم|أنني|أننا|أنك)$/.test(plain(next.text))) return; // «إلا أنّ» = استدراك
      add(style(negated(i) ? 'restriction' : 'exception', [t], 0.85));
    } else if (/^(سوى|سوا)$/.test(ps) && i > 0) {
      add(style(negated(i) ? 'restriction' : 'exception', [t], 0.8));
    } else if (/^(عدا|خلا|حاشا)$/.test(ps) && i > 1) {
      add(style('exception', prev && plain(prev.text) === 'ما' ? [prev, t] : [t], 0.85));
    } else if (ps === 'غير' && i > 0 && prev && isDefinite(prev.text) && next && !isDefinite(next.text) && !prev.after) {
      add(style('exception', [t], 0.6));
    }

    // تفضيل: «أفضل من»، «أكبر مدينة»، «الكبرى»
    if (i > 0 && !(plain(prev.text) === 'ما') && (isAfal(t.text) || TAFDIL_EXTRA.has(ps)) && next && (plain(next.text) === 'من' || (!next.after && !isDefinite(next.text) && isAfal(t.text)))) {
      add(style('preference', [t, next].filter(Boolean), 0.8));
    } else if (i === 0 && isAfal(t.text) && next && plain(next.text) === 'من') {
      add(style('preference', [t, next], 0.8));
    } else if (i > 0 && TAFDIL_EXTRA.has(ps) && /^ال/.test(ps)) {
      add(style('preference', [t], 0.75));
    } else if (/^ال/.test(ps) && isAfal(ps.slice(2)) && i > 0) {
      add(style('preference', [t], 0.7));
    }

    // توكيد معنوي: «جاء الطلاب كلهم»
    if (L.TAWKID_MANAWI.test(p) && prev && (isDefinite(prev.text) || /^(هو|هي|هم)$/.test(plain(prev.text))) && !prev.after) {
      add(style('emphasis', [prev, t], 0.85));
    }
    // نون التوكيد: «لأجتهدنّ»
    if (/^ل[أينت][ء-ي]{2,}ن$/.test(p) && !/ون$|ين$|ان$/.test(p)) add(style('emphasis', [t], 0.8));
    // توكيد لفظي: تكرار اللفظ
    if (prev && i > 1 && plain(prev.text) === p && p.length > 1 && !prev.after) add(style('emphasis', [prev, t], 0.7));
    // قسم في وسط الكلام: «… والله …»
    if (i > 0 && QASAM.has(p) && p !== 'ورب') add(style('oath', [t], 0.8));
  });
  return out;
}

// marks that make a style "strong" (override a plain «.»)
const STRONG = (s) => s && (STYLE_INFO[s.type].mark === '؟' || STYLE_INFO[s.type].mark === '!');

/**
 * Analyse one sentence. Returns { styles, expected } where `expected` is the
 * end mark the rules are confident about, or null when it's ambiguous (the AI
 * model, if enabled, decides those).
 */
export function analyzeSentence(sentence) {
  const tokens = sentence.tokens;
  const styles = [];
  const vocLen = vocativeLength(tokens, 0);
  if (vocLen) styles.push(style('vocative', tokens.slice(0, vocLen), 0.95));

  const cls = clauses(tokens.slice(vocLen));
  const perClause = cls.map((c, i) => clauseStyles(c, i));
  // a vocative can also open a later clause: «أحسنت، يا علي»
  cls.forEach((c, i) => {
    if (i > 0) {
      const v = vocativeLength(c, 0);
      if (v) perClause[i].unshift(style('vocative', c.slice(0, v), 0.9));
    }
  });
  perClause.forEach((s) => styles.push(...s));
  for (const w of wideStyles(tokens.slice(vocLen))) if (!styles.some((s) => s.type === w.type)) styles.push(w);

  // Which style decides the end mark: the last clause if it is decisive,
  // otherwise a «؟» / «!» style anywhere in the sentence.
  const decisive = (s) => s && STYLE_INFO[s.type].mark;
  const last = (perClause[perClause.length - 1] || []).find(decisive);
  const strong = styles.find(STRONG);
  const chosen = STRONG(last) ? last : (strong || last);

  let expected = null;
  if (chosen) {
    const mark = STYLE_INFO[chosen.type].mark;
    // a «.» from a style can still be an intonation question → leave room for the AI model
    // «!» after إغراء/تحذير is customary, not required → suggest it only when the mark is missing
    const cap = mark === '.' ? 0.7 : (chosen.type === 'warning' || chosen.type === 'enticement') ? 0.75 : 1;
    expected = { mark, style: chosen, confidence: Math.min(chosen.confidence, cap) };
  } else if (!styles.some((s) => s.type === 'vocative') && tokens.length >= 3 && !/^(ما|ماذا|من|متي|كم)$/.test(key(stripConj(tokens[0].text)))) {
    // plain statement (خبر). Lower confidence: could be an intonation question.
    expected = { mark: '.', style: { type: 'statement', label: STYLE_INFO.statement.label, trigger: '' }, confidence: 0.55 };
  } else if (styles.some((s) => s.type === 'vocative') && tokens.length > vocLen) {
    expected = { mark: '.', style: { type: 'statement', label: STYLE_INFO.statement.label, trigger: '' }, confidence: 0.55 };
  }
  if (!styles.length) styles.push({ type: 'statement', label: STYLE_INFO.statement.label, trigger: '', start: sentence.start, end: sentence.bodyEnd, confidence: 0.5 });
  return { styles, expected, vocLen };
}

export const explainStyle = (s) => STYLE_INFO[s.type].why.replace('{t}', s.trigger);

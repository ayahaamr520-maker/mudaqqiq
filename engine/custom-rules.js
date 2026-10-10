// ✚ Add your own rules here (requirement 9) — no engine code needed.
//
// Each rule:
//   id           unique name
//   category     'spelling' | 'grammar' | 'punctuation'
//   find         a whole word ('كلمة') or a regular expression (/…/g)
//   replace      the correction (string, or a function receiving the match)
//   title        short label shown on the card
//   explanation  the «why» shown to the user
//
// The two below are real examples; copy one and edit it.

export const CUSTOM_RULES = [
  {
    id: 'custom-bi-ism',
    category: 'spelling',
    find: 'بإسم',
    replace: 'باسم',
    title: 'همزة وصل',
    explanation: 'همزة «اسم» همزة وصل، فلا تُكتب حتى مع حرف الجر: «باسم».',
  },
  {
    id: 'custom-yatim-taalim',
    category: 'grammar',
    find: /(?<![ء-ي])يتم (تدريس|شرح|عرض|تقديم)(?![ء-ي])/g,
    replace: (m) => ({ 'تدريس': 'يُدرَّس', 'شرح': 'يُشرَح', 'عرض': 'يُعرَض', 'تقديم': 'يُقدَّم' })[m[1]],
    title: 'أسلوب ركيك',
    explanation: 'استخدام «يتم + مصدر» أسلوب منقول عن الترجمة؛ والأفصح استعمال الفعل المبني للمجهول مباشرة.',
    severity: 'hint',
    confidence: 0.6,
  },
];

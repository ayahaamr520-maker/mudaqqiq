# مُدقِّق (Mudaqqiq) — User Manual

An Arabic writing assistant. It finds **punctuation, style, grammar and spelling** mistakes in Arabic text, suggests the fix, and explains **why**. You can use it in four places:

| | Where | Needs |
|---|---|---|
| **A** | Website demo (write and fix in the browser) | Node.js |
| **B** | Microsoft Word (side panel), web or desktop | Node.js + a Microsoft account |
| **C** | Google Docs (side panel) | A Google account |
| **D** | Browser extension (Gmail, WhatsApp Web, any text box) | Chrome or Edge |

Everything runs **on your own computer**. No text is ever sent to a server. That includes the two AI models, which run inside the browser.

> **Quick start:** install Node.js once (step 0), then double-click `1-start-website.bat`. That's it.

---

## Contents
0. [One-time setup](#0-one-time-setup)
1. [The website demo](#1-the-website-demo)
2. [Word on the web (free, no activation needed)](#2-word-on-the-web-free-no-activation-needed)
3. [Word desktop (activated Word only)](#3-word-desktop-activated-word-only)
4. [Google Docs](#4-google-docs)
5. [Browser extension](#5-browser-extension)
6. [What it checks (and how accurate it is)](#6-what-it-checks-and-how-accurate-it-is)
7. [Running the accuracy test yourself](#7-running-the-accuracy-test-yourself)
8. [Adding your own rules](#8-adding-your-own-rules)
9. [Giving it to someone else](#9-giving-it-to-someone-else)
10. [Putting it online (a public link)](#10-putting-it-online-a-public-link)
11. [Troubleshooting](#11-troubleshooting)
12. [For developers](#12-for-developers)

---

## 0. One-time setup

1. **Install Node.js.** Go to <https://nodejs.org>, download the **LTS** version and install it with the default options.
2. **Restart your computer** (or at least close all terminal windows) so Windows picks up Node.js.
3. That's all. The launcher files download anything else they need the first time (needs internet once).

> Google Docs (section 4) doesn't need Node.js at all.

### The launcher files
Everything is started by double-clicking a file in the `arabic-grammar-assistant` folder:

| File | What it does |
|---|---|
| `1-start-website.bat` | Starts the website demo (and the accuracy test page) and opens it in your browser |
| `2-start-word-addin-server.bat` | Starts the server that Word loads the add-in from (both Word web and desktop) |
| `3-load-into-word-desktop.bat` | Adds the Mudaqqiq button to **Word desktop** |
| `4-build-extension.bat` | Prepares the browser extension folder (with both AI models) |
| `5-remove-from-word-desktop.bat` | Removes the add-in from Word desktop |

A black window opens for each one. **Keep it open while you use the tool.** Closing the window stops it.

> If Windows shows "Windows protected your PC", click **More info → Run anyway**. These are plain text files you can open in Notepad to see what they do.

---

## 1. The website demo

### Start it
Double-click **`1-start-website.bat`**. Your browser opens **http://localhost:8080/web/**.
(If it doesn't open by itself, type that address into the browser.)

### Use it
- **Type or paste Arabic text** in the big box. Mistakes are underlined as you type:
  - 🔵 **blue**: punctuation (ترقيم)
  - 🔴 **red**: grammar (نحو)
  - 🟠 **orange**: spelling (إملاء)
  - 🟣 **purple**: AI suggestion (ذكاء اصطناعي)
  - dotted underline: a gentle hint, e.g. the sentence you are still typing has no full stop yet, or an optional comma
- **Click an underlined word** (or move onto it with the arrow keys). A small window opens next to it with three buttons:
  - **✓ تطبيق التصحيح**: apply the fix
  - **✕ تجاهل**: ignore it (it won't be shown again for that text)
  - **💡 لماذا؟**: show the explanation
- The **الاقتراحات** (Suggestions) list on the side shows every issue as a card with the same buttons. Click a card to jump to the word.
- **تصحيح الكل** (Fix all) applies every suggestion at once.
- **Ctrl+Z** undoes a fix, like any normal edit.
- The **الأساليب** (Styles) tab shows the style of each sentence (all 22 styles; see section 6). Click a style label to see why.
- The **الدليل** (Guide) tab lists all 22 styles and all 13 punctuation marks with a definition and an example. Click an example to load it into the editor.
- **أمثلة** (Examples) loads ready-made sample texts, including «الأساليب الاثنان والعشرون» (one sentence per style) and «علامات الترقيم» (one mistake per mark).
- **نسخ** copies the text; **مسح** clears it.

### Spell check (always on)
A dictionary of about 530,000 Arabic words loads automatically when the page opens (a few seconds the first time). It flags words that don't exist and suggests the closest real word, e.g. «مفيذ» → «مفيد», «جمييع» → «جميع», «ياصديقي» → «يا صديقي». A card can offer more than one suggestion: click **أو: …** to pick another.

### Turn on the AI models
There are three buttons. Each loads one model (135–185 MB). The **first time** takes a minute (a purple bar shows progress); after that the browser keeps a copy. The models run in the background, so typing never freezes.

| Button | What it adds | Try the example |
|---|---|---|
| **ذكاء اصطناعي: الترقيم** | Missing commas and colons, and splitting text that has **no punctuation at all** into sentences | «نص بلا علامات ترقيم» |
| **ذكاء اصطناعي: الإملاء والنحو** | Hamza (انا → أنا), ta marbuta (مدرسه → مدرسة), joined/split words (ب الصحة → بالصحة، ياشباب → يا شباب), and some grammar | «أخطاء إملائية» |
| **ذكاء اصطناعي: السياق** | Real words used by mistake, judged from the sentence: «كيف حاك؟» → «كيف حالك؟». Also picks the best spell-check suggestion by meaning («الطاب مجتهد» → «الطالب»). Takes 2–3 seconds per new sentence. | «أخطاء كتابة» |

Click a button again to turn it off. The rules and the dictionary keep working either way.

### Stop it
Close the black window.

---

## 2. Word on the web (free, no activation needed)

Use this if your desktop Word isn't activated. Word on the web is free with any **personal** Microsoft account.

1. Double-click **`2-start-word-addin-server.bat`**.
   - **First time only:** it installs a local security certificate. Click **Yes** when Windows asks. This lets Word trust your computer's add-in over HTTPS.
   - Leave the window open.
2. Check it works: open **https://localhost:3000/web/** in your browser. You should see the demo page with **no** security warning.
3. Go to **https://www.office.com**, sign in, and open **Word → Blank document**.
4. In Word: **Home → Add-ins** → choose **More Add-ins** (or **Advanced…**) → **Upload My Add-in** → **Browse** → pick
   `arabic-grammar-assistant\word-addin\manifest.xml` → **Upload**.
5. The **مُدقِّق** panel opens on the side. (Later you can reopen it from the **المدقق العربي** button on the Home tab or from **Add-ins**.)

### Use it in Word
- **فحص المستند**: checks the whole document. Each card says which paragraph it's in.
- **فحص الفقرة الحالية أثناء الكتابة** (on by default): while you type, the panel shows the issues in the paragraph your cursor is in.
- **Click a card** to select that text in the document.
- **✓ تطبيق التصحيح / ✕ تجاهل / 💡 لماذا؟** work as on the website. Fixes go into Word's undo history.
- **تصحيح الكل** applies everything.
- **الذكاء الاصطناعي** checkbox: turns on **both** AI models (punctuation + spelling). The first load takes a minute.

### Notes
- The server window (`2-start-word-addin-server.bat`) must be **running on the same computer** whenever you use the add-in. If it's closed, the panel is blank. To avoid this, put it online (section 10).
- You only upload the manifest once per browser. If it disappears, upload it again.
- University or work accounts sometimes block uploading add-ins. Use a personal Microsoft account (outlook.com / hotmail.com).

---

## 3. Word desktop (activated Word only)

1. Double-click **`2-start-word-addin-server.bat`** and leave it open (first time: click **Yes** for the certificate).
2. Double-click **`3-load-into-word-desktop.bat`**. Word opens with an **المدقق العربي** button on the **Home** tab.
3. Click it to open the panel. It works the same as [Word on the web](#use-it-in-word).

To remove it later: double-click **`5-remove-from-word-desktop.bat`**.

---

## 4. Google Docs

No server and no Node.js: the add-on lives inside your Google account. Setup takes about 3 minutes, once per document (or once for all documents; see the tip below).

### Install
1. Open the Google Doc you want to check.
2. Menu **Extensions → Apps Script**. A code editor opens in a new tab.
3. **Code.gs:** delete everything in the editor, then open `arabic-grammar-assistant\gdocs-addon\Code.gs` in Notepad, copy all of it, and paste it in.
4. **Sidebar:** click **＋ (Add a file) → HTML**, name it exactly **`Sidebar`**, delete what's there, and paste in all of `gdocs-addon\Sidebar.html`.
5. **Engine:** click **＋ → HTML** again, name it exactly **`Engine`**, and paste in all of `gdocs-addon\Engine.html`. It's a long file; copy all of it.
6. Click **💾 Save**. Close the Apps Script tab and **reload the Google Doc**.
7. A new menu **مدقق** appears (it can take a few seconds). Click **مدقق → فتح المدقق العربي**.
8. **First time only:** Google asks for permission.
   - Click **Continue** and choose your account.
   - You'll see **"Google hasn't verified this app"**. That's normal for a script you wrote yourself. Click **Advanced → Go to … (unsafe)**, then **Allow**.
   - It only asks to see and edit **this document**.

### Use it
- **فحص المستند** checks the whole document. **فحص الفقرة الحالية أثناء الكتابة** checks the paragraph your cursor is in, every 2–3 seconds (Google Docs gives add-ons no instant "you typed" signal).
- **Click a card** to highlight the text in the document. **✓ تطبيق التصحيح / ✕ تجاهل / 💡 لماذا؟** and **تصحيح الكل** work as everywhere else.

### Good to know
- The Google Docs version uses the **rules only** (no AI models). Google's add-on panels are too limited to run 270 MB of models comfortably.
- **Tip (all documents):** instead of steps 1–2, go to <https://script.google.com> → **New project**, add the same three files, then **Deploy → Test deployments → Editor add-on → Google Docs → choose a test document**. Ask if you want this set up properly as an add-on.
- If you change any rules (section 8), rebuild the engine with `npm run build:gdocs` and paste the new `Engine.html` again.

---

## 5. Browser extension

Checks Arabic while you type in **any website's text box**: Gmail, Outlook web, WhatsApp Web, forms, comment boxes.

### Install (once)
1. Double-click **`4-build-extension.bat`**. The first time, it downloads the AI runtime (about 25 MB) and copies both models. The `extension` folder ends up around 290 MB.
2. Open **Chrome** and go to `chrome://extensions` (in **Edge**, go to `edge://extensions`).
3. Turn on **Developer mode** (top right in Chrome, left side in Edge).
4. Click **Load unpacked** and choose the folder `arabic-grammar-assistant\extension`.
5. The extension **مُدقِّق** appears in the list. Click the 🧩 puzzle icon in the toolbar and **pin** مُدقِّق so its icon is always visible.

### Use it
- Click into any text box and type Arabic. A small round **badge** appears at the bottom-left of the box:
  - **red number**: how many issues were found
  - **green ✓**: no issues
- Click the badge to open the list, then use **✓ تطبيق التصحيح / ✕ تجاهل / 💡 لماذا؟**.
- **AI models:** click the مُدقِّق icon in the toolbar and tick **ذكاء اصطناعي: الترقيم** and/or **ذكاء اصطناعي: الإملاء والنحو**. They run inside the extension, offline. The first check after turning one on takes a few seconds.

### Good to know
- It does **not** work inside **Google Docs**, because Docs draws its text in a way extensions can't read. Use section 4 for Docs.
- After changing any rules (section 8), run `4-build-extension.bat` again and click the **reload ⟳** icon on the extension's card in `chrome://extensions`.
- Chrome may show a "developer mode extensions" notice at startup. That's normal for extensions you load yourself.
- To make a small rules-only version (no models), run `node tools/build-extension.mjs --no-ai`.

---

## 6. What it checks (and how accurate it is)

### Punctuation
| Example | Fix | Why |
|---|---|---|
| كيف حالك. | كيف حالك؟ | Starts with a question word, so it needs «؟» |
| ما أجمل السماء | ما أجمل السماء! | «ما أفعلَ» exclamation pattern |
| يا محمد ادرس دروسك | يا محمد، ادرس دروسك. | Comma after the vocative, full stop at the end |
| كيف حالك? أنا بخير, | كيف حالك؟ أنا بخير، | Arabic marks instead of Latin `? , ;` |
| كيف حالك ؟ | كيف حالك؟ | No space before punctuation |
| ما أروع هذا!!! | ما أروع هذا! | One mark is enough («؟!» and «...» are allowed) |
| السلام عليكم كيف حالك اليوم *(AI)* | السلام عليكم، كيف حالك اليوم؟ | Splits unpunctuated text into sentences |

### Sentence styles it recognises (all 22)
النداء · المدح · الذم · الاستفهام · التعجب · الأمر · النهي · النفي · التفضيل · الشرط · الاختصاص · الإغراء · التحذير · التوكيد · القسم · الندبة · التخصيص (القصر) · الاستثناء · الاستغاثة · الترجي · التمني · الاشتغال

Each detected style is shown in the **الأساليب** tab with the word that triggered it. Click it to see why. Styles also set the right end mark: questions get «؟»; exclamation, lament (ندبة) and appeal (استغاثة) get «!»; enticement and warning are offered «!» when the end mark is missing.

### Punctuation marks it checks (all 13)
| Mark | What it checks |
|---|---|
| النقطة . | Missing at the end of a sentence; doubled «..» |
| الفاصلة ، | Latin «,»; spacing; after the vocative (يا محمد،); after answer words (نعم، بلى، كلا، أجل); after openers (أما بعد، أولًا، ثانيًا، أخيرًا، مثلًا); AI adds the rest |
| الفاصلة المنقوطة ؛ | Latin «;»; before cause/result (؛ لأن، ؛ لذلك) |
| النقطتان : | Before quoted speech after قال/أجاب/سأل…; after «كالتالي / ما يلي»; after «ملاحظة / مثال» at the start of a line |
| علامة الاستفهام ؟ | Missing or wrong after a question; Latin «?» |
| علامة التعجب ! | After exclamation, lament, appeal; repeated «!!!» |
| علامتا التنصيص « » " " | Opened but not closed (or the reverse); spaces inside; missing space outside |
| الشرطة - | Missing space after a dash at the start of a line |
| الشرطتان - - | Spacing around the dashes of a parenthetical phrase |
| القوسان ( ) | Not closed / not opened; typed reversed «)…(»; spaces inside; missing space outside |
| القوسان المعقوفان [ ] | Same checks as ( ) |
| القوسان المزهَران ﴿ ﴾ | Quranic verses written in ( ) or « » after «قال تعالى» → ﴿ ﴾; reversed ﴾…﴿ |
| علامة الحذف ... | Space before it; missing space after it; «....» → «...» |

The **الدليل** (Guide) tab on the website lists every style and every mark with a definition and an example you can click to try.

### Grammar
| Example | Fix |
|---|---|
| إن الطالبات مجتهدون | إن الطالبات **مجتهدات** (agreement) |
| إن المعلمون مخلصون | إن **المعلمين** مخلصون (اسم إنّ منصوب) |
| إن المهندسين مبدعين | إن المهندسين **مبدعون** (خبر إنّ مرفوع) |
| هذا المدرسة | **هذه** المدرسة |
| المرأة الذي | المرأة **التي** |
| ذهب الطالبة | **ذهبت** الطالبة |
| كان الجو جميل *(AI)* | كان الجو **جميلًا** (خبر كان منصوب) |

### Spelling
- **Dictionary (always on):** words that don't exist (a letter missing, doubled, swapped or the neighbouring key: «مفيذ» → «مفيد»، «جمييع» → «جميع»), and common misspellings that are far rarer than the correct form («المدرسه» → «المدرسة»).
- **Context model:** real words in the wrong place («كيف حاك؟» → «حالك»).
- **Rules:** missing hamza in common words (انا ← أنا، الى ← إلى، اذا ← إذا …), hamzat wasl (الإهتمام ← الاهتمام), انشاء الله ← إن شاء الله, هاذا ← هذا, فى ← في …
- **AI model:** hamza in any word, ta marbuta (السياره ← السيارة), joined words (و لا ← ولا، ف ي ← في), split words (ياشباب ← يا شباب), and more. Each correction comes with an explanation of the rule behind it.

### Accuracy (measured on real text; full report in [docs/EVALUATION.md](docs/EVALUATION.md))

| What | Result |
|---|---|
| Correct end mark on statements (punctuation removed first) | **99.5%** |
| Correct «؟» on real questions (punctuation removed first) | **95.3%** |
| Questions written with «.» that get fixed to «؟» | **88%** (rules alone: 65%) |
| Commas restored (F1) | **≈ 51%**: the weak point; many extra commas are style choices, so they're shown as hints |
| Common spelling mistakes fixed (1,109 injected) | **88.7%** with the AI model (rules alone: 30%) |
| AI spelling suggestions on published Wikipedia text that were real mistakes (checked by hand) | **81%** (50 of 62) |
| Rule suggestions on published Wikipedia text that were real mistakes | **46 of 46** |
| Typos corrected (dropped / doubled / swapped letter, neighbouring key) | **60%** with the dictionary alone, **82%** with the context model |

**Known limits:** Arabic without diacritics is sometimes truly ambiguous («ما ذهبت» could be a statement or a question), so the tool stays quiet or lets the AI decide. The AI can stumble on proper names. Grammar rules cover the cases listed above, not full إعراب. It's a prototype.

---

## 7. Running the accuracy test yourself

1. Double-click `1-start-website.bat`.
2. Go to **http://localhost:8080/eval/** and click **تشغيل التقييم** (tick **سريع** for a 1-minute version on 100 sentences).
3. The page shows all the tables from section 6. **تنزيل النتائج** saves them as a file.

The test data (600 Wikipedia sentences + 300 real questions) is in `eval\data.json`. To build a fresh set from new Wikipedia articles: `python tools\build_eval_data.py`.

---

## 8. Adding your own rules

No programming is needed for simple rules. Open **`engine\custom-rules.js`** in Notepad (or VS Code) and copy an existing block:

```js
  {
    id: 'my-rule-1',                 // any unique name
    category: 'spelling',            // 'spelling' | 'grammar' | 'punctuation'
    find: 'مسئول',                   // the wrong word
    replace: 'مسؤول',                // the correction
    title: 'كتابة الهمزة',            // short title on the card
    explanation: 'تُكتب الهمزة على الواو هنا لأن …',   // the "why" text
  },
```

Put it inside the `CUSTOM_RULES = [ … ]` list (keep the comma between blocks), save, then **refresh the website** (Ctrl+F5).
- **Extension:** run `4-build-extension.bat` and reload it.
- **Google Docs:** run `npm run build:gdocs` and paste the new `gdocs-addon\Engine.html` into Apps Script.

More word lists (question words, exclamation words, common misspellings, verbs) are in **`engine\lexicon.js`**. Adding a word there extends the existing rules. For example, add a new «أفعل» word to `EXCLAMATION_AFAL` and «ما + that word» becomes an exclamation.

---

## 9. Giving it to someone else

1. Zip the whole **`arabic-grammar-assistant`** folder. **Include** `web\models` (the two AI models, ~270 MB); without it the AI buttons won't work. You can leave out `extension\models` and `extension\vendor`, because `4-build-extension.bat` recreates them.
2. They unzip it anywhere (e.g. Desktop), install **Node.js LTS** (section 0), and follow this guide.
3. **Google Docs only:** they just need the three files from `gdocs-addon` (section 4). No zip or Node.js needed.

Or give them a public link (section 10). Then they need nothing at all.

---

## 10. Putting it online (a public link)

The repository has a GitHub Action (`.github/workflows/pages.yml`) that publishes the website automatically. On every push to `main` it:

1. runs the tests,
2. rebuilds the two AI models from Hugging Face (only the first time; after that they're cached),
3. points the Word add-in at the live address,
4. publishes the site to **https://ayahaamr520-maker.github.io/mudaqqiq/**.

**One-time setup** (the repository is private, so this needs GitHub Pro):
1. Upgrade the account to **GitHub Pro**: github.com → Settings → Billing and plans → Upgrade.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Go to the **Actions** tab → **Deploy website** → **Run workflow** (or just push any change).

The first run takes about 10 minutes (building the models); later runs take 1–2 minutes. After that:
- **Website:** https://ayahaamr520-maker.github.io/mudaqqiq/web/
- **Accuracy test:** https://ayahaamr520-maker.github.io/mudaqqiq/eval/
- **Word add-in for anyone:** download `word-addin/manifest.xml` from https://ayahaamr520-maker.github.io/mudaqqiq/word-addin/manifest.xml and upload it in Word (section 2, steps 3–5). No server on your laptop is needed.

> The code stays private; the published website itself is public (anyone with the link can use it).

**Alternative without the Action:** upload the models to Hugging Face and point the site at them (`python tools/upload_to_hf.py YOUR-HF-USERNAME`, then `node tools/configure-public.mjs --hf YOUR-HF-USERNAME --site https://…`). This is only needed if you host the site somewhere other than GitHub Pages.

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| The black window closes immediately or says "Node.js is not installed" | Install Node.js LTS from nodejs.org, restart the PC, try again |
| Browser says "This site can't be reached" | The launcher window isn't running; start it again and keep it open |
| `EADDRINUSE` / "address already in use" | It's already running in another window; use that one, or close it first |
| Word panel is blank or says "can't load" | `2-start-word-addin-server.bat` must be running. Check https://localhost:3000/web/ opens without a warning |
| Certificate warning at https://localhost:3000 | Close the server, delete the folder `C:\Users\<you>\.office-addin-dev-certs`, run `2-start-word-addin-server.bat` again and click **Yes** |
| "Upload My Add-in" is missing in Word on the web | Use a personal Microsoft account; school/work accounts may hide it |
| Word desktop says it needs activation | Use Word on the web (section 2) |
| AI button says «تعذّر تحميل النموذج» | The `web\models\arabic-punctuation`, `arabic-spelling` or `arabic-context` folder is missing. Copy it back, or regenerate it (section 12) |
| A wrong word isn't flagged | If it's a real word used in the wrong place («حاك» instead of «حالك»), turn on **ذكاء اصطناعي: السياق** |
| A name or rare word is flagged as unknown | Click **✕ تجاهل**. The dictionary comes from Wikipedia and doesn't know every name |
| Google Docs: no «مدقق» menu | Reload the document and wait ~10 seconds. Check the three files are named exactly `Code`, `Sidebar`, `Engine` |
| Google Docs: an error mentioning `Engine` or `Sidebar` | The two HTML files must be named exactly `Engine` and `Sidebar` (Apps Script adds `.html` itself) |
| Extension badge doesn't appear | The text must contain Arabic. Reload the page after installing. It doesn't work in Google Docs |
| Extension AI does nothing | Re-run `4-build-extension.bat` (it needs the `web\models` folder), reload the extension, and tick the AI options in its popup |
| A correction is wrong | Click **✕ تجاهل**. To stop a rule completely, remove or edit it (section 8) |
| Changes to rules don't show | Hard-refresh with **Ctrl+F5**; for the extension, rebuild and reload it; for Google Docs, rebuild and re-paste `Engine.html` |

---

## 12. For developers

```
engine/              shared checking engine (plain JavaScript, no dependencies)
  text.js            tokenising + sentence splitting with offsets
  styles.js          sentence-style recognition, expected end mark
  rules.js           built-in rules (punctuation, spelling, grammar)
  lexicon.js         word lists
  custom-rules.js    user rules (no-code)
  engine.js          createEngine / analyze / analyzeAsync / applyIssue / applyAll
  ai-merge.js        merges punctuation-model predictions with rule results
  ai/loader.js              loads a BERT token classifier with transformers.js 4.2.0
  ai/punctuation-model.js   AraBERT punctuation provider
  ai/spelling-model.js      CAMeL SWEET spelling/grammar provider
  ai/camel-edits.js         JS port of CAMeL's edit-tag decoder (parity-tested against Python)
  ai/spelling-diff.js       turns corrected text into separate issues + explanations
web/                 website demo (config.js = remote model ids)
word-addin/          Word add-in (manifest.xml, taskpane.html/js)
gdocs-addon/         Google Docs add-on (Code.gs, Sidebar.html, Engine.html = bundled engine)
extension/           Chrome/Edge extension (Manifest V3; AI in an offscreen document)
eval/                accuracy evaluation page + data.json + results.json
tools/               export_onnx.py, upload_to_hf.py, build_eval_data.py,
                     build-extension.mjs, build-gdocs.mjs, configure-public.mjs
tests/               engine + CAMeL parity tests, mock pages for Word / Docs / extension
docs/                ANALYSIS.md (design + model choice), EVALUATION.md (accuracy)
```

Commands (from inside the project folder):

| Task | Command |
|---|---|
| Run the tests | `npm test` |
| Start the website | `npm start`, then open http://localhost:8080/web/ |
| Rebuild the extension | `npm run build:ext` |
| Rebuild the Google Docs engine | `npm run build:gdocs` |
| Rebuild the AI models | `pip install torch "transformers<5" onnx onnxruntime`, then `python tools/export_onnx.py` |
| Rebuild the test data | `python tools/build_eval_data.py` |

Using the engine in your own code:

```js
import { createEngine, applyAll } from './engine/engine.js';
const engine = createEngine();
const { issues, sentences } = engine.analyze('كيف حالك.');
console.log(applyAll('كيف حالك.', issues));   // كيف حالك؟
engine.addRule({ id: 'x', find: 'مثلن', replace: 'مثلًا', explanation: '…' });
engine.addProvider(myAiProvider);              // { name, predictPunctuation(words) } or { name, analyze(doc) }
```

**Credits:** punctuation model [makdadTaleb/arabic-punctuation-arabert](https://huggingface.co/makdadTaleb/arabic-punctuation-arabert) (MIT); spelling/grammar model [CAMeL-Lab/text-editing-qalb14-nopnx](https://huggingface.co/CAMeL-Lab/text-editing-qalb14-nopnx) (MIT, Alhafni & Habash, ACL 2025); both run with transformers.js / ONNX Runtime Web. Test data: Arabic Wikipedia (CC BY-SA 4.0) and ARCD (MIT).

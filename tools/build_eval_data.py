"""Builds eval/data.json — the test set for eval/index.html.

  python tools/build_eval_data.py

Sources (both freely licensed):
  • Arabic Wikipedia (CC BY-SA 4.0): random articles → well-punctuated sentences
  • ARCD (MIT, hsseinmz/arcd on Hugging Face): questions written by people
Uses only the Python standard library. A fixed random seed keeps the set stable.
"""
import json, random, re, time, urllib.error, urllib.parse, urllib.request

random.seed(7)
UA = {"User-Agent": "mudaqqiq-eval/0.1 (student prototype; contact via project README)"}
AR = re.compile(r"[ء-ي]")


def get(url, tries=6):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            if isinstance(e, urllib.error.HTTPError) and e.code not in (429, 500, 502, 503, 504):
                raise
            if k == tries - 1:
                raise
            time.sleep(5 * (k + 1))  # rate limited / network hiccup: back off


def wiki_sentences(target=600):
    out, seen = [], set()
    while len(out) < target:
        q = urllib.parse.urlencode({
            "action": "query", "format": "json", "generator": "random", "grnnamespace": 0, "grnlimit": 20,
            "prop": "extracts", "explaintext": 1, "exintro": 1, "exlimit": 20,
        })
        pages = get("https://ar.wikipedia.org/w/api.php?" + q).get("query", {}).get("pages", {})
        for p in pages.values():
            text = p.get("extract", "")
            for para in text.split("\n"):
                # sentence = text up to an end mark
                for s in re.findall(r"[^.!؟?\n]+[.!؟]", para):
                    s = s.strip()
                    words = s.split()
                    if not (6 <= len(words) <= 40): continue
                    if len(AR.findall(s)) < 0.8 * len(re.sub(r"\s", "", s)): continue  # mostly Arabic
                    if re.search(r"[()\[\]{}=|«»\"]|\d{3,}", s): continue  # skip lists, refs, quotes
                    if s in seen: continue
                    seen.add(s)
                    out.append(s)
        print(f"  {len(out)} sentences…", flush=True)
        time.sleep(2)
    random.shuffle(out)
    return out[:target]


def arcd_questions(target=300):
    out = []
    for off in range(0, 1200, 100):
        rows = get(f"https://datasets-server.huggingface.co/rows?dataset=hsseinmz/arcd&config=plain_text&split=train&offset={off}&length=100")["rows"]
        for r in rows:
            q = r["row"]["question"].strip()
            if q.endswith("؟") and 3 <= len(q.split()) <= 25 and not re.search(r"[()\[\]\"«»]", q):
                out.append(q)
    random.shuffle(out)
    return out[:target]


if __name__ == "__main__":
    data = {
        "built": time.strftime("%Y-%m-%d"),
        "wikipedia": wiki_sentences(),
        "questions": arcd_questions(),
        "sources": {
            "wikipedia": "Arabic Wikipedia random articles, CC BY-SA 4.0",
            "questions": "ARCD (hsseinmz/arcd), MIT",
        },
    }
    json.dump(data, open("eval/data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(data["wikipedia"]), "wikipedia sentences,", len(data["questions"]), "questions")

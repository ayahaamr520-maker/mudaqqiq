"""Builds web/data/ar-words.txt: Arabic word forms, most frequent first, one per line.

Source: word frequencies of Arabic Wikipedia (IlyaSemenov/wikipedia-word-frequency, MIT).
Only forms seen at least MIN_COUNT times are kept, which drops most typos.

    python tools/build_lexicon.py
"""
import io, os, re, urllib.request

URL = "https://raw.githubusercontent.com/IlyaSemenov/wikipedia-word-frequency/master/results/arwiki-2022-08-29.txt"
MIN_COUNT = 5
OUT = os.path.join(os.path.dirname(__file__), "..", "web", "data", "ar-words.txt")

words = []
with urllib.request.urlopen(URL, timeout=120) as r:
    for line in io.TextIOWrapper(r, encoding="utf-8"):
        parts = line.split()
        if len(parts) != 2:
            continue
        w, c = parts[0], int(parts[1])
        if c >= MIN_COUNT and re.fullmatch(r"[ء-ي]+", w) and not re.search(r"[ً-ْـ]", w):
            words.append(w)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(words) + "\n")
print(len(words), "words ->", OUT, round(os.path.getsize(OUT) / 1e6, 1), "MB")

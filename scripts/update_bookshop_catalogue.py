"""Refresh the bookshop minigame catalogue from Open Library.

Collects public-domain-era works (first published 1928 or earlier) for each
shelf theme. On any failure the previous catalogue file is kept unchanged and
the script exits with an error; there are no automatic retries. Metadata only:
titles, authors and years from Open Library's open catalogue.
"""

import argparse
import json
import os
import re
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SUBJECTS = {
    "voyages": ["voyages_and_travels", "sea_stories"],
    "nature": ["natural_history", "animals"],
    "mystery": ["detective_and_mystery_stories", "crime"],
    "poetry": ["poetry", "english_poetry"],
    "history": ["history", "biography"],
    "tales": ["fairy_tales", "folklore"],
    "theatre": ["drama", "theater"],
    "science": ["science", "astronomy"],
}
PUBLISHED_IN = "1700-1928"
LATEST_YEAR = 1928
PER_GENRE = 40
MINIMUM_PER_GENRE = 8
TITLE_PATTERN = re.compile(
    r"^[0-9A-Za-zÀ-ÖØ-öø-ÿŒœÆæ '’\-:,.!?()&;]+$")


def fetch_subject(subject, opener):
    query = urllib.parse.urlencode({"published_in": PUBLISHED_IN, "limit": 40})
    request = urllib.request.Request(
        f"https://openlibrary.org/subjects/{urllib.parse.quote(subject)}.json?{query}",
        headers={"User-Agent": "arcane-path-bookshop/1.0 (daily public-domain catalogue refresh)"})
    attempts = 2
    for attempt in range(attempts):
        try:
            with opener(request, timeout=45) as response:
                return json.load(response)
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(3)


def clean_title(title):
    title = re.sub(r"\s*\[[^\]]*\]", "", title or "")
    return re.sub(r"\s+", " ", title).strip()


def collect(opener=urllib.request.urlopen):
    genres = {}
    seen = set()
    for genre, subjects in SUBJECTS.items():
        books = []
        for subject in subjects:
            if opener is urllib.request.urlopen:
                time.sleep(1)  # Politeness delay between registry requests.
            data = fetch_subject(subject, opener)
            for work in data.get("works", []):
                title = clean_title(work.get("title"))
                authors = work.get("authors") or []
                author = (authors[0] or {}).get("name") if authors else None
                year = work.get("first_publish_year")
                if (not title or not author or len(title) < 2 or len(title) > 80
                        or not isinstance(year, int) or year > LATEST_YEAR
                        or author.casefold() == title.casefold()
                        or not TITLE_PATTERN.match(title)):
                    continue
                key = title.casefold()
                if key in seen:
                    continue
                seen.add(key)
                books.append({"title": title, "author": author, "year": year,
                              "key": work.get("key") or ""})
                if len(books) >= PER_GENRE:
                    break
            if len(books) >= PER_GENRE:
                break
        if len(books) < MINIMUM_PER_GENRE:
            raise ValueError(f"Genre {genre!r} returned too few usable works ({len(books)}).")
        genres[genre] = books
    return {
        "version": 1,
        "source": "Open Library",
        "sourceUrl": "https://openlibrary.org",
        "license": "Open Library catalogue metadata; works first published in or before 1928.",
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "genres": genres,
    }


def write_catalogue(catalogue, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=output.parent,
                                     suffix=".tmp", delete=False) as handle:
        json.dump(catalogue, handle, ensure_ascii=False, indent=1)
        handle.write("\n")
        temporary = Path(handle.name)
    os.replace(temporary, output)


def main(argv=None, opener=urllib.request.urlopen):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[1] / "public" / "bookshop-catalogue.json")
    args = parser.parse_args(argv)
    try:
        catalogue = collect(opener)
    except Exception as error:  # Keep the previous catalogue untouched on any failure.
        print(f"Bookshop catalogue refresh failed; previous file kept: {error}", file=sys.stderr)
        return 1
    write_catalogue(catalogue, args.output)
    total = sum(len(books) for books in catalogue["genres"].values())
    print(f"Wrote {total} works across {len(catalogue['genres'])} genres to {args.output}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

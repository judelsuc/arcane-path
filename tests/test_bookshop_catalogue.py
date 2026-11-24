import io
import json
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from update_bookshop_catalogue import SUBJECTS, collect, main


def fake_opener(payloads):
    """Returns an opener serving canned subject payloads by subject name."""
    def opener(request, timeout=None):
        url = request.full_url if hasattr(request, "full_url") else request
        subject = url.split("/subjects/")[1].split(".json")[0]
        body = json.dumps(payloads[subject]).encode("utf-8")

        @contextmanager
        def response():
            yield io.BytesIO(body)
        return response()
    return opener


def works(entries):
    return {"works": [
        {"title": title, "authors": [{"name": author}], "first_publish_year": year, "key": f"/works/{index}"}
        for index, (title, author, year) in enumerate(entries)
    ]}


def payloads_with(first_subject_entries):
    plain = works([(f"Book {index}", f"Author {index}", 1900 + index % 20) for index in range(12)])
    payloads = {}
    for genre, subjects in SUBJECTS.items():
        for position, subject in enumerate(subjects):
            filler = works([(f"{genre} work {position}-{index}", f"Writer {genre} {index}", 1890 + index)
                            for index in range(12)])
            payloads[subject] = filler
    payloads[SUBJECTS["voyages"][0]] = first_subject_entries or plain
    return payloads


class BookshopCatalogueTests(unittest.TestCase):
    def test_collects_filtered_deduplicated_genres_with_provenance(self):
        entries = [
            ("A Fine Voyage", "Jane Author", 1900),
            ("A Fine Voyage", "Other Author", 1910),  # duplicate title dropped
            ("Modern Novel", "New Author", 1960),  # too recent
            ("Кириллица", "Russian Author", 1900),  # non-Latin title filtered
            ("Bible", "Bible", 1800),  # author identical to title filtered
            ("Valid [illustrated]", "Good Author", 1890),  # bracket note stripped
        ] + [(f"Voyage {index}", f"Sailor {index}", 1880 + index) for index in range(10)]
        catalogue = collect(fake_opener(payloads_with(works(entries))))
        voyages = catalogue["genres"]["voyages"]
        titles = [book["title"] for book in voyages]
        self.assertIn("A Fine Voyage", titles)
        self.assertEqual(titles.count("A Fine Voyage"), 1)
        self.assertIn("Valid", titles)
        for rejected in ("Modern Novel", "Кириллица", "Bible"):
            self.assertNotIn(rejected, titles)
        self.assertEqual(len(catalogue["genres"]), len(SUBJECTS))
        self.assertEqual(catalogue["source"], "Open Library")
        self.assertIn("1928", catalogue["license"])
        self.assertTrue(catalogue["retrievedAt"])
        for books in catalogue["genres"].values():
            self.assertGreaterEqual(len(books), 8)
            for book in books:
                self.assertTrue(book["title"] and book["author"])
                self.assertLessEqual(book["year"], 1928)

    def test_failure_keeps_the_previous_catalogue_file(self):
        def failing_opener(request, timeout=None):
            raise OSError("registry unreachable")
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "catalogue.json"
            output.write_text('{"version": 1, "previous": true}', encoding="utf-8")
            status = main(["--output", str(output)], opener=failing_opener)
            self.assertEqual(status, 1)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8")), {"version": 1, "previous": True})

    def test_successful_run_writes_the_catalogue_atomically(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "nested" / "catalogue.json"
            status = main(["--output", str(output)], opener=fake_opener(payloads_with(None)))
            self.assertEqual(status, 0)
            written = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(written["version"], 1)
            self.assertEqual(len(written["genres"]), len(SUBJECTS))
            self.assertFalse(list(output.parent.glob("*.tmp")), "no temporary files left behind")

    def test_too_few_usable_works_fails_without_writing(self):
        payloads = payloads_with(None)
        for subject in SUBJECTS["poetry"]:
            payloads[subject] = works([("Lone Poem", "Poet", 1900)])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "catalogue.json"
            status = main(["--output", str(output)], opener=fake_opener(payloads))
            self.assertEqual(status, 1)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()

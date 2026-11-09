"""Validate repository-local Markdown links and the standalone XYZ report structure."""

import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]


def anchors(path: Path) -> set[str]:
    headings = re.findall(r"^#{1,6}\s+(.+)$", path.read_text(), re.M)
    return {re.sub(r"[^\w\- ]", "", h.lower()).replace(" ", "-") for h in headings}


class ReportParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tags: list[str] = []
        self.has_lang = False
        self.has_viewport = False
        self.images = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        self.tags.append(tag)
        if tag == "html":
            self.has_lang = attributes.get("lang") == "en"
        if tag == "meta" and attributes.get("name") == "viewport":
            self.has_viewport = True
        if tag in ("img", "script", "link"):
            source = attributes.get("src") or attributes.get("href") or ""
            assert not source or source.startswith("data:"), f"external report asset: {source}"
        if tag == "img":
            assert attributes.get("alt"), "image needs alt text"
            self.images += 1


def main() -> None:
    count = 0
    documents = [*ROOT.glob("*.md"), *ROOT.glob("docs/**/*.md"), *ROOT.glob("*/README.md")]
    for path in documents:
        for link in re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)", path.read_text()):
            if re.match(r"[a-z]+:", link):
                continue
            target, _, fragment = unquote(link).partition("#")
            destination = (path.parent / target).resolve() if target else path
            assert destination.exists(), f"{path.relative_to(ROOT)}: missing {link}"
            if fragment and destination.suffix == ".md":
                assert fragment in anchors(destination), f"missing anchor: {path.name}: {link}"
            count += 1
    for path in (ROOT / "configs/xyz-experiment.json", ROOT / "reports/xyz-results.json"):
        if path.exists():
            json.loads(path.read_text())
    report = ROOT / "reports/xyz-experiment.html"
    if report.exists():
        parser = ReportParser()
        parser.feed(report.read_text())
        assert parser.has_lang and parser.has_viewport
        assert all(t in parser.tags for t in ("title", "main", "table", "svg"))
        assert "NOT RUN" in report.read_text()
    print(f"Validated {count} local Markdown links/anchors, JSON and report structure")


if __name__ == "__main__":
    main()

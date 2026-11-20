"""Papers from the upstream RASH project (vendor/rash, a git submodule) must compile without throwing and keep their sections."""
import re
import pytest
from conftest import ROOT, tex

PAPERS = sorted((ROOT / "vendor/rash/examples").glob("*.html"))


@pytest.mark.skipif(not PAPERS, reason="run: git submodule update --init")
def test_upstream_submodule_is_checked_out():
    assert PAPERS


@pytest.mark.parametrize("paper", PAPERS, ids=lambda p: p.name)
def test_upstream_example(paper):
    html = paper.read_text()
    for template in ("rash", "amsart", "arxiv"):
        t = tex(html, template)
        assert t.startswith(r"\documentclass") and t.endswith("\\end{document}\n")
        assert re.search(r"\\(sub)*section\{", t), "has sections"

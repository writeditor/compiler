"""The oup venue (a folder of the styles package): its files, the front matter its PDF markup builds, and the LaTeX the XSLT writes."""
import re
from conftest import ROOT, has, page, tex

UNIT = (ROOT / "node_modules/@writeditor/styles").resolve() / "src/oup"


def test_unit_ships_everything_it_needs():
    for f in ["index.ts", "markup.ts", "style.css", "export.xsl", "venue.json", "SOURCE.txt"]:
        assert (UNIT / f).is_file(), f
    for f in ["class/oup-authoring-template.cls", "sample/oup-authoring-template.tex", "sample/reference.bib"]:  # third-party, not in git: see SOURCE.txt
        assert (UNIT / f).is_file(), f"missing {UNIT / f}: get it as described in {UNIT / 'SOURCE.txt'}"


HEAD = ('<meta about="#a" name="dc.creator" content="A"/><link about="#a" property="schema:affiliation" href="#o1"/><meta about="#a" property="writ:oup.marks" content="*"/>'
        '<meta about="#b" name="dc.creator" content="B"/><link about="#b" property="schema:affiliation" href="#o2"/>'
        '<meta about="#o1" typeof="schema:Organization" property="schema:name" content="Same text"/><meta about="#o2" typeof="schema:Organization" property="schema:name" content="Same text"/>'
        '<meta property="writ:oup.journal" content="J. Test"/><meta property="writ:oup.year" content="2026"/><meta property="writ:oup.received" content="3|2|2026"/>'
        '<meta property="writ:oup.boxedtext" content="Key|\\begin{itemize}\\item One.\\item Two.\\end{itemize}"/>')


def box(body, head=HEAD):
    return tex(page(body, head), box="oup")


def test_front_matter_journal_block_numbered_affiliations_and_page_foot():
    h = box('<section role="doc-abstract"><h1>Abstract</h1><p>Text.</p></section><section><h1>S</h1><p>Body.</p></section>')
    has(h, '<div class="p-journal">', '<em>J. Test</em>, 2026', 'class="p-boxed"', 'class="p-footdata"', 'Received: 3 February 2026', 'class="p-rh">J. Test, 2026, Volume', 'class="p-front"')
    assert h.count('class="affiliation"') == 2, "identical affiliation texts under different ids stay apart"
    assert re.search(r'<sup>1,\*</sup>', h), h
    assert h.index('role="doc-abstract"') < h.index('class="p-rest"') and h.count("<li>") == 2


def test_figures_and_tables_are_numbered_in_the_markup():
    h = box('<section><h1>S</h1><figure><div class="ph"></div><figcaption>F</figcaption></figure><figure><figcaption>T</figcaption><table><tr><td>1</td></tr></table></figure></section>')
    has(h, 'data-label="Figure 1"', 'data-label="Table 1"')


def test_latex_front_matter_and_a_figure_without_image():
    t = tex(page('<section><h1>S</h1><figure><div class="ph"></div><figcaption>F</figcaption></figure></section>', HEAD), template="oup")
    has(t, r"\documentclass[unnumsec,webpdf,contemporary,large]{oup-authoring-template}", r"\journaltitle{J. Test}", r"\author[1,$\ast$]{A}", r"\received{3}{2}{2026}", r"\boxedtext{Key}")
    assert r"\includegraphics{}" not in t, "a placeholder block has no file"

"""The arxiv venue (a folder of the styles package): its files, and the PDF markup the style's CSS relies on."""
import re
from conftest import ROOT, has, page, tex

UNIT = (ROOT / "node_modules/@writeditor/styles").resolve() / "src/arxiv"  # the unit lives in the styles package


def test_unit_ships_everything_it_needs():
    for f in ["index.ts", "markup.ts", "style.css", "SOURCE.txt", "class/media/figure1.png"]:
        assert (UNIT / f).is_file(), f
    for f in ["class/PRIMEarxiv.sty", "sample/templatePRIME.tex", "sample/references.bib"]:  # third-party, not in git, required: see SOURCE.txt
        assert (UNIT / f).is_file(), f"missing {UNIT / f}: get it as described in {UNIT / 'SOURCE.txt'}"


def box(body="", head=""):
    return tex(page(body, head), box=True)


def test_authors_sharing_an_affiliation_share_a_column_and_the_title_is_small_caps():
    org = lambda i: f'<meta about="#{i}" property="schema:name" content="Lab&#10;City"/>'
    head = ('<meta about="#a" name="dc.creator" content="A"/><link about="#a" property="schema:affiliation" href="#o1"/><meta about="#b" name="dc.creator" content="B"/><link about="#b" property="schema:affiliation" href="#o1"/>'
            '<meta about="#c" name="dc.creator" content="C"/><link about="#c" property="schema:affiliation" href="#o2"/>' + org("o1") + org("o2") + '<meta property="writ:cite" content="Citation: X. Y."/>')
    h = tex(page('<section><h1>S</h1></section>', head).replace("<title>T</title>", "<title>My Title</title>"), box=True)
    assert h.count('<address class="authors">') == 2 and re.search(r'>A</strong>, <strong [^>]*>B</strong>', h), h
    has(h, '<span class="p-sc">y</span>', '<span class="p-foot"><i><u>Citation</u></i>: <b>X. Y.</b></span>')


def test_footnotes_links_citations_and_formulas():
    body = ('<section><h1>S</h1><p>Note<a href="#fn-1">1</a> see <a href="#s">Section 2</a> and <a href="#b1">[1]</a>, <a href="#b2">[2]</a> or <a href="http://x.org">x</a> <span role="math">x^2</span></p></section>'
            '<section role="doc-endnotes"><h1>Notes</h1><ol><li id="fn-1" role="doc-endnote"><p>The note.</p></li></ol></section>'
            '<section role="doc-bibliography"><h1>R</h1><ul><li id="b1" role="doc-biblioentry"><p>One.</p></li><li id="b2" role="doc-biblioentry"><p>Two.</p></li></ul></section>')
    h = box(body)
    has(h, '<span class="p-note">The note.</span>', 'class="p-url"', 'class="katex"')
    assert re.search(r'Section <a [^>]*p-ref[^>]*>2</a>', h), h  # only the number is the link
    assert "Notes" not in h, "the endnotes list is dropped"
    assert re.search(r'\[<a [^>]*p-cite[^>]*>1</a>, <a [^>]*p-cite[^>]*>2</a>\]', h), h  # natbib: one bracket pair, numbers linked


def test_full_stops_get_tex_space_except_after_a_capital_and_the_abstract_heading_is_small_caps():
    h = box('<section role="doc-abstract"><h1>Abstract</h1><p>One end. Two. Mr. Smith A. Jones.</p></section>')
    assert 'end.<span class="p-ss"> </span>Two.<span class="p-ss"> </span>Mr.<span class="p-ss"> </span>Smith A. Jones.' in h, h
    has(h, 'A<span class="p-sc">bstract</span>')

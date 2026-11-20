import pytest
from conftest import SAMPLE, UnknownTemplateError, has, tex, third_party
paper = lambda head: f"<html><head><title>T</title>{head}</head><body><section><h1>S</h1></section></body></html>"


def test_cambridge_export_front_matter_from_head_body_from_latex():
    t = tex(third_party("test/chr-sample.html").read_text(), "cambridge")
    has(t, r"\documentclass[twocolumn]{CUP-JNL-CHR}", r"\jname{Computational Humanities Research}", r"\jyear{2024}", r"\jdoi{10.1017/chr.2024.1}",
        "\\author*[1]{First Author}\n\\author[2]{Second Author}", r"\authormark{First Author et al.}", r"\address[3]{Third Division,", r"\corresp{\email{first.author@address.edu}}",
        r"\received{04 May 2020}", r"\keywords{Keyword entry 1; keyword entry 2; keyword entry 3}", r"\section*{Plain Language Summary}", "\\begin{equation}\n\\label{eq-first}",
        r"\citep{barclay03}", r"\citet{comijs04}", r"\bibitem[Barclay and Fisher(2003)]{barclay03}", r"\bibitem[Comijs et al.(2004)]{comijs04}", r"\begin{Backmatter}", r"\paragraph{Funding statement}",
        r"\appendix", r"\FIG{", r"\TBL{", r"\footnote{A footnote}", r"Figure~\ref{fig_sim}")
    # page 1 ends before the third section (firstPageSections=2)
    assert t.index(r"\copbreak") > t.index("Insert A head here") and t.index(r"\copbreak") < t.index("Insert B head here")
    assert t.index(r"\begin{document}") < t.index(r"\abstract{") and t.endswith("\\end{document}\n") and r"\maketitle" not in t


def test_cambridge_head_values_escaped_long_ones_fast():
    t = tex(paper('<meta about="#p1" name="dc.creator" content="Li &amp; Wei_"/><meta property="writ:cambridge.copyright" content="' + "a_b % " * 300 + '"/>'), "cambridge")
    has(t, r"\author[]{Li \& Wei\_}", r"a\_b \% a\_b")


def test_export_default_is_papers_own_style_unknown_names_rejected():
    html = SAMPLE.replace("</head>", '<meta property="writ:cambridge.volume" content="37"/><meta property="writ:style" content="cambridge"/></head>')
    assert "{CUP-JNL-CHR}" in tex(html)
    arx = tex(html, "arxiv")
    assert "CUP-JNL-CHR" not in arx and "volume" not in arx
    assert tex(SAMPLE).startswith(r"\documentclass{article}")
    with pytest.raises(UnknownTemplateError):
        tex(SAMPLE, "nope")

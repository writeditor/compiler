import re
from conftest import SAMPLE, has, page, sec, tex


def test_sample_paper():
    t = tex(SAMPLE)
    has(t, r"\author{Jane Doe}", r"\begin{abstract}", r"\section{Introduction}\label{introduction}", r"\subsection{Contributions}",
        r"\cite{b1,b2}", r"\ref{fig-arch}", "$E = mc^2$", r"\bibitem{b1}", r"\begin{itemize}", "embedded image omitted")
    e = tex("<html><head><title>A &amp; B</title></head><body><section><h1>50% off_x</h1><p>#1 $5</p></section></body></html>")
    has(e, r"\section{50\% off\_x}", r"\#1 \$5", r"\title{A \& B}")


def test_templates_amsart_and_arxiv():
    html = SAMPLE.replace('content="Jane Doe"/>', 'content="Jane Doe"/><meta name="dc.creator" content="Li Wei"/>')
    ams = tex(html, "amsart")
    assert ams.startswith(r"\documentclass[10pt,leqno]{amsart}")
    assert ams.index(r"\begin{abstract}") < ams.index(r"\maketitle")
    assert len(re.findall(r"\\begin\{abstract\}", ams)) == 1
    assert "\\author{Jane Doe}\n\\author{Li Wei}" in ams
    arx = tex(html, "arxiv")
    has(arx, r"\usepackage{PRIMEarxiv}", r"\author{Jane Doe \And Li Wei}")
    assert arx.index(r"\maketitle") < arx.index(r"\begin{abstract}")


def test_byline_emails_and_shared_affiliations():
    head = '''<meta about="#a1" name="dc.creator" content="Ada Lovelace"/><meta about="#a1" property="schema:email" content="ada@ul.ac.uk"/>
    <link about="#a1" property="schema:affiliation" href="#o1"/>
    <meta about="#a2" name="dc.creator" content="Alan Turing"/><meta about="#a2" property="schema:email" content="alan@npl.co.uk"/>
    <link about="#a2" property="schema:affiliation" href="#o2"/><link about="#a2" property="schema:affiliation" href="#o1"/>
    <meta about="#o1" property="schema:name" content="University of London"/><meta about="#o2" property="schema:name" content="NPL &amp; Co"/>'''
    html = page("<section><h1>S</h1></section>", head)
    has(tex(html), r"\author{Ada Lovelace \\ University of London \\ \texttt{ada@ul.ac.uk} \and Alan Turing \\ NPL \& Co \\ University of London \\ \texttt{alan@npl.co.uk}}")
    has(tex(html, "amsart"), "\\author{Ada Lovelace}\n\\address{University of London}\n\\email{ada@ul.ac.uk}\n\\author{Alan Turing}\n\\address{NPL \\& Co}")


def test_subtitle_keywords_corresponding_author_acknowledgements():
    src = '''<html><head><title>Main &amp; title -- A subtitle</title>
    <meta about="#a" name="dc.creator" content="Ada"/><meta about="#a" property="schema:email" content="ada@x.org"/><meta about="#a" property="schema:contactPoint" content="corresponding author"/>
    <meta about="#b" name="dc.creator" content="Bob"/>
    <meta property="prism:keyword" content="semantic HTML"/><meta property="prism:keyword" content="RASH"/></head>
    <body><section role="doc-abstract"><h1>Abstract</h1><p>A.</p></section><section><h1>Intro</h1></section>
    <section role="doc-acknowledgements"><h1>Acknowledgements</h1><p>Thanks.</p></section></body></html>'''
    rash, ams, arx = tex(src), tex(src, "amsart"), tex(src, "arxiv")
    has(rash, r"\title{Main \& title \\ \large A subtitle}", "\\end{abstract}\n\n\\noindent\\textbf{Keywords:} semantic HTML, RASH",
        r"Ada\thanks{Corresponding author: \texttt{ada@x.org}}", "\\section*{Acknowledgements}\n\nThanks.")
    has(ams, "\\email{ada@x.org}\n\\thanks{Corresponding author.}")
    assert ams.index(r"\keywords{semantic HTML, RASH}") < ams.index(r"\maketitle")
    has(arx, r"\keywords{semantic HTML \and RASH}")
    no_abs = tex(re.sub(r'<section role="doc-abstract">.*?</section>', "", src))
    assert no_abs.index(r"\maketitle") < no_abs.index("Keywords:")


def test_tables_footnotes_listings_lists_math_rules():
    t = tex('''<html><body><section id="s"><h1>S</h1>
    <p>Note<a href="#fn-1">1</a> <u>u</u> H<sub>2</sub>O x<sup>2</sup> <code>f()</code></p>
    <ol><li><p>one</p><ul><li><p>nested</p></li></ul></li><li><p>two</p></li></ol>
    <figure id="lst-1"><pre><code>x = 1</code></pre><figcaption>Code</figcaption></figure>
    <figure id="t1"><table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1 &amp; 2</td><td><em>x</em></td></tr></tbody></table><figcaption>Results</figcaption></figure>
    <div class="display_formula">\\[E = mc^2\\]</div><hr/></section>
    <section role="doc-endnotes"><h1>Notes</h1><ol><li id="fn-1" role="doc-endnote"><p>The note.</p></li></ol></section></body></html>''')
    has(t, r"\footnote{The note.}", r"\underline{u}", r"H\textsubscript{2}O", r"x\textsuperscript{2}", r"\texttt{f()}", "\\[\nE = mc^2\n\\]", r"\rule{\linewidth}",
        "\\begin{verbatim}\nx = 1\n\\end{verbatim}", r"\begin{enumerate}", "\\begin{itemize}\n  \\item nested",
        "\\caption{Results}\\label{t1}\n\\begin{tabular}{ll}\n\\hline\n\\textbf{A} & \\textbf{B} \\\\\n1 \\& 2 & \\emph{x} \\\\\n\\hline")
    assert "Notes" not in t, "endnotes are inlined, not listed"


def test_figure_image_width_and_empty_table():
    assert r"\includegraphics[width=0.5\linewidth]{a_b.png}" in tex(sec('<figure id="f"><p><img src="a_b.png" style="width:50%"/></p><figcaption>C</figcaption></figure>'))
    assert r"[width=\linewidth]" in tex(sec('<figure><p><img src="a.png" style="width:5%"/></p><figcaption>C</figcaption></figure>'))
    assert r"\begin{tabular}{l}" in tex(sec("<figure><table></table><figcaption>C</figcaption></figure>"))


def test_citation_keys_from_csl_metadata():
    html = page('<section><h1>S</h1><p><a href="#b1">1</a></p></section><section role="doc-bibliography"><h1>R</h1><ul><li id="b1" role="doc-biblioentry"><p>Pel.</p></li></ul></section>',
                '<meta about="#b1" property="writ:csl" content="{&quot;citation-key&quot;:&quot;pel2020&quot;}"/>')
    has(tex(html), r"\bibitem{pel2020}", r"\cite{pel2020}")
    assert r"\bibitem{ax}" in tex(html.replace("pel2020", "a}{x"))


def test_unsafe_links_dropped_and_arguments_cannot_break_out():
    t = tex(sec('<p><a href="javascript:alert(1)">x</a> <a href="https://a.b/}\\input{/etc/passwd}{">y</a> <a href="https://a.b/%">z</a></p>'))
    assert "javascript" not in t and r"\input{" not in t and r"\href{https://a.b/\%}{z}" in t, t


def test_verbatim_and_math_cannot_run_commands_scripts_ignored():
    t = tex(page('''<section><h1>T</h1><pre>a\\end{verbatim}\\input{/etc/passwd}</pre><figure><pre>b\\end{verbatim}\\input{/etc/passwd}</pre><figcaption>c</figcaption></figure>
    <div class="display_formula">\\input{/etc/passwd} x</div><p><span role="math">\\write18{id}</span><script>\\input{x}</script></p></section>'''))
    outside = re.sub(r"\\begin\{verbatim\}[\s\S]*?\\end\{verbatim\}", "", t.split(r"\begin{document}")[1])  # what TeX still reads as commands
    assert not re.search(r"\\input|\\write", outside), outside
    assert len(re.findall(r"\\end\{verbatim\}", t)) == 2, "only our own terminators close verbatim"


def test_arxiv_author_groups_title_footnote_centred_paragraphs():
    org = lambda i: f'<meta about="#{i}" property="schema:name" content="Lab&#10;City"/>'
    head = ('<meta about="#a" name="dc.creator" content="A"/><link about="#a" property="schema:affiliation" href="#o1"/><meta about="#b" name="dc.creator" content="B"/><link about="#b" property="schema:affiliation" href="#o1"/>'
            '<meta about="#c" name="dc.creator" content="C"/><link about="#c" property="schema:affiliation" href="#o2"/>' + org("o1") + org("o2") + '<meta property="writ:cite" content="Citation: X. Y."/>')
    t = tex(page('<section><h1>S</h1><p style="text-align:center">mid</p></section>', head), "arxiv")
    assert r"\author{A, B \\ Lab \\ City \And C \\ Lab \\ City}" in t, t
    has(t, r"\thanks{\textit{\underline{Citation}}: \textbf{X. Y.}}", "\\begin{center}\nmid\n\\end{center}")


def test_tables_colspan_and_booktabs():
    t = sec('<figure><table><tr><th colspan="2">P</th></tr><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><figcaption>C</figcaption></figure>')
    bt, plain = tex(t, "arxiv"), tex(t, "rash")
    assert "\\toprule\n\\multicolumn{2}{c}{P} \\\\\n\\cmidrule(r){1-2}\nA & B \\\\\n\\midrule\n1 & 2 \\\\\n\\bottomrule" in bt, bt
    assert "\\hline\n\\multicolumn{2}{c}{\\textbf{P}} \\\\" in plain, plain

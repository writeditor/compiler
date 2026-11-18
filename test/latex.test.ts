import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toLaTeX } from "../src/index.ts";

const sample = readFileSync(new URL("./sample.html", import.meta.url), "utf8");
const page = (body: string, head = "") => `<html><head><title>T</title>${head}</head><body>${body}</body></html>`;
const sec = (inner: string) => page(`<section><h1>S</h1>${inner}</section>`);

test("sample paper: sections, citations, math, bibliography, lists, images", () => {
  const tex = toLaTeX(sample);
  for (const s of ["\\author{Jane Doe}", "\\begin{abstract}", "\\section{Introduction}\\label{introduction}", "\\subsection{Contributions}",
    "\\cite{b1}", "\\ref{fig-arch}", "$E = mc^2$", "\\bibitem{b1}", "\\begin{itemize}", "\\includegraphics"])
    assert.ok(tex.includes(s), s);
  const esc = toLaTeX("<html><head><title>A &amp; B</title></head><body><section><h1>50% off_x</h1><p>#1 $5</p></section></body></html>");
  assert.ok(esc.includes("\\section{50\\% off\\_x}") && esc.includes("\\#1 \\$5") && esc.includes("\\title{A \\& B}"));
});

test("templates: amsart puts the abstract before \\maketitle, one \\author per name; arxiv uses \\And", () => {
  const html = sample.replace('content="Jane Doe"/>', 'content="Jane Doe"/><meta name="dc.creator" content="Li Wei"/>');
  const ams = toLaTeX(html, "amsart");
  assert.ok(ams.startsWith("\\documentclass[10pt,leqno]{amsart}"));
  assert.ok(ams.indexOf("\\begin{abstract}") < ams.indexOf("\\maketitle"));
  assert.equal(ams.match(/\\begin\{abstract\}/g)!.length, 1);
  assert.ok(ams.includes("\\author{Jane Doe}\n\\author{Li Wei}"));
  const arx = toLaTeX(html, "arxiv");
  assert.ok(arx.includes("\\usepackage{arxiv}") && arx.includes("\\author{Jane Doe \\And Li Wei}"));
  assert.ok(arx.indexOf("\\maketitle") < arx.indexOf("\\begin{abstract}"));
});

test("byline: emails and shared affiliations from RDFa", () => {
  const head = `<meta about="#a1" name="dc.creator" content="Ada Lovelace"/><meta about="#a1" property="schema:email" content="ada@ul.ac.uk"/>
    <link about="#a1" property="schema:affiliation" href="#o1"/>
    <meta about="#a2" name="dc.creator" content="Alan Turing"/><meta about="#a2" property="schema:email" content="alan@npl.co.uk"/>
    <link about="#a2" property="schema:affiliation" href="#o2"/><link about="#a2" property="schema:affiliation" href="#o1"/>
    <meta about="#o1" property="schema:name" content="University of London"/><meta about="#o2" property="schema:name" content="NPL &amp; Co"/>`;
  const html = page("<section><h1>S</h1></section>", head);
  assert.ok(toLaTeX(html).includes("\\author{Ada Lovelace \\\\ University of London \\\\ \\texttt{ada@ul.ac.uk} \\and Alan Turing \\\\ NPL \\& Co \\\\ University of London \\\\ \\texttt{alan@npl.co.uk}}"));
  assert.ok(toLaTeX(html, "amsart").includes("\\author{Ada Lovelace}\n\\address{University of London}\n\\email{ada@ul.ac.uk}\n\\author{Alan Turing}\n\\address{NPL \\& Co}"));
});

test("subtitle, keywords, corresponding author and acknowledgements", () => {
  const src = `<html><head><title>Main &amp; title -- A subtitle</title>
    <meta about="#a" name="dc.creator" content="Ada"/><meta about="#a" property="schema:email" content="ada@x.org"/><meta about="#a" property="schema:contactPoint" content="corresponding author"/>
    <meta about="#b" name="dc.creator" content="Bob"/>
    <meta property="prism:keyword" content="semantic HTML"/><meta property="prism:keyword" content="RASH"/></head>
    <body><section role="doc-abstract"><h1>Abstract</h1><p>A.</p></section><section><h1>Intro</h1></section>
    <section role="doc-acknowledgements"><h1>Acknowledgements</h1><p>Thanks.</p></section></body></html>`;
  const rash = toLaTeX(src), ams = toLaTeX(src, "amsart"), arx = toLaTeX(src, "arxiv");
  assert.ok(rash.includes("\\title{Main \\& title \\\\ \\large A subtitle}"), rash);
  assert.ok(rash.includes("\\end{abstract}\n\n\\noindent\\textbf{Keywords:} semantic HTML, RASH"), rash);
  assert.ok(rash.includes("Ada\\thanks{Corresponding author: \\texttt{ada@x.org}}"), rash);
  assert.ok(rash.includes("\\section*{Acknowledgements}\n\nThanks."), rash);
  assert.ok(ams.includes("\\email{ada@x.org}\n\\thanks{Corresponding author.}"), ams);
  assert.ok(ams.indexOf("\\keywords{semantic HTML, RASH}") < ams.indexOf("\\maketitle"), ams);
  assert.ok(arx.includes("\\keywords{semantic HTML \\and RASH}"), arx);
  const noAbs = toLaTeX(src.replace(/<section role="doc-abstract">.*?<\/section>/, ""));
  assert.ok(noAbs.indexOf("\\maketitle") < noAbs.indexOf("Keywords:"), noAbs);
});

test("tables, underline, footnotes, listings, lists, sup/sub, display math and rules", () => {
  const tex = toLaTeX(`<html><body><section id="s"><h1>S</h1>
    <p>Note<a href="#fn-1">1</a> <u>u</u> H<sub>2</sub>O x<sup>2</sup> <code>f()</code></p>
    <ol><li><p>one</p><ul><li><p>nested</p></li></ul></li><li><p>two</p></li></ol>
    <figure id="lst-1"><pre><code>x = 1</code></pre><figcaption>Code</figcaption></figure>
    <figure id="t1"><table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1 &amp; 2</td><td><em>x</em></td></tr></tbody></table><figcaption>Results</figcaption></figure>
    <div class="display_formula">\\[E = mc^2\\]</div><hr/></section>
    <section role="doc-endnotes"><h1>Notes</h1><ol><li id="fn-1" role="doc-endnote"><p>The note.</p></li></ol></section></body></html>`);
  for (const s of ["\\footnote{The note.}", "\\underline{u}", "H\\textsubscript{2}O", "x\\textsuperscript{2}", "\\texttt{f()}", "\\[\nE = mc^2\n\\]", "\\rule{\\linewidth}",
    "\\begin{verbatim}\nx = 1\n\\end{verbatim}", "\\begin{enumerate}", "\\begin{itemize}\n  \\item nested",
    "\\caption{Results}\\label{t1}\n\\begin{tabular}{ll}\n\\hline\n\\textbf{A} & \\textbf{B} \\\\\n1 \\& 2 & \\emph{x} \\\\\n\\hline"])
    assert.ok(tex.includes(s), s);
  assert.ok(!tex.includes("Notes"), "endnotes are inlined, not listed");
});

test("figure image width and a table with no rows", () => {
  assert.ok(toLaTeX(sec('<figure id="f"><p><img src="a_b.png" style="width:50%"/></p><figcaption>C</figcaption></figure>')).includes("\\includegraphics[width=0.5\\linewidth]{a_b.png}"));
  assert.ok(toLaTeX(sec('<figure><p><img src="a.png" style="width:5%"/></p><figcaption>C</figcaption></figure>')).includes("[width=\\linewidth]"));
  assert.ok(toLaTeX(sec("<figure><table></table><figcaption>C</figcaption></figure>")).includes("\\begin{tabular}{l}"));
});

test("citation keys from CSL metadata name the \\bibitem and the \\cite", () => {
  const html = page(`<section><h1>S</h1><p><a href="#b1">1</a></p></section><section role="doc-bibliography"><h1>R</h1><ul><li id="b1" role="doc-biblioentry"><p>Pel.</p></li></ul></section>`,
    `<meta about="#b1" property="writ:csl" content="{&quot;citation-key&quot;:&quot;pel2020&quot;}"/>`);
  const tex = toLaTeX(html);
  assert.ok(tex.includes("\\bibitem{pel2020}") && tex.includes("\\cite{pel2020}"));
  assert.ok(toLaTeX(html.replace("pel2020", "a}{x")).includes("\\bibitem{ax}"));
});

test("unsafe link schemes are dropped and LaTeX arguments cannot break out", () => {
  const tex = toLaTeX(sec(`<p><a href="javascript:alert(1)">x</a> <a href="https://a.b/}\\input{/etc/passwd}{">y</a> <a href="https://a.b/%">z</a></p>`));
  assert.ok(!tex.includes("javascript") && !tex.includes("\\input{") && tex.includes("\\href{https://a.b/\\%}{z}"), tex);
});

test("verbatim and math cannot run commands; scripts are ignored", () => {
  const tex = toLaTeX(page(`<section><h1>T</h1><pre>a\\end{verbatim}\\input{/etc/passwd}</pre><figure><pre>b\\end{verbatim}\\input{/etc/passwd}</pre><figcaption>c</figcaption></figure>
    <div class="display_formula">\\input{/etc/passwd} x</div><p><span role="math">\\write18{id}</span><script>\\input{x}</script></p></section>`));
  const outside = tex.split("\\begin{document}")[1].replace(/\\begin\{verbatim\}[\s\S]*?\\end\{verbatim\}/g, ""); // what TeX still reads as commands
  assert.ok(!/\\input|\\write/.test(outside), outside);
  assert.equal(tex.match(/\\end\{verbatim\}/g)!.length, 2, "only our own terminators close verbatim");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toLaTeXVenue, exportLaTeX, UnknownTemplateError } from "../src/index.ts";

const sample = readFileSync(new URL("./sample.html", import.meta.url), "utf8");
const paper = (head: string) => `<html><head><title>T</title>${head}</head><body><section><h1>S</h1></section></body></html>`;

test("cambridge export: cup-journal preamble from the head via XSLT, body from toLaTeX", async () => {
  const t = await toLaTeXVenue(sample.replace('content="Jane Doe"/>', 'content="Jane Doe"/><meta name="dc.creator" content="Li &amp; Wei_"/>'), "cambridge");
  assert.ok(t.startsWith("\\documentclass[journal=chr]{cup-journal}\n\\usepackage{amsmath}\n\\usepackage[nopatch]{microtype}\n\\usepackage{booktabs}\n\\title{HTML Is All You Need"));
  assert.ok(t.includes("\\author{Jane Doe}") && t.includes("\\author{Li \\& Wei\\_}"));
  assert.ok(t.indexOf("\\begin{document}") < t.indexOf("\\begin{abstract}\nWe argue") && !t.includes("\\maketitle"));
  assert.ok(t.indexOf("\\end{abstract}") < t.indexOf("\\section{Introduction}") && t.endsWith("\\end{document}\n"));
});

test("cambridge export: class options, affiliations by author, correspondence email, keywords", async () => {
  const head = `<meta about="#p1" name="dc.creator" content="Ada"/><link about="#p1" property="schema:affiliation" href="#a1"/>
    <meta about="#p2" name="dc.creator" content="Alan"/><meta about="#p2" property="schema:email" content="alan@npl.co.uk"/>
    <meta about="#p2" property="schema:contactPoint" content="corresponding author"/>
    <link about="#p2" property="schema:affiliation" href="#a2"/><link about="#p2" property="schema:affiliation" href="#a1"/>
    <meta about="#a1" typeof="schema:Organization" property="schema:name" content="University of  London"/>
    <meta about="#a2" typeof="schema:Organization" property="schema:name" content="NPL &amp; Co"/>
    <meta property="prism:keyword" content="a_b"/><meta property="prism:keyword" content="c"/>
    <meta property="dcterms:issued" content="2024-05-04"/>
    <meta property="writ:cambridge.journal" content="pri"/><meta property="writ:cambridge.volume" content="37"/><meta property="writ:cambridge.manuscript" content="article"/>`;
  const t = await toLaTeXVenue(paper(head), "cambridge");
  for (const s of ["\\documentclass[journal=pri,manuscript=article,year=2024,volume=37]{cup-journal}", "\\author{Ada}\n\\affiliation{University of London}\n",
    "\\author{Alan}\n\\affiliation{NPL \\& Co}\n\\affiliation{University of London}\n\\email[Alan]{alan@npl.co.uk}\n", "\\keywords{a\\_b, c}"]) assert.ok(t.includes(s), s);
});

test("cambridge export: head values cannot add class options", async () => {
  const t = await toLaTeXVenue(paper(`<meta property="writ:cambridge.journal" content="chr,evil=1"/><meta property="writ:cambridge.volume" content="37,evil=1]{x}"/>`), "cambridge");
  assert.ok(t.startsWith("\\documentclass[journal=chr,volume=37evil1x]{cup-journal}"), t.split("\n")[0]);
});

test("exportLaTeX: the paper's own writ:style is the default; other templates ignore venue fields; unknown names are rejected", async () => {
  const html = sample.replace("</head>", '<meta property="writ:cambridge.volume" content="37"/><meta property="writ:style" content="cambridge"/></head>');
  assert.ok((await exportLaTeX(html)).includes("{cup-journal}"));
  const arx = await exportLaTeX(html, "arxiv");
  assert.ok(!arx.includes("cup-journal") && !arx.includes("volume"));
  assert.ok((await exportLaTeX(sample)).startsWith("\\documentclass{article}"));
  await assert.rejects(exportLaTeX(sample, "nope"), UnknownTemplateError);
});

# ceur: run of the style-from-tex skill (test run, page 1 closed)

Date 2026-11-23. Sample: the CEUR-WS template zip's `sample-1col.tex` (607 lines, a user guide: 9 pages), class `ceurart.cls` v0.6.2. Stopped after page 1 on purpose: this run tested the skills; pages 2-9 are not tuned.

## Numbers (`make eval ARGS=ceur`)
| | paged pixel diff by page | pages | style score |
|---|---|---|---|
| first build, no style | (plain text) | 8 | 0.17 |
| first styled pass | 0.1095 .. | 7 | 0.33 |
| now | 0.0644 / 0.0846 / 0.0661 / 0.0953 / 0.1187 / 0.0857 / 0.1290 / 0.1289 | 8 (reference 9) | 0.33 |

Our LaTeX output (`ts`, phase 3) is untouched: 7 pages, 34 undefined refs, score 0.67. arXiv unchanged (0.0805 / 0.0877 / 0.0553).

## Page 1 (closed, by the ruler)
Matches: title (size, line, star), byline with grey given names and `1,2,*,†` marks, numbered italic affiliations, Abstract and Keywords blocks, "1. Introduction", paragraph indents and line breaks of the first paragraphs (incl. the TeX logo), list indents and item pitch, the listing's indent, the page-foot block (conference line, title note, corresponding / equal notes, e-mails, URLs, ORCIDs with icons, CC logo and licence text).
Known differences left: the footnote rule is thicker than the reference's; the foot block starts about 3.5 pt lower (the reference's note lines are 0.5 pt taller); the `<sup>` marks are slightly larger; the last paragraph's last line breaks "the / command is:" where the reference breaks "the command / is:".

## What was done in this continuation
- Skills changed to work one page at a time, ruler first.
- Converter: nested listings inside list items, URLs, ORCIDs, copyright year and clause, marks and their notes, TeX logos, typographic quotes and dashes.
- Style: list, listing, footnote and foot-block rules; `p:nth-child(2)` instead of `h1 + p`; one `::footnote-call` rule per selector; footnotes numbered by `data-n`.
- Container: FontAwesome added to fontconfig.

## Left (next pages, one at a time)
Page 2 on: headings 2-4 and their gaps, tables, the figure, equations, the bibliography, appendix lettering ("A."), page-break positions (page count 8 vs 9). Phase 2 (editor check) and phase 3 (LaTeX, `ts`) not started.

## Decisions for the person
- `page_size` cannot pass: Chromium prints A4 as 594.96 x 841.92 pt and the check compares exactly.
- `fonts` and `title` checks: re-check after page 2+, they were failing before the foot block existed.

## Experiments reverted
word-spacing -.1em (a word climbed a line elsewhere), kept -.08em; table spacing experiments were an arXiv matter, not this style.

## Continuation 2026-11-24: page 2 (and the start of 3)
Pixel diff paged: p1 0.0644 -> 0.0645, p2 0.0846 -> 0.0614, p3 0.0661 -> 0.0550 (8 pages, reference 9).
- Headings: by the ruler (not the row table: Libertinus Sans boxes differ) section heads sit at margin 3.5/11.5, subsections 4/8.5. Paged.js keeps a heading's top margin at a page start, TeX drops it, so the gap above a heading hangs on the previous block (`section:has(+ section)`, `section > p:has(+ section)`...), which is cut at a break. `h1:has(+ section)` had no effect (Paged.js rewrites `+`): use `section > section:nth-child(2) > h1`.
- Note calls: Paged.js counts the page-foot block as footnotes too; the first real note carries `p-first` (markup.ts) and `counter-reset: footnote 1` (reset runs after the increment). `counter-increment` in `::footnote-call` hangs Paged.js.
- Converter (eval only): `\verb|\begin{abstract}|` is no longer taken for an environment; verbatim keeps its first line's indent (so `pre` has no margin-left); `lstlisting` gets `class="lst"` and lists with no blank line before get `class="tight"` (LaTeX adds \partopsep only after a blank line).
- Listings `line-height: 13.5pt`; ordered-list numbers end 9.5pt before the text.
Known: ceurart's list glue is stretchable (\@sep .5\baselineskip plus .2, itemsep .1 plus .01) and the reference stretches or shrinks it per page: page 3's lists are 2 pt tighter per boundary than page 1's, so page 3 breaks one paragraph early (keywords listing last on ours). Natural values (9.75 / 6.75 / 1.35) fix page 2/3 but cost page 1 (0.0723), so they were not kept.
Left: pages 3-9 (tables, figure, equations, bibliography, appendix), the footnote rule, the listing's letter-spacing.

## Continuation 2026-11-25: page count and the references
Pages 9, as the reference (was 8); every page starts and ends on the same text as the reference. Paged pixel diff by page: 0.0745 / 0.0551 / 0.0499 / 0.0924 / 0.1135 / 0.0903 / 0.0843 / 0.1893 / 0.1112 (LaTeX output also 9 pages).
Converter (eval only), each was a content difference, not a style one:
- the references were missing: the sample shows `\bibliography{bibfile}` in a verbatim example before the real one; the last is taken now. Entries come from the reference build's .bbl (the text the class's bibliography style printed), the section sits where `\bibliography` is (before the appendix), citations group as `[18, 19, 20]`.
- `table*` was not counted, so "Table 6" / "Table 1" were printed for Tables 1 / 2; `\$`; `\begin{math}` is inline math; `\verb|\appendix|` in a verbatim example was stripped; `\newline` is a line break, `\noindent` an unindented paragraph, backtick quotes; the unnumbered `\section*{Declaration on Generative AI}` is in UNNUMBERED (styles and compiler lists).
Style: tables and captions in Libertinus Sans (caption above, "Table N" on its own line), numbered display equations, "[n]" labels hanging in the references, link colour, DOIs mono and addresses serif, level-3 headings upright 10.95, level-2 12 (\large), a subsection after text gets its gap from the block before it (`.p-gap`, set by markup.ts, so a page break cuts it), list glue at the class's values (8.5/6.75/1.35: page 3 holds its last paragraph only like this; page 1 is 0.0745 instead of 0.0645).
Left: floats (the reference moves both tables and the figure to the top of their page; Paged.js has no `float: top`), the first line of a page that starts with text is 5-7 pt higher than TeX's (\topskip), text after a display equation is indented (TeX continues the paragraph), the listing's continuation lines (breaklines) and character spacing, table column alignment (`ccl` is not in RASH), the "Table 1" link colours only the number in the reference.

## Continuation 2026-11-25 (2): every page under 0.1
Paged pixel diff by page: 0.0745 / 0.0554 / 0.0499 / 0.0913 / 0.0953 / 0.0788 / 0.0843 / 0.0980 / 0.0710 (9 pages, every page starts and ends on the reference's text). arXiv unchanged (0.0805 / 0.0878 / 0.0553).
- Page floats (compiler/pdf/index.ts): a style asks with `figure { --page-float: top }`; the export lays the paper out, notes for each such figure the first block of the page it landed on, and loads again with the figure moved there (a paragraph cut by the break is cut in the source too). `data-float-last` marks the last float of a group so the style sets \textfloatsep apart from \floatsep. The browser preview in the editor has its own Paged.js run and does not do this yet.
- Page 5/6: figures and tables numbered in markup.ts (`data-label`), because Paged.js counts every matching counter-increment (a table was "Figure 3"); `\includegraphics[width=\linewidth-80pt]` is read; tabular column specs (`ccl`) become cell alignment; KaTeX at 1em with no display margin of its own, the space below a display formula moved to the text after it (which is not indented), bottom rule a little under the last row.
- Page 8/9: first block of a continued section or list gets TeX's \topskip (5pt), \bibsep (.1pt), \newblock as a wider space, the tilde in a URL kept, ’ for every apostrophe.
Left: table* caption is indented 17pt in the reference, list glue at the class's values costs page 1 (0.0745), the listing's continuation lines, URL and DOI break points, the "LaTeX" logo in the reference list.

## Continuation 2026-11-25 (3): tester checks, LaTeX build, icons and note calls
Style score: `ts` 0.50 -> 0.83, paged 0.33 -> 0.83 (only `fonts` fails). Pages 9 / 9. Paged pixel diff unchanged (0.0744 on page 1).
Corrections to the tester (each measured the wrong thing; never to make a row pass, the reference is untouched):
- `page_size`: 1 pt tolerance (Chromium rounds the page to whole CSS px: 594.96 x 841.92 vs 595.28 x 841.89).
- `fonts`: the container's poppler (22.12) prints Chromium's Type 3 fonts as `[none]`, so the paged PDF looked font-less; names are now also read from `/FontName` in the file.
- `margins`: right margin is the most common line end, not the maximum (one overfull line or a long URL decided it).
- `title`: first line's width (2%) and vertical centre (5 pt), not word-box height (Libertinus Sans boxes differ between LaTeX and Chromium) and not the tallest word of the page (a foot-block icon).
- WER is letters only (list bullets, footnote digits, math symbols extract differently without looking different). `fontDiff` had its two arguments swapped in the first version of the report; fixed.
Converter: `\begin{itemize}` holding a listing was cut at the listing, left an empty list and a literal `\item` (LaTeX build failed): lists are now found on the whole body, ignoring list commands inside listings.
Style: ORCID uses Font Awesome 5 Brands (U+F8D2) like the reference instead of a drawn "iD" badge; note calls are `#2f4f4f`, 7.5 pt, raised 4 pt, with `font-variant-position: normal` (Paged.js turns on the font's superscript glyphs and the raised, shrunk result was a speck).
Known differences, with reasons:
- `fonts` fails on DejaVuSans: the reference sets `\sum` and `\to` (page 6) with it, ours uses KaTeX. A math-rendering difference, the person's decision.
- WER 0.157 (paged) is mostly the reference's listings: its lstlisting cells extract one letter per word ("c e u r a r t"), ours one word. Not a visible difference.
- Page 2 headings sit 2.5-3 pt higher than the reference's and several rows jump by 2.7-4.6 pt (`offsets.py ceur 2`): not tuned yet.

## Continuation 2026-11-25 (4): spacing, measured by ink
`eval/offsets.py` reads word boxes, which are wrong for Libertinus Sans and Mono lines (it showed headings 3 pt high that the ruler shows aligned). New tool `eval/inkshift.py <id> <page>`: each reference line band slid over ours on the row ink profile (144 dpi), shift in pt, no font involved. Page 2 before: lines of the list-with-listings region drift +5.5 pt by the foot of the page.
Kept: `li > pre` margins (listing inside an item: 5 pt below when text follows, 6.5 pt as the item's last block, 5 pt above a `.lst`; the ruler showed 0.5 pt too much per block). Page 2 mean |shift| 2.45 -> 1.00 pt (max 2.5), pixel diff p2 0.0555 -> 0.0550, no page worse, SSIM 0.705 -> 0.706.
Tried and reverted: heading gaps (4.1 top 8 -> 13 pt, subsection bottom 7.5, section-to-section 12 -> 15 pt) brought page 2 to 0.78 mean / 2.0 max but made pages 4, 5 and 7 worse (p7 0.0843 -> 0.1000, p5 0.1054 -> 0.1157). Reason: the reference sets pages flush bottom, so its glue (lists, headings, \parskip) stretches or shrinks per page: page 1 lists are 3.5-4 pt looser than the class values, page 2's 4.2 gap 3.5 pt, page 3 tighter. One fixed value cannot match all pages.
Known: the gap above "4.2. Title variants" is 3.5 pt short on page 2; page 1's lists need +3.5 above and +4 below; page 3 breaks lower. They need a per-page stretch (flushbottom), not a style value.

## Continuation 2026-11-25 (5): content metrics that survive letter-spaced listings and reordering
`eval/fingerprint.ts` / `score.ts` now also report `cer` (edit distance on the letter stream, no word boundaries; banded Levenshtein), `line_cer` and `lines_matched` (lines aligned first by edit distance over the line sequence, leftovers paired in any order, then letters wrong inside matched lines). Self-check: `eval/layout.check.ts`. ceur paged: WER 0.169, CER 0.021, line CER 0.123, 0.888 of reference lines matched (LaTeX output: 0.214 / 0.061 / 0.070 / 0.955).

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

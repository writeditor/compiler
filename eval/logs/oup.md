# oup: run of the style-from-tex skill (page 1 front matter closed, page 2 headings and running head done, rest not tuned)

Model Sonnet 5.5. Date 2026-11-25. Sample `oup-authoring-template.tex` (contemporary, large; 10 pages, two columns), class `oup-authoring-template.cls` (OUP 2026, LPPL).

## Numbers (`make eval ARGS=oup`)
| | pages | style score |
|---|---|---|
| reference | 10 | 1.00 |
| LaTeX (ts) | 7 | 0.50 (compiles, 0 undefined refs) |
| PDF (paged) | 9 | 0.17 |
arXiv unchanged (3 pages, pixel diff 0.0805 / ...). CEUR `ts` does not compile (it did not before this run either: see styles/src/ceur/README.md).

## Phases
- Phase 0 (converter): `eval/tex2rash.ts` now reads `\abstract{}`, `metaCommands` (journal data, dates, key messages, other abstracts, labelled `\keywords[..]`), nested-brace `\author`/`\address` with `\ORCID`, `\title[short]{}`, nested lists, align, theorem-likes, proof, boxtext, biography, algorithm, sideways/starred floats, tablenotes, `\rule` placeholders, inline `thebibliography`, author-year `\cite/\citep/\citet`, appendices; figure/label numbering skips verbatim and `\verb`.
- Phase 1 (look): 6 rounds, all on page 1. Journal block, title, byline, affiliations, corresponding line, abstract, keywords, other abstract, key-messages box are within 1 pt (compare.py rows to y 500). Not started: the two-column flow below the box, pages 2-10.
- Phase 2 (markup): `markup.ts`, `BYLINE.oup = { numbered: true }`; four identical placeholder affiliations are kept apart with zero-width spaces. Editor not checked in a browser.
- Phase 3 (LaTeX): `export.xsl` writes the class's front matter (`\title[..]` is required: the class defines `\authormark` only there; `\societylogo` and `\appendix` are provided). Shared walker: a figure without `<img>` no longer writes `\includegraphics{}`. The body walker has no theorem, box, sideways or full-width float support: 7 pages against 10.

## Continuation (rounds 7-12 of phase 1)
- Page 1: page-foot lines (received, copyright) moved into a `@bottom-left` margin box fed by one `string()` (Paged.js takes one per `content`), rule above it; `column-fill: auto`; first heading 11.5 pt with its gap.
- Page 2: heading levels 1-5 (bold 11.5 / regular 10 / italic 10 / bold 9.5 / regular 9.5, centred, gaps 16/11 above), running head "n | Journal, YEAR, Volume, Issue" from the sample's own metas, formulas at 1em.
- Boxes: boxtext headings styled. Tried a landscape named page for sideways floats: 12 pages and the page stayed portrait (the class rotates the float on a portrait page), reverted.
- Open on page 1: column footnotes sit across the page foot instead of under the right column, so the left column ends ~20 pt early and the page break differs; page 2 therefore starts a few lines later than the reference.

## Edited
compiler: `eval/tex2rash.ts`, `eval/venues.ts` (metaCommands), `src/latex.ts` (graphic without image), `test/bridge.ts` (box = style id), `test/test_venue_oup.py`. styles: `src/oup/*`, `src/index.ts`, `.gitignore` (by new_style.py).

## Known differences and decisions for the person
See `styles/src/oup/README.md`. `page_size` cannot pass (Chromium rounds the page). Full-width and sideways floats need a documented shortcut (Paged.js has no `float: top` / `column-span`). Running head lacks year, volume, issue.

## Next
Page 1 columns (heading gaps, first paragraph), then page 2 on, one page at a time; tune `.p-rest` columns and figures; then body support in `src/latex.ts` for theorem, boxtext and sideways floats.

## Measured pass on page 1 (ruler + pixels, 288 dpi rules, 144 dpi pixel diff at 20% fuzz)
| element | reference | ours |
|---|---|---|
| journal block text x / title x | 47 / 242-353 | 47 / 242-353 |
| top dotted rule y (thick) | 238.5 (1.75) | 238.5 (1.5) |
| key-messages box top / bottom (thick) | 486.5 / 546.0 (1.0) | 486.5 / ~545.8 (1.0, drawn with gradients: a CSS border snaps to 0.75) |
| bottom dotted rule y | 555.25 | ~555.0 |
| graphical-abstract grey box y / h | 410.75 / 62.0 | 410.25 / 62.25 |
| logo box y / h / right edge | 40.0 / 20.0 / 559.5 | 39.75 / 20.25 / 559.25 |
| page-foot rule y (thick) | 732.0 (0.5) | 731.75 (0.75: the engine will not draw 0.5) |
| text rows to y 540 | | all within 1.5 pt (most within 0.5) |
Pixel diff: page 1 about 4.7%, page 2 about 8.4%. What is left on page 1 is glyph shape (the reference is Computer Modern Sans, ours Latin Modern Sans), the byline commas, and the column zone below the box (column footnotes).

## Every page (measured, `make eval ARGS=oup`; rulers: `eval/out/oup/rulers/p<N>-0-782.png`, reference left, ours right)
| page | words ref/ours | text rows ref/ours | text extent ref (x, y) | text extent ours | pixel diff | solid rules ref (y,thick) | solid rules ours |
|---|---|---|---|---|---|---|---|
| 1 | 401/386 | 58/54 | 35.4-559.8 x 38.0-758.5 | 35.4-559.9 x 37.4-763.5 | 4.6% | [(486.5, 1.0), (546.0, 1.0), (732.0, 0.5)] | [(486.5, 1.0), (545.8, 1.0), (731.8, 0.75)] |
| 2 | 953/853 | 107/122 | 35.4-559.8 x 29.8-731.0 | 35.4-559.9 x 30.9-712.0 | 8.4% | [] | [] |
| 3 | 644/762 | 110/109 | 35.4-559.8 x 29.8-731.2 | 35.4-559.9 x 30.9-704.2 | 7.1% | [] | [(429.0, 0.75), (442.5, 0.75), (458.2, 0.75), (486.0, 0.75)] |
| 4 | 493/478 | 74/93 | 35.4-559.8 x 29.8-731.2 | 35.4-559.9 x 30.9-718.8 | 4.9% | [] | [] |
| 5 | 164/668 | 129/115 | 115.2-559.8 x 29.8-729.5 | 35.4-559.9 x 30.9-715.0 | 4.4% | [] | [] |
| 6 | 764/918 | 106/111 | 35.4-559.8 x 29.8-731.0 | 35.4-559.9 x 30.9-716.3 | 9.3% | [] | [] |
| 7 | 814/788 | 91/94 | 35.4-559.8 x 29.8-731.0 | 35.4-559.9 x 30.9-719.5 | 8.7% | [] | [] |
| 8 | 760/659 | 99/79 | 35.4-559.8 x 29.8-731.0 | 35.4-559.9 x 30.9-715.0 | 7.9% | [] | [] |
| 9 | 724/629 | 93/95 | 35.4-559.8 x 29.8-731.0 | 35.4-559.9 x 30.9-708.3 | 7.0% | [] | [] |
| 10 | 392/0 | 45/0 | 35.4-559.8 x 29.8-325.7 | - | - | [] | - |

Reading it: only page 1 lines up with the reference row by row. From page 2 the page breaks differ (page 1 holds fewer lines in the left column because the footnotes take the full page foot), so row tables (`compare.py`) pair different text and the numbers above are page-level: text extent, row count, rules, pixel diff. Page 5 of the reference is the sideways page (rotated text, so its extent is not comparable), pages 3-4 and 6-7 hold the wide and sideways floats that sit in the column flow here. Page 10 of the reference has no counterpart (9 pages). Fixed on this pass: a listing's `[frame=...]` options were printed as text and ran off page 4 (x 596).

## Sideways page (page count 9 -> 10)
Why page 10 was missing: all the content fitted in 9 pages because the reference spends a whole page on the two rotated floats (page 5: 164 words) and leaves gaps around the wide floats. Now `markup.ts` collects `figure.sideways` into `.p-sideways > .p-sideways-in`; the CSS lays the inner box out as a 678 pt wide sheet and turns it with `translateY(677.4pt) rotate(-90deg)` (a `top` offset taller than the column wraps into the next column fragment in Paged.js, so the offset lives in the transform). Result against reference page 5: text y 51.9-729.9 (ref 52.5-729.5), table caption x 115, grey box and caption placed from the reference's 366-468 / 486; page 5 pixel diff 1.9% (was 4.4% with the floats in the flow). Pages after 5 are still out of step with the reference's breaks. Also tried and dropped: a landscape named page (page stays portrait in the reference), `writing-mode: vertical-rl` turned 180 degrees (the converter's inline `width/height` on the grey boxes are physical, so they came out wrong, and one caption vanished).

## Page-1 footnotes and heading size (reported from the browser view)
- Heading level 1 was 11.5 pt: measured widths of "Introduction" / "Equations" / "Tables" against the reference give 10.5 pt (ratio 1.00 now); the long first heading fits one line as in the reference. Levels 2-5 measured the same way: 10 / 9.77 / 8.94 / 9.37 pt.
- Footnotes: `@page { @footnote { margin-left: 270.7pt; border-top: .5pt solid } }` puts the area under the right column with its own short rule, as the class does. The numbers printed "66" and "68": the markup attribute `data-n` collides with something in the Paged.js pipeline, renamed `data-num`. Links in notes are black Latin Modern Mono 7 pt.
- Not fixable here: the class sets the footnote under the right column only, so its left column runs one line longer (down to y 705); Paged.js reserves the footnote height for both columns, so ours stop at 694 and the first paragraph splits one line differently. The "Received" line has no bold label (a margin box gets plain text from `string()`).

## Font sizes and line heights (word-by-word, ours / reference widths; 1.000 = same size)
Method: for the same word in both PDFs, compare the width of its bounding box (`pdftotext -bbox`), median over the words of a line or page; phrase widths are not used (justification stretches the gaps). Line pitch from the baselines of one column.
| element | ours now | word width ratio | note |
|---|---|---|---|
| body (Latin Modern Roman) | 8.507 pt / 11.5 pt | 1.000 (65 words, pages 2-9) | was 9.034 pt: 1.062 too wide in every word; the class's "9bp" is not what is printed |
| title | 20.1 pt bold sans | 1.005 | |
| authors | 11.8 pt sans | 1.00 | was 10.5 pt with word-spacing added to hide it |
| affiliations / corresponding line | 7.4 pt on 11 pt | 0.994 | pitch 11.0 = 11.0 |
| abstract headings (Abstract, Additional, Graphical) | 12 pt bold | 1.00 | was 11 pt |
| abstract text / keywords | 8.06 pt bold / 8.5 pt | 1.007 / 1.00 | |
| key-messages box | 8.5 pt on 11.5 pt, title 8 pt | 0.999 | was 7.5 pt |
| headings 1-5 | 10.5 / 10 / 9.77 / 8.94 / 9.37 pt | 1.00 | level 1 was 11.5 pt |
| captions (figure, table) | 8 pt / 8.5 pt | 1.003 / 1.00 | |
| table cells / table notes | 8 pt / 6.9 pt | 1.004 / 0.998 | |
| footnotes, code, listings | 8 pt / 8.1 pt | 1.005 / 1.000 | |
| lists, proof, theorem | body size | 1.00 / 1.00 / 1.011 | |
| quote, box text, algorithm, bibliography | 8.06 / 7.97 / 7.5 / 8.8 pt | 1.00 / 0.999 / 1.00 / 0.998 | |
| page-foot lines (Received, copyright) | 6.92 pt on 9.5 pt | 1.001 | |
Line height: reference body pitch is 11.5 pt exactly. Ours alternates 11.25 / 12.0 (Chromium snaps line boxes to 0.75 pt) and averages 11.51 over a column, so a line can sit up to 0.5 pt off and the error does not accumulate. Page 1 front-matter rows are all within 0.5 pt of the reference; boxes and rules match (see the table above).

## Second column start, line breaks, and the vanishing footnote (round after the user's screenshot)
- **Column tops.** In the class both columns start 25 pt under the front-matter rule and the first heading sits on the second column's first baseline (reference: heading 593.0, column 2 first line 592.5). Ours put the heading's top margin in front of the whole box, so column 2 started higher than column 1. Now `.p-rest { margin-top: 25.3pt }` and the first heading's margin is -1.9 pt: heading 593.1, column 2 first line 592.7, column 1 first body line 609.2 (ref 610.0).
- **Line breaks.** `word-spacing: -.07em` (was -.04em) gives the same eight lines in the first paragraph as TeX (-.1em packs too tight, -.04em adds a line per paragraph).
- **Footnote 1 disappeared** when the narrower body font went in (note present with 9.03 pt, gone with 8.507 pt, at any offset). Root cause found by instrumenting Paged.js: `afterPageLayout`'s footnote handler does `node.remove()` when the call's left edge is beyond the content box (`noteCallBounds.left > right`; it is meant for calls in an overflow column). A justified line ends exactly at the box edge, and the call, the last glyph, sat 0.016 px beyond it (754.47 vs 754.45). Fix: `.p-rest { margin-right: .5pt }` keeps the box half a point narrower. Both notes are back.
- **Still different from the reference on page 1:** the class keeps the first column full and puts the notes under the second only; Paged.js reserves the notes' height for both columns, so column 1 holds 9 lines (ref 10) and two lines of the first paragraph move to column 2. A negative `@footnote` margin-bottom did not change the reserve.
- Pages 3 and 4 end at y 650 / 497 (reference 731): the wide floats (`table*`, `figure*`) are still in the column flow; that is the next item.

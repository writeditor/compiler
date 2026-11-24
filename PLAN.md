# Plan: one compiler, one tester

One compiler (`src/`, TypeScript) and one tester (`eval/score.ts`). The upstream RASH tooling in `vendor/rash` (2017) is the reference the tester compares against; it is not a second compiler we maintain.

## What upstream gives us

- `grammar/rash.rng`: the grammar, for the RASH validity metric.
- `xslt/springer-lncs.xsl`, `xslt/acm-icps.xsl`: its own LaTeX converters.
- `papers/*.tex` and `*.pdf`: reference outputs built with the official LNCS and ACM classes.
- `js/rash.js`: browser renderer.

## Steps

Each step is done only when its check passes.

1. **Baseline.** Run upstream's LNCS and ACM XSLT over the corpus through `eval/score.ts`. Done when the CSV has `compiler=upstream` rows. Needs an XSLT processor in `eval/Containerfile`.
2. **TS compiler alongside.** Same papers through `exportLaTeX` with `lncs` and `acm` venues. A venue is `styles/src/<id>/export.xsl` plus its class in `styles/src/<venue>/class/` (the styles package). Done when the CSV has `compiler=ts` rows for the same papers.
3. **Fix the body walker once**, driven by failures in the CSV (`data:` images, `amsart` `\secnumpunct`, missing `arxiv.sty`/CUP class). Done when ts compiles at least as many papers as upstream.
4. **Validity and preservation.** `xmllint --relaxng rash.rng` on every source; element and metadata counts source vs output. New columns in the CSV.
5. **PDF route** (Paged.js + Chromium in the container) on the same tester.
6. **JATS** exporter, schema validity as a column.

## The tester

```sh
make eval-build
make eval
```

One row per paper, template and compiler. Adding a metric means adding a column, never a manual number. The corpus is `vendor/rash/examples`, `vendor/rash/papers` and `test/*.html`. Tracked results live in `eval/results.csv`; `eval/out/` is scratch.

## Status

| Template | Compiles (of 6 papers) |
|---|---|
| rash, amsart, arxiv, cambridge, oup | 0 |
| ceur | 1 (`chr-sample`) |

Known failures: `arxiv.sty` and the CUP class are not vendored; `data:` image URIs reach `\includegraphics`; `amsart` fails in `\secnumpunct`; the OUP class fails with an undefined control sequence (undiagnosed). `undefined_refs` currently also counts `Undefined control sequence` and needs a tighter pattern.

**rash2latex[arxiv] is frozen** (6/6 papers compile; the `templatePRIME` sample scores 1.00, 3 pages as the reference, page pixel diffs 0.007 / 0.062 / 0.061). Changes to it need a failing row, not a look-and-feel itch.

**rash2pdf[arxiv] (step 5) runs as `compiler=paged`:** `eval/render.ts` builds Writ's arxiv markup from the RASH head, applies `../styles/dist/arxiv.css`, lays it out with Paged.js in headless Chromium (driven by puppeteer-core, waiting for Paged.js's `after` hook) and prints the PDF. Same fingerprint and pixel checks against the same LaTeX reference. `make eval ARGS=arxiv` runs ref, ts and paged side by side.

Style fixes made in `../styles/src/arxiv/style.css`: a `var()` fallback (an undefined `--font-serif4` dropped the whole `font:` shorthand and the text fell back to 12 pt), the running head ("PRIME AI paper" on the right only, as in the class), and the space above the title rules. Result: paged scores 1.00 on the six style checks (page size, fonts, margins, leading, header/footer, title). Pages: 4 against the reference's 3.

Also done for the paged route (renderer `eval/render.ts` + style CSS): authors with the same affiliation share a column; the title footnote from `writ:cite`; `[n]` footnote links become real page footnotes (the Notes list is dropped); formulas typeset with KaTeX and numbered when they have an id; links boxed by kind (red references, green citations, cyan addresses); references with a hanging indent. The renderer does these on its own, so Writ's editor does not show them yet (it has no math typesetter and keeps the Notes list).

Still different: 4 pages against 3 (paragraph gap where LaTeX indents); adjacent citations are separate boxes `[1], [2]` where LaTeX has `[1, 2]`; the table header is bold, with partial rules and a "Part" cell that does not span.

## The methodology as an agent skill

Goal: an agent adds a new venue by running the same loop a person would, with the tester as its only feedback. Package it as a skill (`SKILL.md`) in this repo, so it ships with the compiler.

**Inputs the skill requires:** the venue's author guidelines, its official LaTeX class or template zip, and a sample PDF.

**Loop:**
1. Vendor the class into `styles/src/<venue>/class/` (the styles package) and note its licence.
2. Write `styles/src/<venue>/export.xsl` for preamble and front matter only (authors, affiliations, abstract, keywords). Never touch the body walker for one venue; a body bug is fixed once in `src/latex.ts`.
3. Nothing to register: `VENUES` in `src/venue.ts` lists every `styles/src/*/export.xsl`.
4. Run the tester, read the first LaTeX error in `eval/out/<style>/<ts|upstream|ref>/<paper>.<style>.<role>.log` (a failed build keeps its log; a successful one is cleaned), fix, repeat until the row compiles on every corpus paper or the failure is a compiler bug (then fix it in `src/` with a test).
5. Stop when scores stop improving; record the iteration count.

**Guardrails (so the agent cannot game the metrics):**
- Locked values the skill may not change: page size, margins, font size, and options taken from the official class.
- Never edit the tester, the corpus or the thresholds to make a row pass.
- Never weaken sanitising in `src/latex.ts`; paper text must not inject LaTeX.
- A venue that needs a class we cannot redistribute is marked as such, not faked.
- A human reviews the first generated venue's PDF against the sample PDF before merge (compiling is not the same as looking right).

**Outputs:** the XSLT, the class files, a CSV delta, and a short log (model, date, iterations, edits, time) saved under `eval/logs/<venue>.md`. These logs feed the paper's style-skill table (success rate, iterations, human edits).

**Built:** `skills/tex-to-exporter/SKILL.md` (gitignored for now: it ships on its own, not with the compiler), written from the arxiv run (`styles/src/arxiv/`; tools `eval/compare.py`, `eval/rules.py`, `eval/ruler.py`). Next: run the loop on a second venue (LNCS) and keep `eval/logs/<venue>.md`.

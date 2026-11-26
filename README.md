# @writeditor/compiler

Compiles [RASH](https://github.com/essepuntato/rash) (semantic scholarly HTML) to other formats. Used by [Writ](https://github.com/writeditor/writ); it has no dependency on Writ or its editor schema.

| Target | Status |
|---|---|
| LaTeX (`rash`, `amsart`, `arxiv` preambles; XSLT venues such as `cambridge`) | done |
| PDF, DOCX, XML | planned |

```ts
import { toLaTeX, exportLaTeX } from "@writeditor/compiler";

toLaTeX(rashHtml, "amsart");        // built-in template
await exportLaTeX(rashHtml);        // the paper's own <meta property="writ:style">, else "rash"
await exportLaTeX(rashHtml, "cambridge");
```

Input is a RASH document as a string. Author, affiliation, keyword and subtitle data are read from the head (RDFa `about`, `prism:keyword`, `<title>` with ` -- ` before the subtitle); the body is walked as DOM. Venue fields are `<meta property="writ:<venue>.<field>">`. A venue's XSLT (`xslt/<venue>.xsl`) owns only the preamble and front matter; `toLaTeX` keeps the body and all escaping. XSLT venues need well-formed XML (RASH is).

Text, URLs, ids, paths, verbatim blocks and math are sanitised so a paper cannot add LaTeX commands (see `test/latex.test.ts`). Math is a deny-list, not a parser: compile with `-no-shell-escape`.

## Development

```sh
git submodule update --init   # upstream RASH examples used by test/test_upstream.py (vendor/rash)
pnpm install
make test        # Python tests in a venv (.venv)
make typecheck
```

Adding a target: a new `src/<target>.ts` that takes a RASH string, exported from `src/index.ts`, with tests next to the others. Adding a venue: `styles/src/<id>/export.xsl` (found by folder name, no registry here).

## Evaluation

```sh
make eval-build
make eval                 # every paper and style, writes eval/results.csv
make eval ARGS=arxiv      # one style: its reference sample, compiled by LaTeX, by our LaTeX route and by the Paged.js route
```

One row per paper and template: whether the exported `.tex` compiles with `latexmk`, page count, undefined references. Add metrics as columns in `eval/score.ts`.

### Paper corpus (arXiv)

`make corpus ARGS=arxiv` puts real papers through one style twice, RASH → LaTeX → PDF (`ts`) and RASH → HTML+CSS → Paged.js → PDF (`paged`), and scores `paged` against `ts`.

| File | In git | What it is |
|---|---|---|
| `eval/corpus-arxiv.tsv` | yes | the corpus: 45 arXiv cs.DL papers, CC BY (id, licence, authors, title) |
| `eval/corpus-eval.txt` | yes | the papers the scorer runs (31 of them, plus 4 from `vendor/rash`) |
| `eval/corpus-arxiv-references.json` | yes | each paper's references and conversion flags, written by `html2rash.ts` |
| `eval/corpus-results-<style>.csv` | yes | the last full run, one row per paper |
| `eval/corpus/arxiv/<id>/` | no | downloaded arXiv HTML + images, and `rash.html` made from them |
| `eval/out/corpus/<style>/<id>/{ts,paged}/` | no | the two PDFs, the `.tex` and its log |

```sh
make corpus-fetch                   # downloads every paper in corpus-arxiv.tsv (one request every 3 s: slow the first time, then only what is missing) and writes each rash.html
node eval/html2rash.ts [id ...]     # only the RASH again, after changing the converter
make corpus ARGS=arxiv              # every paper: writes eval/corpus-results-arxiv.csv
make corpus ARGS="arxiv 2610.33018" # one paper: prints its row, the CSV is left alone
python3 -I eval/fetch_arxiv_html.py --select [count] [from]   # pick a new corpus (rewrites corpus-arxiv.tsv): only on purpose
```

### Setting up on another machine

1. **Tools**: git, Node ≥ 24, pnpm, Python 3, podman, ImageMagick (`magick`/`convert`: SVG figures and multi-panel figures).
2. **Repos side by side** (the compiler links `../styles`, and the container mounts it):
   ```sh
   mkdir writeditor && cd writeditor
   git clone git@github.com:writeditor/compiler.git
   git clone git@github.com:writeditor/styles.git
   (cd styles && pnpm install && pnpm build)
   (cd compiler && git submodule update --init && pnpm install)
   ```
   Check out the same branch in both when the work spans them.
3. **Third-party LaTeX classes and samples**: not in git (copyright), required by the tests and the scorer. `make check-third-party` lists what is missing and points to each `SOURCE.txt`:
   - `styles/src/arxiv/class/PRIMEarxiv.sty`, `styles/src/arxiv/sample/`: PRIME AI arXiv template (`styles/src/arxiv/SOURCE.txt`)
   - `styles/src/ceur/class/`, `styles/src/ceur/sample/`, `compiler/eval/classes/ceurart/`: CEUR-WS `CEURART.zip`
   - `styles/src/oup/class/`, `styles/src/oup/sample/`, `compiler/eval/classes/oup/`: OUP authoring template
   - `compiler/test/chr-sample.html`: RASH of the Cambridge CHR sample

   Download sources are not all recorded, so the simplest way is to carry them from a machine that has them:
   ```sh
   # on the old machine, in the folder holding compiler/ and styles/
   tar czf writ-third-party.tgz styles/src/*/class styles/src/*/sample compiler/eval/classes compiler/test/chr-sample.html
   # on the new one, same folder
   tar xzf writ-third-party.tgz
   ```
4. **Container** (LaTeX, Chromium, fonts; the scorer runs only in it): `cd compiler && make eval-build`
5. **Corpus**: `make corpus-fetch`, then `make corpus ARGS=arxiv`. Check `make test` passes too.

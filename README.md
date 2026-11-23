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

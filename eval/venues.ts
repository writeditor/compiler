// The styles the tester knows: every styles/src/<id>/ that has a venue.json, which says what to measure it against.
//   { "sample": "sample/x.tex",          the official sample, relative to the style's folder (required)
//     "dirs":   ["class", "sample"],     folders LaTeX searches for the class and the .bib (default: none)
//     "media":  "class/media",           where the sample's relative images are (default "media")
//     "engine": "pdflatex",              pdflatex (default), xelatex or lualatex: how the class is compiled (latexmk)
//     "fonts":  ["Libertinus Serif"],    families the reference PDF uses; the scorer warns when the container has none of them (fc-match)
//     "tex": {                           how eval/tex2rash.ts reads the sample (all optional; the default is the plain article form of arxiv)
//       "authors": "bracket",            "and" (default: \author{A \\ aff \And B}) or "bracket" (ceurart: \author[1]{A}[email=..] + \address[1]{..})
//       "frontAfterBegin": true,         \title, \author... sit between \begin{document} and \maketitle
//       "fields": { "year": "copyrightyear" },   \command{..} -> <meta property="writ:<id>.year">, for the venue's export.xsl
//       "metaCommands": { "received": 3 },        \cmd[opt]{a}{b}.. -> <meta property="writ:<id>.cmd" content="opt|a|b"> (OUP front matter; also turns \abstract{..} into the abstract)
//       "frontCommands": ["title", ...] } }      commands taken out of the body (default: the ceurart set plus the fields)
// The style id is also the compiler template name used for the LaTeX rows (src/latex.ts TEMPLATES, or an XSLT venue in src/venue.ts).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The styles package: CSS, markup, class files, official samples. */
export const styles = dirname(dirname(fileURLToPath(import.meta.resolve("@writeditor/styles"))));
export type TexConfig = { authors?: "and" | "bracket"; frontAfterBegin?: boolean; fields?: Record<string, string>; frontCommands?: string[]; metaCommands?: Record<string, number> };
export type Venue = { id: string; dir: string; sample: string; dirs: string[]; media: string; engine: "pdflatex" | "xelatex" | "lualatex"; fonts: string[]; tex: TexConfig };

export const venues: Record<string, Venue> = Object.fromEntries(readdirSync(`${styles}/src`).flatMap((id) => {
  const dir = `${styles}/src/${id}`, file = join(dir, "venue.json");
  if (!existsSync(file)) return [];
  const m = JSON.parse(readFileSync(file, "utf8"));
  if (m.engine && !["pdflatex", "xelatex", "lualatex"].includes(m.engine)) throw new Error(`${file}: "engine" must be pdflatex, xelatex or lualatex`);
  if (typeof m.sample !== "string") throw new Error(`${file}: "sample" (the official .tex, relative to the style folder) is required`);
  return [[id, { id, dir, sample: join(dir, m.sample), dirs: (m.dirs ?? []).map((d: string) => join(dir, d)), media: join(dir, m.media ?? "media"), engine: m.engine ?? "pdflatex", fonts: m.fonts ?? [], tex: m.tex ?? {} }]];
}));

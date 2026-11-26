// The paper corpus through one style, twice: RASH -> LaTeX -> PDF (the reference, `ts`) and RASH -> HTML+CSS -> Paged.js -> PDF (`paged`); then paged against ts, paper by paper.
//   node eval/corpus_score.ts <style> [paper-id-or-substring ...]      in the container, like score.ts (make corpus ARGS=arxiv)
// Papers: eval/corpus-eval.txt (arXiv ids with a rash.html in eval/corpus/arxiv/, and vendor/rash paths). Output: eval/out/corpus/<style>/<paper>/{ts,paged}/ and eval/corpus-results.csv (a partial run does not overwrite it).
// No official PDF exists for these papers, so `ts` stands for "what LaTeX makes of the same RASH". It is only a reference where the LaTeX export is itself validated on the venue's official sample (see eval/logs/).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { exportLaTeX } from "../src/index.ts";
import { exportPdf } from "../pdf/index.ts";
import { MARKUP } from "@writeditor/styles";
import { venues } from "./venues.ts";
import { fingerprint, compare, pagesPx, pixelDiffs, ssims, readWords, layoutDiff, fontDiff } from "./fingerprint.ts";

const root = new URL("../", import.meta.url).pathname;
const [style, ...only] = process.argv.slice(2);
if (!style || !venues[style]) throw new Error(`usage: corpus_score.ts <style: ${Object.keys(venues).join("|")}> [paper ...]`);
const v = venues[style];
const papers = readFileSync(`${root}eval/corpus-eval.txt`, "utf8").split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean)
  .map((p) => (p.includes("/") ? { id: p.replace(/^.*\//, "").replace(/\.html$/, ""), file: resolve(root, p) } : { id: p, file: `${root}eval/corpus/arxiv/${p}/rash.html` }))
  .filter((p) => !only.length || only.some((o) => p.id.includes(o)));
const letters = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}]/gu, "");
const vocab = (s: string) => new Set(s.normalize("NFKC").toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length >= 5));
const csv = ["paper,style,ts_ok,paged_ok,ts_pages,paged_pages,wer,cer,line_cer,lines_matched,line_end_recall,page_agree,dx_med,dy_med,dy_p95,ssim,pixel_diff_p1,size_agree,text_box_iou,fonts_missing,ts_word_recall,paged_word_recall"];
const dirs = [`${root}eval/classes`, ...v.dirs];

for (const { id, file } of papers) {
  const out = `${root}eval/out/corpus/${style}/${id}/`, base = dirname(file);
  mkdirSync(`${out}ts/`, { recursive: true }); mkdirSync(`${out}paged/`, { recursive: true });
  const rash = readFileSync(file, "utf8"), name = `${id}.${style}`;
  const got: Record<string, boolean> = { ts: false, paged: false };
  // ts: LaTeX from the exporter, compiled with the paper's own folder on the search path for its images
  try {
    writeFileSync(`${out}ts/${name}.tex`, await exportLaTeX(rash, style));
    const path = [...dirs, base].map((d) => `${d}//`).join(":") + ":";
    const r = spawnSync("latexmk", ["-g", `-${{ pdflatex: "pdf", xelatex: "xelatex", lualatex: "lualatex" }[v.engine]}`, "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", `${name}.tex`], { cwd: `${out}ts`, encoding: "utf8", timeout: 240_000, env: { ...process.env, TEXINPUTS: path, BIBINPUTS: path } });
    got.ts = r.status === 0 && existsSync(`${out}ts/${name}.pdf`);
    if (!got.ts) console.error(`  ${id}: LaTeX failed: ${(readFileSync(`${out}ts/${name}.log`, "utf8").match(/^!.*$/m) ?? ["no log"])[0]}`);
  } catch (e) { console.error(`  ${id}: ts: ${(e as Error).message.split("\n")[0]}`); }
  // paged: RASH -> HTML+CSS -> Paged.js -> PDF
  try { await exportPdf(rash, { cssFile: `${root}node_modules/@writeditor/styles/dist/${style}.css`, markup: MARKUP[style as keyof typeof MARKUP] }, `${out}paged/`, name, base); got.paged = true; }
  catch (e) { console.error(`  ${id}: paged: ${(e as Error).message.split("\n")[0]}`); }
  let row = `${id},${style},${got.ts},${got.paged},`;
  if (got.ts && got.paged) {
    const pages = (d: string) => +spawnSync("pdfinfo", [`${name}.pdf`], { cwd: `${out}${d}`, encoding: "utf8" }).stdout.match(/Pages:\s+(\d+)/)![1];
    const a = { fp: fingerprint(`${name}.pdf`, `${out}paged`), px: pagesPx(`${name}.pdf`, `${out}paged`), ws: readWords(`${name}.pdf`, `${out}paged`) };
    const r = { fp: fingerprint(`${name}.pdf`, `${out}ts`), px: pagesPx(`${name}.pdf`, `${out}ts`), ws: readWords(`${name}.pdf`, `${out}ts`) };
    const L = layoutDiff(a.ws, r.ws), ss = ssims(a.px, r.px), fd = fontDiff(`${name}.pdf`, `${out}paged`, a.fp, r.fp), px = pixelDiffs(a.px, r.px);
    // does each PDF still hold the paper's words? (the RASH text without its formulas: both paths could lose the same block)
    const src = vocab(rash.replace(/<span role="math">[^<]*<\/span>/g, " ").replace(/<head>[\s\S]*<\/head>/, " ").replace(/<[^>]+>/g, " ")), recall = (ws: typeof a.ws) => { const have = new Set(ws.map((w) => w.t)), all = letters(ws.map((w) => w.t).join(" ")); return [...src].filter((w) => have.has(w) || all.includes(w)).length / (src.size || 1); };
    writeFileSync(`${out}report.json`, JSON.stringify({ layout: L, ssim_by_page: ss, pixel_diff_by_page: px, fonts: fd, checks: compare(a.fp, r.fp).checks, words_in_source: src.size }, null, 1));
    row += [pages("ts"), pages("paged"), L.wer, L.cer, L.line_cer, L.lines_matched, L.line_end_recall, L.page_agree, L.dx_med, L.dy_med, L.dy_p95, +(ss.reduce((x, y) => x + y, 0) / (ss.length || 1)).toFixed(3), px[0], L.size_agree, L.text_box_iou, `"${fd.missing.join(" ")}"`, recall(r.ws).toFixed(3), recall(a.ws).toFixed(3)].join(",");
  } else row += ",,,,,,,,,,,,,,,,,";
  csv.push(row); console.error(row);
}
if (!only.length) writeFileSync(`${root}eval/corpus-results-${style}.csv`, csv.join("\n") + "\n");
else console.error("partial run: eval/corpus-results-*.csv not written");

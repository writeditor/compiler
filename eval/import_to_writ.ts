// Put the corpus papers (eval/corpus/arxiv/<id>/rash.html, see html2rash.ts) into a local Writ database, owned by one person.
//   cd ../writeditor/apps/server && WRIT_SERVER=$PWD node ../../../compiler/eval/import_to_writ.ts <owner-member-id> "<creator name>"
// Uses the server's own createPaper (the same RASH -> Yjs path as an upload), so it must run with the server's database (DB_PATH, default ./writeditor.sqlite). Back the database up first.
// Writ keeps images inside the paper (data:image, at most 220 KB each and 4 MB per paper): bigger ones are shrunk with ImageMagick, and replaced by a placeholder if they still do not fit.
// Skips papers that did not convert (no sections, or no title and under 2000 words). Papers already imported (eval/corpus/writ-papers.json) are not imported twice, unless REPLACE=1 (it deletes those papers first). The alpha cap per owner (MAX_PAPERS) is lifted for this process only.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { parseHTML } from "linkedom";

process.env.MAX_PAPERS = "1000";
const [owner, creator] = process.argv.slice(2);
if (!owner || !creator || !process.env.WRIT_SERVER) throw new Error("usage: WRIT_SERVER=<apps/server> node import_to_writ.ts <owner-member-id> <creator name>");
// the server sets the DOM that parses RASH when it starts; do the same, on the server's own copy of the rash package
const { setDOM } = await import(pathToFileURL(createRequire(`${process.env.WRIT_SERVER}/package.json`).resolve("@writeditor/rash")).href);
setDOM(parseHTML("<!doctype html><html><body></body></html>"));
const { createPaper, deletePaper, store } = await import(`${process.env.WRIT_SERVER}/src/papers.ts`);
const here = dirname(fileURLToPath(import.meta.url)), corpus = join(here, "corpus", "arxiv"), mapFile = join(here, "corpus", "writ-papers.json");
const done: Record<string, string> = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, "utf8")) : {};
const PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const MIME: Record<string, string> = { ".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".gif": "gif", ".webp": "webp" };

/** The image as bytes within `budget`, as [mime, data], or null. */
function fit(file: string, budget: number): [string, Buffer] | null {
  const raw = readFileSync(file), ext = MIME[extname(file).toLowerCase()];
  if (!ext) return null;
  if (raw.length <= budget) return [ext, raw];
  for (const [w, q] of [[1400, 80], [1100, 70], [900, 60], [700, 50], [500, 45]]) {
    const out = execFileSync("convert", [`${file}[0]`, "-resize", `${w}x${w}>`, "-background", "white", "-alpha", "remove", "-strip", "-quality", String(q), "jpeg:-"], { maxBuffer: 1 << 27 });
    if (out.length <= budget) return ["jpeg", out];
  }
  return null;
}

if (process.env.REPLACE === "1") for (const id of Object.keys(done)) { try { deletePaper(done[id], owner); } catch (e) { console.log(`  ${id}: not deleted (${(e as Error).message})`); } delete done[id]; } // REPLACE=1: remove what this script imported before, then import again
let imported = 0; const skipped: string[] = [];
for (const id of readFileSync(join(here, "corpus-arxiv.tsv"), "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")[0])) {
  if (done[id]) continue;
  const file = join(corpus, id, "rash.html");
  if (!existsSync(file)) { skipped.push(`${id}: no rash.html`); continue; }
  let html = readFileSync(file, "utf8");
  const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  if (!/<section/.test(html) || (/<title><\/title>/.test(html) && words < 2000)) { skipped.push(`${id}: did not convert (${words} words)`); continue; }
  // Writ-only adapter: RASH's td holds blocks (<td><p>..</p></td>); Writ's table cells hold inline text and would drop the paragraph, and the caption with it.
  html = html.replace(/<td([^>]*)><p>((?:(?!<\/p>)[\s\S])*)<\/p><\/td>/g, "<td$1>$2</td>");
  // Writ-only adapter: RASH's formula box (figure > p > span[role=math]) is not read by Writ's importer yet (RASH-GAPS.md: it becomes an empty image figure); its own display form is div.display_formula.
  html = html.replace(/<figure id="([^"]*)"><p>(<span role="math">[^<]*<\/span>)<\/p><\/figure>/g, '<div class="display_formula" id="$1">$2</div>');
  const srcs = [...new Set([...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith("data:")))], budget = Math.min(220_000, Math.floor(3_800_000 / Math.max(1, srcs.length)));
  let dropped = 0;
  for (const s of srcs) {
    const path = normalize(join(corpus, id, s.replace(/&amp;/g, "&"))), got = path.startsWith(join(corpus, id)) && existsSync(path) ? fit(path, budget) : null;
    if (!got) dropped++;
    html = html.split(`<img src="${s}" alt="`).join(`<img src="${got ? `data:image/${got[0]};base64,${got[1].toString("base64")}` : PLACEHOLDER}" alt="${got ? "" : "(not imported) "}`);
  }
  done[id] = createPaper(owner, { actor: creator, kind: "human" }, html);
  imported++; console.log(`${id} -> ${done[id]}  ${srcs.length - dropped}/${srcs.length} images`);
  writeFileSync(mapFile, JSON.stringify(done, null, 1) + "\n");
}
console.log(`${imported} imported, ${skipped.length} skipped`); for (const s of skipped) console.log(`  skipped ${s}`);
store.close?.();

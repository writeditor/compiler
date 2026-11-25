// One CSV row per paper x template x compiler: does the .tex compile, pages, undefined references.
// Run in the container: `npm run eval` (all) or `npm run eval -- arxiv [paper-substring]` (one style: the reference sample converted to RASH by eval/tex2rash.ts + the reference; `-- arxiv all` for every paper; never touches results.csv).
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { exportLaTeX, TEMPLATES, VENUES } from "../src/index.ts";
import { texToRash } from "./tex2rash.ts";
import { exportPdf } from "../pdf/index.ts";
import { STYLES, MARKUP } from "@writeditor/styles";
import { dirname, relative, resolve } from "node:path";
import { venues } from "./venues.ts";
import { fingerprint, compare, pagesPx, pixelDiffs, type Fingerprint } from "./fingerprint.ts";

const root = new URL("../", import.meta.url).pathname;
const corpus = ["vendor/rash/examples", "vendor/rash/papers", "test"].flatMap((d) => readdirSync(root + d).filter((f) => f.endsWith(".html")).map((f) => `${d}/${f}`));
// upstream = the 2017 RASH XSLT run through Saxon-HE (XSLT 2.0); ts = our compiler. Same tester for both.
const upstream: Record<string, string> = { lncs: "springer-lncs", acm: "acm-icps" };
// ref = the venue's official sample, compiled by plain LaTeX: the PDF our output should look like.
const ref: Record<string, string> = Object.fromEntries(Object.entries(venues).map(([id, v]) => [id, v.sample]));
// The class and the sample are third-party and not in git: a style whose sample is missing is skipped, with a pointer to where to get it.
const missing = new Set(Object.values(venues).filter((v) => !existsSync(v.sample)).map((v) => v.id));
for (const id of missing) console.error(`skipping ${id}: ${venues[id].sample} is missing; see ${venues[id].dir}/SOURCE.txt`);
const searchDirs = [`${root}eval/classes`, `${root}vendor/rash/cls`, `${root}vendor/rash/papers`, `${root}vendor/rash/examples`, ...Object.values(venues).flatMap((v) => v.dirs)].map((d) => `${d}//`).join(":") + ":";
const [only, arg] = process.argv.slice(2);
// A venue declares the fonts its reference PDF uses; Chromium (paged route) can only match them if the container has them.
for (const v of Object.values(venues)) if (!missing.has(v.id) && (!only || only === v.id)) for (const f of v.fonts) {
  const got = spawnSync("fc-match", ["-f", "%{family}", f], { encoding: "utf8" }).stdout.split(",")[0];
  if (got.toLowerCase() !== f.toLowerCase()) console.error(`warning: ${v.id}: font "${f}" is not in the container (fc-match gives "${got}"): the fonts check cannot pass; see eval/Containerfile`);
}
const filter = only && !arg ? (ref[only] ?? "chr-sample").split("/").pop()!.replace(/\.tex$/, "") : arg === "all" ? "" : arg; // one style alone = one paper (+ its reference); `all` for every paper
const jobs = [...new Set([...Object.keys(TEMPLATES), ...Object.keys(VENUES), ...Object.keys(venues)]).values().map((t) => ["ts", t] as const), ...Object.keys(upstream).map((t) => ["upstream", t] as const), ...Object.keys(ref).map((t) => ["ref", t] as const), ...Object.keys(ref).map((t) => ["paged", t] as const)].filter(([, t]) => (!only || t === only) && !missing.has(t)).sort(([a], [b]) => +(b === "ref") - +(a === "ref")); // reference first: later rows are compared with it
// The reference sample is converted to RASH (kept next to the outputs) so both sides start from the same content.
const rash = (p: string, t: string, out: string, name: string) => { const h = texToRash(resolve(root, p), t); writeFileSync(`${out}${name}.rash.html`, h); return h; };
const refs: Record<string, { fp: Fingerprint; px: ReturnType<typeof pagesPx> }> = {};
const lines = ["paper,template,compiler,compiles,pages,undefined_refs,style_score,pixel_diff"];
for (const [c, t] of jobs) for (const p of c === "ref" ? [ref[t]] : [...corpus, ...(ref[t] ? [ref[t]] : [])].filter((p) => !filter || p.includes(filter))) {
  const out = `${root}eval/out/${t}/${c}/`; // eval/out/<style>/<ref|ts|paged|upstream>/
  mkdirSync(out, { recursive: true });
  const name = `${p.split("/").pop()!.replace(/\.(html|tex)$/, "")}.${t}.${c}`;
  let row = "";
  try {
    let ok: boolean, log = "";
    if (c === "paged") { if (!(t in STYLES)) throw new Error(`${t} is not registered in styles/src/index.ts`); await exportPdf(p.endsWith(".tex") ? rash(p, t, out, name) : readFileSync(resolve(root, p), "utf8"), { cssFile: resolve(root, "node_modules/@writeditor/styles/dist", `${t}.css`), markup: MARKUP[t as keyof typeof MARKUP] }, out, name, p.endsWith(".tex") ? venues[t].media : dirname(resolve(root, p))); ok = true; } // RASH -> HTML+CSS -> Paged.js -> PDF, no LaTeX
    else {
      writeFileSync(`${out}${name}.tex`, c === "ref" ? readFileSync(resolve(root, p), "utf8") : c === "ts" ? await exportLaTeX(p.endsWith(".tex") ? rash(p, t, out, name) : readFileSync(resolve(root, p), "utf8"), t)
        : execFileSync("sh", ["-c", `java -cp "$(ls /usr/share/java/Saxon-HE*.jar | head -1)" net.sf.saxon.Transform -warnings:silent -s:"$0" -xsl:"$1"`, resolve(root, p), `${root}vendor/rash/xslt/${upstream[t]}.xsl`], { encoding: "utf8", maxBuffer: 1 << 28 }).replaceAll("\r", "")); // upstream emits CRLF, which LaTeX reads as part of file names
      const r = spawnSync("latexmk", ["-g", `-${{ pdflatex: "pdf", xelatex: "xelatex", lualatex: "lualatex" }[venues[t]?.engine ?? "pdflatex"]}`, "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", `${name}.tex`], { cwd: out, encoding: "utf8", env: { ...process.env, BIBINPUTS: searchDirs, TEXINPUTS: searchDirs } });
      ok = r.status === 0;
      log = readFileSync(`${out}${name}.log`, "utf8");
      if (ok) spawnSync("latexmk", ["-c", `${name}.tex`], { cwd: out }); // drop aux files and the log; a failed build keeps its log to read
    }
    const pages = ok ? execFileSync("pdfinfo", [`${name}.pdf`], { cwd: out, encoding: "utf8" }).match(/Pages:\s+(\d+)/)![1] : "";
    row = `${ok},${pages},${(log.match(/(Reference|Citation) .*undefined/gi) ?? []).length},`;
    if (ok && ref[t]) {
      const fp = fingerprint(`${name}.pdf`, out), px = pagesPx(`${name}.pdf`, out);
      if (c === "ref") refs[t] = { fp, px };
      const base = refs[t];
      if (base) {
        const { checks, score } = compare(fp, base.fp);
        const diffs = pixelDiffs(px, base.px);
        writeFileSync(`${out}${name}.report.json`, JSON.stringify({ checks, score, pixel_diff_by_page: diffs, fingerprint: fp, reference: base.fp }, null, 2));
        console.error(`  pixel diff by page: ${diffs.join(" ")}`);
        console.error(`  ${name}: ${Object.entries(checks).map(([k, v]) => `${v ? "ok  " : "FAIL"} ${k}`).join(", ")}`);
        row += `${score.toFixed(2)},${diffs[0]}`;
      } else row += ",";
    } else row += ",";
  } catch (e) { row = "false,,,,"; console.error(`  ${name}: ${(e as Error).message.split("\n")[0]}`); }
  lines.push(`${relative(root, resolve(root, p))},${t},${c},${row}`);
  console.error(lines.at(-1)); // progress
}
if (!only) writeFileSync(root + "eval/results.csv", lines.join("\n") + "\n"); // a partial run never overwrites the full table

// Each measured style keeps its result in its own README, between markers: what was compared, and the values.
for (const t of new Set(lines.slice(1).map((l) => l.split(",")[1]).filter((t) => venues[t] && !missing.has(t)))) {
  const rows = ["ref", "ts", "paged"].flatMap((c) => lines.slice(1).filter((l) => { const f = l.split(","); return f[1] === t && f[2] === c && f[0] === relative(root, venues[t].sample); }).map((l) => [c, ...l.split(",").slice(3)]));
  const rep = (c: string) => { try { return JSON.parse(readFileSync(`${root}eval/out/${t}/${c}/${venues[t].sample.split("/").pop()!.replace(/\.tex$/, "")}.${t}.${c}.report.json`, "utf8")); } catch { return null; } };
  const table = ["| Output | Compiles | Pages | Undefined refs | Style score | Failed checks | Pixel diff by page |", "|---|---|---|---|---|---|---|", ...rows.map(([c, ok, pages, undef, score]) => {
    const r = rep(c);
    return `| ${c === "ref" ? "reference (official class)" : c === "ts" ? "LaTeX (our compiler)" : "PDF (paged)"} | ${ok} | ${pages || "-"} | ${undef || "-"} | ${score || "-"} | ${r ? Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k).join(", ") || "none" : "-"} | ${r ? r.pixel_diff_by_page.join(" / ") : "-"} |`;
  })].join("\n");
  const block = `<!-- metrics:start -->\n## Compilation check\n\nSample: \`${relative(venues[t].dir, venues[t].sample)}\`, converted to RASH, compiled by each output and compared with the reference PDF. Last run ${new Date().toISOString().slice(0, 10)} (\`make eval ARGS=${t}\`).\n\n${table}\n\nStyle score: share of the checks (page size, fonts, margins, leading, header/footer, title) that match the reference. Pixel diff: share of pixels that differ on each page (0 = identical). Both are measured, never edited by hand.\n<!-- metrics:end -->`;
  const f = `${venues[t].dir}/README.md`, old = existsSync(f) ? readFileSync(f, "utf8") : `# ${t}\n\n`;
  writeFileSync(f, /<!-- metrics:start -->[\s\S]*<!-- metrics:end -->/.test(old) ? old.replace(/<!-- metrics:start -->[\s\S]*<!-- metrics:end -->/, () => block) : old.trimEnd() + "\n\n" + block + "\n");
}

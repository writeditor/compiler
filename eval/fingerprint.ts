// Style fingerprint of a PDF (poppler only) and its comparison with the reference PDF of the same style.
// Text differs between a paper and the official sample, so we compare layout (page, fonts, margins, sizes, header/footer, title), not words.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";

const run = (cmd: string, args: string[], cwd: string) => execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
const mode = (xs: number[]) => { const c = new Map<number, number>(); xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1)); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0; };
/** Median distance between consecutive text lines (pt): the line spacing, independent of the font. */
const leading = (pages: { H: number; words: { y0: number }[] }[]) => {
  const d: number[] = [];
  for (const p of pages) { const ys = [...new Set(p.words.filter((w) => w.y0 > 0.07 * p.H && w.y0 < 0.93 * p.H).map((w) => Math.round(w.y0 * 2) / 2))].sort((a, b) => a - b); for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 8 && ys[i] - ys[i - 1] < 20) d.push(ys[i] - ys[i - 1]); }
  return d.sort((a, b) => a - b)[d.length >> 1] ?? 0;
};
const norm = (ws: { t: string }[]) => ws.map((w) => w.t).join(" ").replace(/\d+/g, "#");

export function fingerprint(pdf: string, cwd: string) {
  const size = run("pdfinfo", [pdf], cwd).match(/Page size:\s*([\d.]+ x [\d.]+)/)![1];
  const fonts = [...new Set(run("pdffonts", [pdf], cwd).split("\n").slice(2).map((l) => l.split(/\s+/)[0].replace(/^[A-Z]{6}\+/, "").replace(/-.*/, "").replace(/^(NimbusRomNo9L|NimbusRoman|LiberationSerif|TimesNewRoman.*)$/, "Times")).filter(Boolean))].sort();
  const pages = run("pdftotext", ["-bbox", pdf, "-"], cwd).split("<page ").slice(1).map((p) => ({
    H: +/height="([\d.]+)"/.exec(p)![1],
    words: [...p.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)].map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5] })),
  }));
  const inner = pages.length > 1 ? pages.slice(1) : pages; // page 1 carries the title block, so layout comes from the others
  const body = inner.flatMap((p) => p.words.filter((w) => w.y0 > 0.07 * p.H && w.y1 < 0.93 * p.H));
  const top = pages.at(-1)!, tall = [...pages[0].words].sort((a, b) => b.y1 - b.y0 - (a.y1 - a.y0))[0];
  return {
    size, fonts,
    left: Math.min(...body.map((w) => w.x0)), right: Math.max(...body.map((w) => w.x1)),
    body_size: mode(body.map((w) => Math.round((w.y1 - w.y0) * 2) / 2)), // word-box height: depends on the font, so only the title/body ratio is compared
    leading: leading(inner),
    header: norm(top.words.filter((w) => w.y0 <= 0.07 * top.H)), footer: norm(top.words.filter((w) => w.y1 >= 0.93 * top.H)),
    title: { size: +(tall.y1 - tall.y0).toFixed(1), y: +tall.y0.toFixed(1) },
  };
}
export type Fingerprint = ReturnType<typeof fingerprint>;

/** Booleans with fixed tolerances (never loosen to pass a row): margins 2 pt, leading 0.5 pt, title size 0.1 of the body word height and 5 pt position. Fonts: Nimbus Roman No9 L (LaTeX), Nimbus Roman and Liberation Serif are metric-compatible Times clones, compared as one family. */
export function compare(a: Fingerprint, r: Fingerprint) {
  const checks = {
    page_size: a.size === r.size,
    fonts: r.fonts.filter((f) => !/^CM|^\[/.test(f)).every((f) => a.fonts.includes(f)), // math fonts only appear if a paper has the symbols
    margins: Math.abs(a.left - r.left) <= 2 && Math.abs(a.right - r.right) <= 2,
    leading: Math.abs(a.leading - r.leading) <= 0.5,
    header_footer: a.header === r.header && a.footer === r.footer,
    title: Math.abs(a.title.size / a.body_size - r.title.size / r.body_size) <= 0.1 && Math.abs(a.title.y - r.title.y) <= 5,
  };
  return { checks, score: Object.values(checks).filter(Boolean).length / Object.keys(checks).length };
}

/** Every page as 8-bit grey at 50 dpi. */
export function pagesPx(pdf: string, cwd: string) {
  const base = pdf.replace(/\.pdf$/, ".px");
  run("pdftoppm", ["-gray", "-r", "50", pdf, base], cwd);
  return readdirSync(cwd).filter((f) => f.startsWith(base.split("/").pop()! + "-") && f.endsWith(".pgm")).sort().map((f) => {
    const b = readFileSync(`${cwd}/${f}`), [, w, h] = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(b.subarray(0, 40).toString("latin1"))!.map(Number);
    rmSync(`${cwd}/${f}`);
    return { w, h, px: b.subarray(b.length - w * h) };
  });
}
type Page = ReturnType<typeof pagesPx>[number];
/** Share of pixels that differ (by more than 64 of 255), per page; blank when the page sizes differ or a page is missing. The text differs too, so this is a layout signal only. */
export const pixelDiffs = (a: Page[], r: Page[]) => r.map((p, i) => {
  const q = a[i];
  if (!q || q.w !== p.w || q.h !== p.h) return "";
  let n = 0; for (let j = 0; j < q.px.length; j++) if (Math.abs(q.px[j] - p.px[j]) > 64) n++;
  return (n / q.px.length).toFixed(4);
});

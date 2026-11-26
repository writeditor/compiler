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

/** Font families of a PDF. The container's poppler (22.12) prints Chromium's Type 3 fonts as [none], so the /FontName entries in the file are read too. Nimbus Roman No9 L (LaTeX), Nimbus Roman and Liberation Serif are metric-compatible Times clones, compared as one family. */
const fontNames = (pdf: string, cwd: string) => {
  const raw = readFileSync(`${cwd}/${pdf}`).toString("latin1");
  return [...new Set([...run("pdffonts", [pdf], cwd).split("\n").slice(2).map((l) => l.split(/\s+/)[0]), ...[...raw.matchAll(/\/FontName\s*\/([^\s\/>\]]+)/g)].map((m) => m[1])]
    .filter((f) => f && f !== "[none]").map((f) => f.replace(/^[A-Z]{6}\+/, "").replace(/-.*/, "").replace(/^(NimbusRomNo9L|NimbusRoman|LiberationSerif|TimesNewRoman.*)$/, "Times")))].sort();
};

type Word = { x0: number; y0: number; x1: number; y1: number; t: string };
function readPages(pdf: string, cwd: string) {
  return run("pdftotext", ["-bbox", pdf, "-"], cwd).split("<page ").slice(1).map((p) => ({
    H: +/height="([\d.]+)"/.exec(p)![1],
    words: [...p.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)].map((m): Word => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5] })),
  }));
}

export function fingerprint(pdf: string, cwd: string) {
  const size = run("pdfinfo", [pdf], cwd).match(/Page size:\s*([\d.]+ x [\d.]+)/)![1];
  const fonts = fontNames(pdf, cwd);
  const pages = readPages(pdf, cwd);
  const inner = pages.length > 1 ? pages.slice(1) : pages; // page 1 carries the title block, so layout comes from the others
  const body = inner.flatMap((p) => p.words.filter((w) => w.y0 > 0.07 * p.H && w.y1 < 0.93 * p.H));
  const top = pages.at(-1)!, head = pages[0].words.filter((w) => w.y0 < 0.4 * pages[0].H);
  const tall = head.filter((w) => w.y1 - w.y0 >= 0.98 * Math.max(...head.map((x) => x.y1 - x.y0))).sort((a, b) => a.y0 - b.y0)[0]; // the first of the tallest words: the title's first line
  return {
    size, fonts,
    left: Math.min(...body.map((w) => w.x0)), right: mode(body.filter((w) => w.x1 > 0.75 * +size.split(" ")[0]).map((w) => Math.round(w.x1 * 2) / 2)), // the justified edge: an overfull line or a long URL sticks out and says nothing about the margin
    body_size: mode(body.map((w) => Math.round((w.y1 - w.y0) * 2) / 2)), // word-box height: depends on the font, so only the title/body ratio is compared
    leading: leading(inner),
    header: norm(top.words.filter((w) => w.y0 <= 0.07 * top.H)), footer: norm(top.words.filter((w) => w.y1 >= 0.93 * top.H)),
    title: (() => { const l = pages[0].words.filter((w) => Math.abs(w.y0 - tall.y0) < 1); return { width: +(Math.max(...l.map((w) => w.x1)) - Math.min(...l.map((w) => w.x0))).toFixed(1), y: +((tall.y0 + tall.y1) / 2).toFixed(1) }; })(), // first title line: its width tracks the font size, its centre the position; a word box's height does not (Libertinus Sans boxes differ between LaTeX and Chromium)
  };
}
export type Fingerprint = ReturnType<typeof fingerprint>;

/** Fonts (a = ours, r = reference): families the reference has and we lack, families we add, and whether every font is embedded (pdffonts column emb). */
export function fontDiff(pdf: string, cwd: string, a: Fingerprint, r: Fingerprint) {
  const emb = run("pdffonts", [pdf], cwd).split("\n").slice(2).filter(Boolean).every((l) => /\s+yes\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$/.test(l));
  const real = (f: string) => !/^CM|^\[/.test(f);
  return { embedded: emb, missing: r.fonts.filter((f) => real(f) && !a.fonts.includes(f)), extra: a.fonts.filter((f) => real(f) && !r.fonts.includes(f)) };
}

/** Booleans with fixed tolerances (never loosen to pass a row; the title is the tallest word in the top 40% of page 1 and the right margin the most common line end, because the page-foot icons and one overfull line made both measure something else): page size 1 pt, margins 2 pt, leading 0.5 pt, title width 2% and 5 pt centre. Fonts: Nimbus Roman No9 L (LaTeX), Nimbus Roman and Liberation Serif are metric-compatible Times clones, compared as one family. */
export function compare(a: Fingerprint, r: Fingerprint) {
  const checks = {
    page_size: a.size.split(" x ").every((v, i) => Math.abs(+v - +r.size.split(" x ")[i]) <= 1), // 1 pt: Chromium rounds the page to whole CSS px (210 x 276 mm gives 594.96 x 781.92, LaTeX 595.28 x 782.36)
    fonts: r.fonts.filter((f) => !/^CM|^\[/.test(f)).every((f) => a.fonts.includes(f)), // math fonts only appear if a paper has the symbols
    margins: Math.abs(a.left - r.left) <= 2 && Math.abs(a.right - r.right) <= 2,
    leading: Math.abs(a.leading - r.leading) <= 0.5,
    header_footer: a.header === r.header && a.footer === r.footer,
    title: Math.abs(a.title.width / r.title.width - 1) <= 0.02 && Math.abs(a.title.y - r.title.y) <= 5,
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
/** Share of pixels that differ (by more than 64 of 255), per page; blank when the page sizes differ by more than a pixel or a page is missing. The text differs too, so this is a layout signal only. */
export const pixelDiffs = (a: Page[], r: Page[]) => r.map((p, i) => {
  const q = a[i];
  if (!q || Math.abs(q.w - p.w) > 1 || Math.abs(q.h - p.h) > 1) return "";
  const w = Math.min(q.w, p.w), h = Math.min(q.h, p.h); // pages that differ by a rounding pixel are compared on the common area
  let n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(q.px[y * q.w + x] - p.px[y * p.w + x]) > 64) n++;
  return (n / (w * h)).toFixed(4);
});

/** Words (letters only) of a PDF in extraction order, with their page and whether each ends a line (next word is lower, or not to its right). */
export function readWords(pdf: string, cwd: string) {
  const ws = readPages(pdf, cwd).flatMap((p, page) => p.words.map((w) => ({ ...w, page, t: w.t.normalize("NFKC").toLowerCase().replace(/[^\p{L}]/gu, "") }))).filter((w) => w.t); // letters only: list bullets, footnote digits, math symbols and punctuation extract differently in LaTeX and Chromium PDFs without looking different
  return ws.map((w, i) => ({ ...w, h: w.y1 - w.y0, eol: !ws[i + 1] || ws[i + 1].page !== w.page || ws[i + 1].y0 - w.y0 > 3 || ws[i + 1].x0 < w.x1 }));
}
type W = ReturnType<typeof readWords>;
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? NaN;


/** Levenshtein distance, banded (Ukkonen): the band doubles until it holds the answer, so equal-ish texts cost O(n * distance), not O(n * m). */
export function lev(a: string, b: string): number {
  const n = a.length, m = b.length;
  if (!n || !m) return n + m;
  const INF = 1 << 28;
  for (let k = Math.max(32, Math.abs(n - m)); ; k *= 2) {
    let prev = new Int32Array(m + 1).fill(INF), cur = new Int32Array(m + 1).fill(INF);
    for (let j = 0; j <= Math.min(m, k); j++) prev[j] = j;
    for (let i = 1; i <= n; i++) {
      const lo = Math.max(0, i - k), hi = Math.min(m, i + k);
      if (lo > 0) cur[lo - 1] = INF;
      if (lo === 0) cur[0] = i;
      for (let j = Math.max(1, lo); j <= hi; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + +(a[i - 1] !== b[j - 1]));
      [prev, cur] = [cur, prev];
    }
    if (prev[m] <= k || k >= Math.max(n, m)) return prev[m];
  }
}

/** The text lines of a PDF as letter strings (a line is the words up to the next line end; spaces dropped, so letter-spaced listings equal plain ones). */
const textLines = (ws: W) => { const out: string[] = []; let cur = ""; for (const w of ws) { cur += w.t; if (w.eol) { out.push(cur); cur = ""; } } if (cur) out.push(cur); return out; };
const hist = (s: string) => { const h = new Uint16Array(64); for (let i = 0; i < s.length; i++) h[s.charCodeAt(i) & 63]++; return h; };

/**
 * Lines aligned by edit distance over the line sequences, then the leftovers paired in any order (cost of pairing two lines: how far their letter counts are, 0 to 1; a gap costs .5), so a line that moved, a column read in another order or a missing block does not shift every line after it.
 * lines_matched: share of reference lines that found a partner (cost < .4). line_cer: letters wrong over the reference's letters, counted inside matched lines, with unmatched reference lines wholly wrong and extra lines of ours as insertions.
 */
export function lineDiff(a: W, r: W) {
  const A = textLines(a), R = textLines(r), ha = A.map(hist), hr = R.map(hist), n = A.length, m = R.length, w = m + 1, G = .5, T = .4;
  const cost = (i: number, j: number) => { let d = 0; for (let k = 0; k < 64; k++) d += Math.abs(ha[i][k] - hr[j][k]); return d / ((A[i].length + R[j].length) || 1); };
  const d = new Float32Array((n + 1) * w);
  for (let j = 1; j <= m; j++) d[j] = j * G;
  for (let i = 1; i <= n; i++) { d[i * w] = i * G; for (let j = 1; j <= m; j++) d[i * w + j] = Math.min(d[(i - 1) * w + j - 1] + cost(i - 1, j - 1), d[(i - 1) * w + j] + G, d[i * w + j - 1] + G); }
  let wrong = 0, matched = 0, ours = new Set<number>(), refs = new Set<number>();
  for (let i = n, j = m; i > 0 && j > 0;) {
    const c = cost(i - 1, j - 1);
    if (Math.abs(d[i * w + j] - (d[(i - 1) * w + j - 1] + c)) < 1e-4) { if (c < T) { matched++; wrong += lev(A[i - 1], R[j - 1]); ours.add(i - 1); refs.add(j - 1); } i--; j--; }
    else if (Math.abs(d[i * w + j] - (d[(i - 1) * w + j] + G)) < 1e-4) i--;
    else j--;
  }
  for (let j = 0; j < m; j++) { // lines the ordered alignment dropped may only have moved (another column order, a float): pair them up in any order
    if (refs.has(j)) continue;
    let best = -1, bc = T;
    for (let i = 0; i < n; i++) if (!ours.has(i)) { const c = cost(i, j); if (c < bc) { bc = c; best = i; } }
    if (best >= 0) { matched++; wrong += lev(A[best], R[j]); ours.add(best); refs.add(j); }
  }
  wrong += R.reduce((s, x, j) => s + (refs.has(j) ? 0 : x.length), 0) + A.reduce((s, x, i) => s + (ours.has(i) ? 0 : x.length), 0);
  const total = R.reduce((s, x) => s + x.length, 0) || 1;
  return { lines_matched: +(matched / (m || 1)).toFixed(3), line_cer: +(wrong / total).toFixed(3) };
}

/**
 * Same content, so words can be aligned (edit distance over the word sequences) and compared one by one.
 * wer: edits / reference words. line_end_recall: of the reference's line ends on aligned words, the share that also end a line here (same line breaks).
 * page_agree: aligned words on the same page. dx/dy: |displacement| (pt) of aligned words on the same page, median and 95th percentile.
 */
export function layoutDiff(a: W, r: W) {
  const n = a.length, m = r.length, w = m + 1, d = new Uint16Array((n + 1) * w); // reference text is capped well below 65535 words
  for (let j = 0; j <= m; j++) d[j] = j;
  for (let i = 1; i <= n; i++) { d[i * w] = i; for (let j = 1; j <= m; j++) d[i * w + j] = Math.min(d[(i - 1) * w + j] + 1, d[i * w + j - 1] + 1, d[(i - 1) * w + j - 1] + +(a[i - 1].t !== r[j - 1].t)); }
  const pairs: [W[number], W[number]][] = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    if (i && j && d[i * w + j] === d[(i - 1) * w + j - 1] + +(a[i - 1].t !== r[j - 1].t)) { if (a[i - 1].t === r[j - 1].t) pairs.push([a[i - 1], r[j - 1]]); i--; j--; }
    else if (i && d[i * w + j] === d[(i - 1) * w + j] + 1) i--;
    else j--;
  }
  const same = pairs.filter(([x, y]) => x.page === y.page), ends = pairs.filter(([, y]) => y.eol), f = (x: number) => +x.toFixed(x < 10 ? 2 : 1);
  const dx = same.map(([x, y]) => Math.abs(x.x0 - y.x0)), dy = same.map(([x, y]) => Math.abs(x.y0 - y.y0));
  const ma = mode(a.map((x) => Math.round(x.h * 2) / 2)), mr = mode(r.map((x) => Math.round(x.h * 2) / 2)); // box height depends on the font's ascent/descent, so compare relative to each PDF's body height
  const sizeOk = same.filter(([x, y]) => Math.abs(x.h / ma - y.h / mr) <= 0.05).length;
  const box = (ws: W, p: number) => { const v = ws.filter((x) => x.page === p); return v.length ? [Math.min(...v.map((x) => x.x0)), Math.min(...v.map((x) => x.y0)), Math.max(...v.map((x) => x.x1)), Math.max(...v.map((x) => x.y1))] : null; };
  const ious = Array.from({ length: Math.max(a.at(-1)?.page ?? -1, r.at(-1)?.page ?? -1) + 1 }, (_, p) => { const u = box(a, p), v = box(r, p); if (!u || !v) return 0; const i = Math.max(0, Math.min(u[2], v[2]) - Math.max(u[0], v[0])) * Math.max(0, Math.min(u[3], v[3]) - Math.max(u[1], v[1])), A = (b: number[]) => (b[2] - b[0]) * (b[3] - b[1]); return i / (A(u) + A(v) - i); });
  return {
    size_agree: same.length ? f(sizeOk / same.length * 100) / 100 : NaN, text_box_iou: f(ious.reduce((x, y) => x + y, 0) / ious.length * 100) / 100,
    cer: +(lev(a.map((x) => x.t).join(""), r.map((x) => x.t).join("")) / (r.reduce((t, x) => t + x.t.length, 0) || 1)).toFixed(3), ...lineDiff(a, r), // cer: letters only, no word boundaries: unaffected by letter-spaced listings
    wer: f(d[n * w + m] / m * 100) / 100, line_end_recall: ends.length ? f(ends.filter(([x]) => x.eol).length / ends.length * 100) / 100 : NaN,
    page_agree: pairs.length ? f(same.length / pairs.length * 100) / 100 : NaN,
    dx_med: f(q(dx, .5)), dx_p95: f(q(dx, .95)), dy_med: f(q(dy, .5)), dy_p95: f(q(dy, .95)), words: [n, m] as [number, number],
  };
}

/** Mean SSIM per page (8x8 blocks, stride 4, on the 50 dpi grey pages); 0 for a missing page or a different page size. Shifts of 1 px (1.4 pt) already lower it, so read it with dx/dy. */
export const ssims = (a: Page[], r: Page[]) => r.map((p, i) => {
  const o = a[i];
  if (!o || Math.abs(o.w - p.w) > 1 || Math.abs(o.h - p.h) > 1) return 0;
  const w = Math.min(o.w, p.w), h = Math.min(o.h, p.h);
  const c1 = (0.01 * 255) ** 2, c2 = (0.03 * 255) ** 2; let sum = 0, k = 0;
  for (let y = 0; y + 8 <= h; y += 4) for (let x = 0; x + 8 <= w; x += 4) {
    let ma = 0, mb = 0, aa = 0, bb = 0, ab = 0;
    for (let j = 0; j < 8; j++) for (let i2 = 0; i2 < 8; i2++) { const u = o.px[(y + j) * o.w + x + i2], v = p.px[(y + j) * p.w + x + i2]; ma += u; mb += v; aa += u * u; bb += v * v; ab += u * v; }
    ma /= 64; mb /= 64; const va = aa / 64 - ma * ma, vb = bb / 64 - mb * mb, cv = ab / 64 - ma * mb;
    sum += ((2 * ma * mb + c1) * (2 * cv + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2)); k++;
  }
  return +(sum / k).toFixed(3);
});

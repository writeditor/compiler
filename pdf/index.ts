// RASH -> PDF: a style's CSS and markup, laid out by Paged.js in headless Chromium (puppeteer-core), printed to PDF.
// Separate from the LaTeX export on purpose: this one needs Chromium (CHROMIUM, default /usr/bin/chromium) and the dev dependencies pagedjs and katex.
import { existsSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import puppeteer from "puppeteer-core";
import { parseHTML } from "linkedom";
import katex from "katex";

const root = new URL("../", import.meta.url).pathname;

/** What a style supplies: the built stylesheet (@writeditor/styles dist/<id>.css, linked from the page, not copied into it) and, if it needs one, the markup function that wraps a RASH document in what that CSS expects. */
export type PdfStyle = { cssFile: string; markup?: (doc: Document, o: { math: (tex: string, display: boolean) => string }) => string };
const math = (tex: string, display: boolean) => katex.renderToString(tex, { throwOnError: false, displayMode: display });

// A style without markup of its own prints the paper as it is: the RASH body in a .paper-pdf box.
const box = (rash: string, { markup }: PdfStyle) => { const doc = parseHTML(rash).document; return markup ? markup(doc as unknown as Document, { math }) : `<div class="paper-pdf">${doc.body.innerHTML}</div>`; };

// Page floats. LaTeX puts a [t] float at the top of the page where it is called; Paged.js has no such float. A style asks for it with `figure { --page-float: top }`.
// Two passes: lay the paper out, note for each such figure the first block of the page it landed on, then load again with the figure moved there
// (a paragraph cut by the page break is cut in the source too, so the figure can go between the halves). The second layout is the PDF.
// shortcut: one correction, no check that the figure fits above the text or that its call stays on that page; a third pass would settle both.
type FloatPlan = { figs: number[]; top: number; offset: number }[];
const prepare = (plan: FloatPlan | null) => document.addEventListener("readystatechange", () => { // Paged.js starts on this event (interactive), before DOMContentLoaded; ours is registered first
  if (document.readyState !== "interactive") return;
  const box = document.querySelector(".paper-pdf");
  if (!box) return;
  let n = 0;
  box.querySelectorAll("*").forEach((e) => e.setAttribute("data-n", String(n++))); // Paged.js copies attributes to the pieces it cuts
  for (const { figs, top, offset } of plan ?? []) {
    let t = box.querySelector<HTMLElement>(`[data-n="${top}"]`);
    if (!t) continue;
    if (offset > 0) {
      const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
      let left = offset, node: Node | null;
      while ((node = walker.nextNode()) && left > (node.textContent ?? "").length) left -= (node.textContent ?? "").length;
      if (!node) continue;
      const range = document.createRange();
      range.setStart(node, Math.min(left, (node.textContent ?? "").length));
      range.setEndAfter(t.lastChild!);
      const rest = t.cloneNode(false) as HTMLElement;
      rest.setAttribute("data-n", `${top}c`);
      rest.style.textIndent = "0"; // the second half of a paragraph is not indented
      rest.append(range.extractContents());
      t.style.textAlignLast = "justify"; // and the first half's last line was a full line
      t.after(rest);
      t = rest;
    }
    figs.forEach((fig, i) => {
      const f = box.querySelector(`[data-n="${fig}"]`);
      if (!f) return;
      if (i === figs.length - 1) f.setAttribute("data-float-last", ""); // the style sets the space before the text apart from the space between floats (\textfloatsep, \floatsep)
      t!.before(f);
    });
  }
});
const floatPlan = () => {
  const pages = [...document.querySelectorAll(".pagedjs_page")], plan: FloatPlan = [];
  pages.forEach((pg, pi) => {
    const content = pg.querySelector(".pagedjs_page_content > div");
    const figs = [...(content?.querySelectorAll<HTMLElement>("figure[data-n]") ?? [])].filter((f) => getComputedStyle(f).getPropertyValue("--page-float").trim() === "top");
    let top = content?.querySelector<HTMLElement>("[data-n]") ?? null;
    while (top && top.tagName === "SECTION") top = [...top.children].find((c): c is HTMLElement => c.hasAttribute("data-n")) ?? null; // the page's first block, through the sections
    if (!top) return;
    const cut = top.hasAttribute("data-split-from"), n = top.dataset.n!;
    // how much of the cut block is on earlier pages: its text there is where the figure goes in the source
    const offset = cut ? pages.slice(0, pi).reduce((sum, q) => sum + [...q.querySelectorAll(`[data-n="${n}"]`)].reduce((a, e) => a + (e.textContent ?? "").length, 0), 0) : 0;
    const moved = figs.filter((f) => f !== top);
    if (moved.length) plan.push({ figs: moved.map((f) => +f.dataset.n!), top: +n, offset });
  });
  return plan;
};

/**
 * Prints `<name>.pdf` into `out` (a directory path ending in "/"). `base` is where the paper's relative image paths resolve.
 * Also writes `<name>.print.html` (absolute paths, what Chromium loads) and `<name>.view.html` (relative paths, for a browser: `make view`).
 */
export async function exportPdf(rash: string, style: PdfStyle, out: string, name: string, base: string) {
  if (!existsSync(style.cssFile)) throw new Error(`${style.cssFile} is missing: run \`pnpm build\` in the styles package`);
  const html = (to: (p: string) => string, view = false) => {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${name}</title>${view ? "" : `<base href="${to(base)}/">`}<link rel="stylesheet" href="${to(root + "node_modules/katex/dist/katex.min.css")}"><link rel="stylesheet" href="${to(style.cssFile)}"></head><body>${view ? box(rash, style).replace(/(<img\b[^>]*\ssrc=")(?![a-z]+:|\/)([^"]+)"/gi, (_, a, src) => `${a}${to(base)}/${src}"`) : box(rash, style)}<script>window.PagedConfig = { after: () => { window.__paged = true; } };</script><script src="${to(root + "node_modules/pagedjs/dist/paged.polyfill.js")}"></script></body></html>`;
  };
  // Paged.js reports when the last page is laid out (PagedConfig.after); printing before that gave 2 or 3 pages from one input.
  const page = `${out}${name}.print.html`;
  writeFileSync(page, html((p) => `file://${p}`));
  // For a browser: relative paths, and no <base> (it would also redirect the Paged.js script and the KaTeX fonts); images are pointed at explicitly.
  writeFileSync(`${out}${name}.view.html`, html((p) => relative(out, p), true));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu", "--allow-file-access-from-files"] });
  try {
    const laidOut = async (plan: FloatPlan | null) => {
      const q = await browser.newPage();
      await q.evaluateOnNewDocument(prepare, plan);
      await q.goto(`file://${page}`);
      await q.waitForFunction("window.__paged === true", { timeout: 60000 });
      return q;
    };
    let p = await laidOut(null);
    const plan = await p.evaluate(floatPlan);
    if (plan.length) { await p.close(); p = await laidOut(plan); }
    await p.pdf({ path: `${out}${name}.pdf`, preferCSSPageSize: true, printBackground: true });
  } finally { await browser.close(); }
}

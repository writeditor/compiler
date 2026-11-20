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
    const p = await browser.newPage();
    await p.goto(`file://${page}`);
    await p.waitForFunction("window.__paged === true", { timeout: 60000 });
    await p.pdf({ path: `${out}${name}.pdf`, preferCSSPageSize: true, printBackground: true });
  } finally { await browser.close(); }
}

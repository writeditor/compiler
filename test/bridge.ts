// Python tests call the compiler through this: JSON {html, template?, box?} on stdin (box: the arxiv PDF markup instead of LaTeX), JSON {tex} or {error} on stdout.
import { exportLaTeX } from "../src/index.ts";
import { MARKUP } from "@writeditor/styles";
import { parseHTML } from "linkedom";
import katex from "katex";

const { html, template, box } = JSON.parse(await new Promise<string>((ok) => { let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => ok(s)); }));
try { console.log(JSON.stringify({ tex: box ? MARKUP.arxiv!(parseHTML(html).document as unknown as Document, { math: (t, d) => katex.renderToString(t, { throwOnError: false, displayMode: d }) }) : await exportLaTeX(html, template ?? undefined) })); }
catch (e) { console.log(JSON.stringify({ error: (e as Error).constructor.name, message: (e as Error).message })); }

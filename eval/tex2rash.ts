// LaTeX sample -> RASH, so the compiler under test and the reference LaTeX start from the same content.
// Covers the article subset the official venue samples use (sections, lipsum, cite/ref, lists, figure, table, verbatim, quote, center, footnotes, .bib).
// What differs per class is data in the style's venue.json ("tex": see venues.ts), not code here: where the front matter sits, how authors are written, which \commands become writ:<id>.<field> meta.
// The ceurart form (\author[1]{Name}[email=..] with \address[1]{..}) is "authors": "bracket"; the body is shared.
// shortcut: no macros, no nested environments, \fbox{\rule..} figures become figure1.png; extend per venue sample when a new one needs it.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { venues } from "./venues.ts";

const typo = (s: string) => s.replace(/---/g, "\u2014").replace(/--/g, "\u2013").replace(/(\w)'(?=\w|\s|$)/g, "$1\u2019").replace(/``/g, "\u201c").replace(/''/g, "\u201d").replace(/`/g, "\u2018").replace(/'/g, "\u2019"); // TeX's ligatures
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s: string) => esc(s).replace(/"/g, "&quot;");
const id = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "-");
const group = (s: string, i: number) => { let d = 0; for (let j = i; j < s.length; j++) { if (s[j] === "\\") j++; else if (s[j] === "{") d++; else if (s[j] === "}" && --d === 0) return j; } throw new Error("unbalanced braces"); };
const arg = (s: string, cmd: string) => { const i = s.indexOf(`\\${cmd}{`); if (i < 0) return ""; const o = i + cmd.length + 1; return s.slice(o + 1, group(s, o)); };
const unwrap = (s: string) => { for (let p = ""; p !== s;) { p = s; s = s.replace(/\\(?:textit|underline|textbf|emph)\{([^{}]*)\}/g, "$1"); } return s.replace(/\s+/g, " ").trim(); };

export function texToRash(texPath: string, style: string): string {
  const src = readFileSync(texPath, "utf8").replace(/(^|[^\\])%.*$/gm, "$1");
  const [pre0, rest] = src.split("\\begin{document}");
  // "frontAfterBegin" (ceurart): \title, \author, \address... come after \begin{document}, before \maketitle: they are the head, read from there and taken out of the body.
  const cfg = venues[style]?.tex ?? {}, ceur = cfg.authors === "bracket", cut = rest.indexOf("\\maketitle");
  let front = cfg.frontAfterBegin && cut >= 0 ? rest.slice(0, cut) : "";
  const pre = pre0 + front;
  if (front) for (const cmd of cfg.frontCommands ?? ["title", "tnotetext", "address", "cortext", "fntext", "author", ...Object.values(cfg.fields ?? {})]) {
    for (let i = front.indexOf(`\\${cmd}`); i >= 0; i = front.indexOf(`\\${cmd}`, i)) {
      let j = i + cmd.length + 1;
      if (front[j] === "[") j = front.indexOf("]", j) + 1;
      if (front[j] !== "{") { i = j; continue; }
      j = group(front, j) + 1;
      if (cmd === "author" && front[j] === "[") j = front.indexOf("]", j) + 1;
      front = front.slice(0, i) + front.slice(j);
    }
  }
  front = front.replace(/\\(?:tnotemark|cormark|fnmark)\[[^\]]*\]/g, "");
  const lipsum = [...readFileSync(execFileSync("kpsewhich", ["lipsum.ltd.tex"], { encoding: "utf8" }).trim(), "utf8").matchAll(/\\NewLipsumPar\{%[^\n]*\n([\s\S]*?)\}%/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  const whole = front ? front + rest.slice(cut) : rest;
  let body = whole.slice(0, whole.lastIndexOf("\\end{document}")).replace(/^[ \t]*\\maketitle[ \t]*$/gm, "").replace(/\\begin\{math\}([\s\S]*?)\\end\{math\}/g, (_, m) => "$" + m.trim() + "$").replace(/^\\appendix\s*$(?![\s\S]*^\\appendix\s*$)/m, "\\appendixmark").replace(/^\\(?:cormark|fnmark)\[[^\]]*\]\s*$/gm, "");

  // ---- head ----
  const titleArg = arg(pre, "title"), thanks = arg(titleArg, "thanks");
  const title = unwrap(titleArg.replace(`\\thanks{${thanks}}`, ""));
  // ceurart: \author[affiliation numbers]{Name}[options] and \address[n]{text}
  const groups = ceur ? [] : arg(pre, "author").split(/\\And|\\AND/).map((g) => g.split("\\\\").map((l) => l.trim()).filter(Boolean));
  const head: string[] = [`<title>${esc(title)}</title>`];
  let n = 0;
  if (ceur) {
    const after = (i: number) => pre.slice(i, pre.indexOf("\\author", i) < 0 ? undefined : pre.indexOf("\\author", i)); // what follows an \author up to the next one: its marks
    for (const m of pre.matchAll(/\\author\[([^\]]*)\]\{([^}]*)\}(?:\[([\s\S]*?)\])?/g)) {
      n++;
      const tail = after(m.index! + m[0].length), marks = [/\\cormark\[/.test(tail.split("\\address")[0]) ? "*" : "", /\\fnmark\[/.test(tail.split("\\address")[0]) ? "\u2020" : ""].filter(Boolean);
      if (marks.length) head.push(`<meta about="#author_${n}" property="writ:${style}.marks" content="${marks.join(",")}"/>`);
      const email = /email=([^,\s\]]+)/.exec(m[3] ?? "")?.[1], orcid = /orcid=([^,\s\]]+)/.exec(m[3] ?? "")?.[1], url = /url=([^,\s\]]+)/.exec(m[3] ?? "")?.[1];
      head.push(`<meta about="#author_${n}" name="dc.creator" content="${attr(m[2].trim())}"/>`);
      if (email) head.push(`<meta about="#author_${n}" property="schema:email" content="${attr(email)}"/>`);
      if (orcid) head.push(`<link about="#author_${n}" property="schema:sameAs" href="https://orcid.org/${attr(orcid)}"/>`);
      if (url) head.push(`<link about="#author_${n}" property="schema:sameAs" href="${attr(url)}"/>`);
      for (const a of m[1].split(",")) head.push(`<link about="#author_${n}" property="schema:affiliation" href="#aff_${a.trim()}"/>`);
    }
    for (const m of pre.matchAll(/\\address\[(\d+)\]\{([^}]*)\}/g)) head.push(`<meta about="#aff_${m[1]}" typeof="schema:Organization" property="schema:name" content="${attr(typo(m[2].replace(/\s+/g, " ").trim()))}"/>`);
    for (const [prop, cmd] of Object.entries(cfg.fields ?? {})) { const v = arg(pre, cmd); if (v) head.push(`<meta property="writ:${style}.${prop}" content="${attr(typo(v.replace(/\s+/g, " ").trim()))}"/>`); }
    for (const [cmd, prop] of [["cortext", "cortext"], ["fntext", "fntext"]]) { const m = new RegExp(`\\\\${cmd}\\[\\d+\\]\\{([^}]*)\\}`).exec(pre); if (m) head.push(`<meta property="writ:${style}.${prop}" content="${attr(typo(m[1].trim()))}"/>`); }
  }
  groups.forEach((g, gi) => {
    const email = arg(g.find((l) => l.startsWith("\\texttt")) ?? "", "texttt").replace(/\\([{}])/g, "$1") || undefined; // the sample's line as printed, braces included
    const lines = g.slice(1).filter((l) => !l.startsWith("\\texttt"));
    for (const name of g[0].split(",").map((x) => x.trim()).filter(Boolean)) {
      n++;
      head.push(`<meta about="#author_${n}" name="dc.creator" content="${attr(name)}"/>`);
      if (email && name === g[0].split(",")[0].trim()) head.push(`<meta about="#author_${n}" property="schema:email" content="${attr(email)}"/>`);
      head.push(`<link about="#author_${n}" property="schema:affiliation" href="#aff_${gi + 1}"/>`);
    }
    head.push(`<meta about="#aff_${gi + 1}" typeof="schema:Organization" property="schema:name" content="${attr(lines.join("\n")).replace(/\n/g, "&#10;")}"/>`);
  });
  const kwEnv = /\\begin\{keywords\}([\s\S]*?)\\end\{keywords\}/.exec(body), kw = kwEnv ? kwEnv[1] : arg(body, "keywords");
  body = kwEnv ? body.replace(kwEnv[0], "") : body.replace(`\\keywords{${kw}}`, "");
  for (const k of kw.split(/\\and|\\sep/)) if (k.trim()) head.push(`<meta property="prism:keyword" content="${attr(k.trim().replace(/\s+/g, " "))}"/>`);
  head.push(`<meta property="writ:style" content="${style}"/>`);
  const tnote = arg(pre, "tnotetext") || arg(pre, "tnotetext[1]");
  if (thanks) head.push(`<meta property="writ:cite" content="${attr(unwrap(thanks))}"/>`);
  else if (ceur) { const t = /\\tnotetext\[\d+\]\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(pre)?.[1]; if (t) head.push(`<meta property="writ:cite" content="${attr(unwrap(t))}"/>`); }

  // ---- numbering and citation order, before any text is written ----
  const num = new Map<string, string>(), cited: string[] = [], c = [0, 0, 0], f = { figure: 0, table: 0 };
  let last = "";
  for (const m of body.matchAll(/\\(section|subsection|subsubsection)(\*?)\{|\\begin\{(figure|table)\*?\}|\\label\{([^}]*)\}|\\cite\{([^}]*)\}/g)) {
    if (m[1] && !m[2]) { const l = ["section", "subsection", "subsubsection"].indexOf(m[1]); c[l]++; c.fill(0, l + 1); last = c.slice(0, l + 1).join("."); }
    else if (m[3]) last = String(++f[m[3] as "figure" | "table"]);
    else if (m[4]) num.set(m[4], last);
    else if (m[5]) for (const k of m[5].split(",")) if (!cited.includes(k.trim())) cited.push(k.trim());
  }
  const notes: string[] = [];
  let eq = 0; // an equation environment is numbered, which RASH expresses with an id
  const txt = (s: string) => typo(esc(s));
  const inl = (s: string): string => {
    let out = "", at = 0;
    const re = new RegExp([
      String.raw`(?:(?<kind>Section|Figure|Table)[ ~])?\\ref\{(?<ref>[^}]*)\}`, String.raw`\\lipsum\[(?<lip>\d+)\]`, String.raw`\\cite\{(?<cite>[^}]*)\}`,
      String.raw`\\verb(?<vd>[^a-zA-Z*\s])(?<verb>.*?)\k<vd>`, String.raw`\\url\{(?<url>[^}]*)\}`, String.raw`\\href\{(?<href>[^}]*)\}\{(?<hrefText>(?:[^{}]|\{[^{}]*\})*)\}`,
      String.raw`\\footnote\{(?<fn>(?:[^{}]|\{[^{}]*\})*)\}`, String.raw`\\(?<fmt>textbf|textit|emph)\{(?<fmtText>[^{}]*)\}`, String.raw`\{\\(?<sw>itshape|em)\s+(?<swText>[^{}]*)\}`,
      String.raw`\\texttt\{(?<tt>(?:[^{}]|\{[^{}]*\})*)\}`, String.raw`\\\$(?<dollar>)`, String.raw`\$(?<math>[^$]*)\$`, String.raw`\\(?<logo>LaTeX|TeX)(?:\{\})?`, String.raw`\\(?<ch>dots|ldots|O|newline|sep)\b\s*`, String.raw`\\(?<sym>[&%_ ])`, "(?<tilde>~)",
    ].join("|"), "g");
    for (const m of s.matchAll(re)) {
      out += txt(s.slice(at, m.index)); at = m.index + m[0].length;
      const g = m.groups!;
      out += g.ref ? `<a href="#${id(g.ref)}">${g.kind ? g.kind + " " : ""}${num.get(g.ref) ?? "?"}</a>`
        : g.lip ? esc(lipsum[+g.lip - 1])
        : g.cite ? g.cite.split(",").map((k) => `<a href="#${id(k.trim())}">[${cited.indexOf(k.trim()) + 1}]</a>`).join(", ")
        : g.verb != null ? `<code>${esc(g.verb)}</code>`
        : g.url ? `<a href="${attr(g.url)}">${esc(g.url)}</a>`
        : g.href ? `<a href="${attr(g.href)}">${txt(g.hrefText)}</a>`
        : g.fn ? (notes.push(inl(g.fn)), `<a href="#fn-${notes.length}">${notes.length}</a>`)
        : g.fmt ? `<${g.fmt === "textbf" ? "strong" : "em"}>${esc(g.fmtText)}</${g.fmt === "textbf" ? "strong" : "em"}>`
        : g.sw ? `<em>${inl(g.swText)}</em>`
        : g.dollar != null ? "$"
        : g.tt != null ? `<code>${esc(g.tt.replace(/\{\\char'134\}/g, "\\").replace(/[{}]/g, ""))}</code>`
        : g.math != null ? `<span role="math">${esc(g.math)}</span>`
        : g.logo ? (g.logo === "LaTeX" ? '<span class="latex">L<sup>a</sup>T<sub>e</sub>X</span>' : '<span class="latex">T<sub>e</sub>X</span>') // the logo is markup, as the class prints it
        : g.ch ? ({ dots: "\u2026", ldots: "\u2026", O: "\u00d8", newline: "<br/>", sep: ", " } as Record<string, string>)[g.ch]
        : g.sym ? (g.sym === " " ? " " : g.sym) : " ";
    }
    return out + txt(s.slice(at));
  };
  const par = (s: string) => { const ni = /^\s*\\noindent\b/.test(s); return `<p${ni ? ' style="text-indent:0"' : ""}>${inl(s.replace(/^\s*\\noindent\b\s*/, "").replace(/\s+/g, " ").trim())}</p>`; }; // \noindent starts a paragraph that is not indented

  // ---- body ----
  const out: string[] = [];
  let open = 0;
  const close = (to: number) => { while (open > to) { out.push("</section>"); open--; } };
  const section = (level: number, h: string, idv: string, role = "") => { close(level - 1); out.push(`<section id="${id(idv)}"${role ? ` role="${role}"` : ""}><h1>${inl(h)}</h1>`); open++; };
  const caption = (s: string) => arg(s, "caption");
  const imgSrc = (n: string) => (existsSync(texPath.replace(/[^/]*$/, n)) ? n : [".png", ".jpg"].map((e) => n + e).find((f) => existsSync(texPath.replace(/[^/]*$/, f))) ?? n); // a PDF figure is shown by its PNG next to it
  // A list item may hold listings or verbatim blocks: text, <pre>, text.
  const item = (s: string) => s.split(/(\\begin\{(?:lstlisting|verbatim)\}[\s\S]*?\\end\{(?:lstlisting|verbatim)\})/).map((part) => {
    const m = /^\\begin\{(lstlisting|verbatim)\}([\s\S]*)\\end\{(?:lstlisting|verbatim)\}$/.exec(part);
    return m ? `<pre${m[1] === "lstlisting" ? ' class="lst"' : ""}>${esc(m[2].replace(/^\s*\n/, "").replace(/\s+$/, ""))}</pre>` : part.trim() ? par(part) : "";
  }).join("");
  const env = (name: string, s: string): string => {
    name = name.replace("*", "");
    const raw = s.replace(/^[ \t]*\n/, "").replace(/\s+$/, ""); // verbatim keeps its first line's indent
    s = s.trim();
    if (name === "equation") return `<div class="display_formula" id="${id(arg(s, "label") || `eq-${++eq}`)}"><span role="math">${esc(s.replace(/\\label\{[^}]*\}/, "").replace(/\s+/g, " ").trim())}</span></div>`;
    if (name === "itemize" || name === "enumerate") { const tag = name === "itemize" ? "ul" : "ol"; return `<${tag}>${s.split("\\item").slice(1).map((i) => `<li>${item(i)}</li>`).join("")}</${tag}>`; }
    if (name === "math" || name === "displaymath") return `<div class="display_formula"><span role="math">${esc(s.replace(/\s+/g, " ").trim())}</span></div>`;
    if (name === "verbatim" || name === "lstlisting") return `<pre${name === "lstlisting" ? ' class="lst"' : ""}>${esc(raw)}</pre>`; // a listing and a verbatim block get different space in some classes
    if (name === "quote") return `<blockquote>${par(s)}</blockquote>`;
    if (name === "center") return s.split(/\n\s*\n/).map((p) => par(p).replace("<p>", '<p style="text-align:center">')).join("");
    const lab = arg(s, "label"), cap = caption(s);
    if (name === "figure") return `<figure id="${id(lab)}"><p><img src="${imgSrc(/\\includegraphics(?:\[[^\]]*\])?\{([^}]*)\}/.exec(s)?.[1] ?? "figure1.png")}"${(() => { const w = /\\includegraphics\[[^\]]*width=([^,\]]*)/.exec(s)?.[1].trim() ?? "", f = /^([\d.]*)\\(?:line|text)width$/.exec(w), m = /^\\(?:line|text)width\s*-\s*([\d.]+pt)$/.exec(w); return f ? ` style="width:${+(f[1] || 1) * 100}%"` : m ? ` style="width:calc(100% - ${m[1]})"` : s.includes("\\fbox") ? ' style="width:50%"' : ""; })()} alt="${attr(cap)}"/></p><figcaption>${inl(cap)}</figcaption></figure>`;
    if (name === "table") {
      const rows = s.slice(s.indexOf("\\toprule") + 8, s.indexOf("\\bottomrule")).split("\\\\").map((r) => r.replace(/\\(?:cmidrule(?:\([a-z]\))?\{[^}]*\}|midrule)/g, (m) => (m === "\\midrule" ? "§" : "")).trim()).filter(Boolean);
      let head = true;
      const cols = [...(/\\begin\{tabular\}\{([^}]*)\}/.exec(s)?.[1] ?? "").replace(/[^lcr]/g, "")]; // the column spec, as alignments
      const align = (i: number) => (cols[i] === "c" ? ' style="text-align:center"' : cols[i] === "r" ? ' style="text-align:right"' : "");
      const trs = rows.map((r) => { if (r.includes("§")) head = false; const cells = r.replace("§", "").split("&").map((x) => x.trim()), th = head; return `<tr>${cells.map((x, ci) => { const sp = /^\\multicolumn\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}$/.exec(x), tag = th ? "th" : "td"; return `<${tag}${sp ? ` colspan="${sp[1]}"` : align(ci)}>${inl(sp ? sp[2] : x)}</${tag}>`; }).join("")}</tr>`; });
      return `<figure id="${id(lab)}"><table>${trs.join("")}</table><figcaption>${inl(cap)}</figcaption></figure>`;
    }
    throw new Error(`unsupported environment: ${name}`);
  };
  // The references go where \bibliography is (a class may put them before an appendix): a placeholder now, the section below.
  let inApp = false;
  const text = (s: string) => { for (const p of s.split(/\n\s*\n/)) { if (/^\s*\\appendixmark\b/.test(p)) { close(0); inApp = true; } else if (/^\\bibliography\{/m.test(p)) { close(0); out.push("@@BIB@@"); } else if (p.trim() && !/^\\bibliographystyle\b/.test(p.trim())) out.push(par(p)); } };
  let at = 0, pending = "";
  const re = /\\begin\{(\w+\*?)\}([\s\S]*?)\\end\{\1\}|\\(section|subsection|subsubsection|paragraph)(\*?)\{([^}]*)\}|\\verb([^a-zA-Z*\s]).*?\6/g; // the last alternative only steps over \verb|...| so a \begin inside it is not an environment
  const flush = (s: string) => { const m = /^\s*\\label\{([^}]*)\}/.exec(s); if (m && pending) { out[out.length - 1] = out.at(-1)!.replace(/id="[^"]*"/, `id="${id(m[1])}"`); s = s.slice(m[0].length); } pending = ""; text(s); };
  for (const m of body.matchAll(re)) {
    if (m[0].startsWith("\\verb")) continue;
    const before = body.slice(at, m.index);
    flush(before); at = m.index + m[0].length;
    if (m[1] === "abstract") { close(0); out.push(`<section role="doc-abstract"><h1>Abstract</h1>${m[2].split(/\n\s*\n/).filter((p) => p.trim()).map(par).join("")}</section>`); }
    else if (m[1] === "acknowledgments") { close(0); out.push(`<section role="doc-acknowledgements"><h1>Acknowledgments</h1>${m[2].split(/\n\s*\n/).filter((p) => p.trim()).map(par).join("")}</section>`); }
    else if (m[1]) out.push(env(m[1], m[2]).replace(/^<(ul|ol)>/, (_, t) => (!/\n\s*\n\s*$/.test(before) ? `<${t} class="tight">` : `<${t}>`))); // a list straight after text (no blank line) gets less space in LaTeX: no \partopsep
    else { const lvl = ["section", "subsection", "subsubsection", "paragraph"].indexOf(m[3]) + 1, ack = m[4] && /^acknowledg/i.test(m[5]); section(lvl, m[5], m[4] ? m[5].toLowerCase() : `sec-${m[5].toLowerCase()}`, ack ? "doc-acknowledgements" : inApp ? "doc-appendix" : ""); pending = m[5]; }
  }
  flush(body.slice(at)); close(0);
  if (notes.length) out.push(`<section role="doc-endnotes"><h1>Notes</h1><ol>${notes.map((t, i) => `<li id="fn-${i + 1}" role="doc-endnote"><p>${t}</p></li>`).join("")}</ol></section>`);

  // ---- bibliography from the .bib next to the sample ----
  const bib = texPath.replace(/[^/]*$/, `${[...body.matchAll(/^\\bibliography\{([^}]*)\}/gm)].at(-1)?.[1] ?? ""}.bib`); // the last one: a verbatim example earlier in the text may show a \bibliography too
  if (cited.length && existsSync(bib)) {
    const entries = new Map<string, Record<string, string>>();
    for (const m of readFileSync(bib, "utf8").matchAll(/@(\w+)\{([^,]+),([\s\S]*?)\n\}/g)) entries.set(m[2], Object.fromEntries([["type", m[1]], ...[...m[3].matchAll(/(\w+)=\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((x) => [x[1], x[2]])]));
    // BibTeX `unsrt` look: "First Last, ... and First Last. Sentence-case title. In <em>Venue</em>, pages a-b. Org, year."
    const who = (a: string) => { const ns = a.split(" and ").map((p) => { const [l, f = ""] = p.split(",").map((x) => x.trim()); return `${f} ${l}`.trim(); }); return ns.length < 3 ? ns.join(" and ") : `${ns.slice(0, -1).join(", ")}, and ${ns.at(-1)}`; };
    const lower = (t: string) => t.toLowerCase().replace(/^./, (c) => c.toUpperCase()).replace(/(: )(.)/g, (_, a, c) => a + c.toUpperCase());
    // The reference build's .bbl holds each entry as the class's bibliography style printed it: take that text (as an import from LaTeX does), not our guess of it.
    const bbl = new Map<string, string>();
    try {
      for (const x of readFileSync(new URL(`./out/${style}/ref/${texPath.replace(/^.*\/|\.tex$/g, "")}.${style}.ref.bbl`, import.meta.url), "utf8").replace(/^%.*$/gm, "").split("\\bibitem").slice(1)) {
        const m = /^\[\{[\s\S]*?\}\]\{([^}]*)\}([\s\S]*)$/.exec(x);
        if (!m) continue;
        let t = m[2].replace(/\\end\{thebibliography\}[\s\S]*$/, "").replace(/\{(\\(?:La)?TeX)\}/g, "$1");
        for (let n = 0; n < 3; n++) t = t.replace(/\\bibinfo\{[^}]*\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, "$1");
        t = t.replace(/\\newblock/g, "\u2005").replace(/(?<![A-Za-z}])\{([^{}\\]*)\}/g, "$1").replace(/\\DOIprefix\s*\\doi\{([^}]*)\}/g, "doi:\\href{https://doi.org/$1}{$1}").replace(/\\URLprefix\s*\\url/g, "URL: \\url").replace(/\\emph\{((?:[^{}]|\{[^{}]*\})*)\}/g, "{\\em $1}").replace(/~(?![^{}]*\})/g, " ");
        bbl.set(m[1], t.replace(/\s+/g, " ").trim());
      }
    } catch { /* no reference build yet: the guess below */ }
    const li = cited.map((k) => {
      if (bbl.has(k)) return `<li id="${id(k)}" role="doc-biblioentry"><p>${inl(bbl.get(k)!)}</p></li>`;
      const e = entries.get(k) ?? {}, pages = e.pages ? `, pages ${e.pages.replace("--", "–")}` : "";
      const venue = e.booktitle ? `In <em>${esc(e.booktitle)}</em>${pages}. ${e.organization ? esc(e.organization) + ", " : ""}${e.year}.` : `<em>${esc(e.journal ?? "")}</em>${pages}, ${e.year}.`;
      return `<li id="${id(k)}" role="doc-biblioentry"><p>${esc(who(e.author ?? ""))}. ${esc(lower(e.title ?? ""))}. ${venue}</p></li>`;
    });
    const refs = `<section role="doc-bibliography"><h1>References</h1><ul>${li.join("")}</ul></section>`, at = out.indexOf("@@BIB@@");
    if (at < 0) out.push(refs); else out[at] = refs;
  }
  const bibAt = out.indexOf("@@BIB@@");
  if (bibAt >= 0) out.splice(bibAt, 1); // \bibliography with nothing cited
  return `<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" prefix="schema: http://schema.org/ prism: http://prismstandard.org/namespaces/basic/2.0/ writ: urn:writ:">\n<head>\n<meta charset="UTF-8"/>\n${head.join("\n")}\n</head>\n<body>\n${out.join("\n")}\n</body>\n</html>\n`;
}

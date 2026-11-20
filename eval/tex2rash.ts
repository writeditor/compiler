// LaTeX sample -> RASH, so the compiler under test and the reference LaTeX start from the same content.
// Covers the article subset the official venue samples use (sections, lipsum, cite/ref, lists, figure, table, verbatim, quote, center, footnotes, .bib).
// shortcut: no macros, no nested environments, \fbox{\rule..} figures become figure1.png; extend per venue sample when a new one needs it.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s: string) => esc(s).replace(/"/g, "&quot;");
const id = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "-");
const group = (s: string, i: number) => { let d = 0; for (let j = i; j < s.length; j++) { if (s[j] === "\\") j++; else if (s[j] === "{") d++; else if (s[j] === "}" && --d === 0) return j; } throw new Error("unbalanced braces"); };
const arg = (s: string, cmd: string) => { const i = s.indexOf(`\\${cmd}{`); if (i < 0) return ""; const o = i + cmd.length + 1; return s.slice(o + 1, group(s, o)); };
const unwrap = (s: string) => { for (let p = ""; p !== s;) { p = s; s = s.replace(/\\(?:textit|underline|textbf|emph)\{([^{}]*)\}/g, "$1"); } return s.replace(/\s+/g, " ").trim(); };

export function texToRash(texPath: string, style: string): string {
  const src = readFileSync(texPath, "utf8").replace(/(^|[^\\])%.*$/gm, "$1");
  const [pre, rest] = src.split("\\begin{document}");
  const lipsum = [...readFileSync(execFileSync("kpsewhich", ["lipsum.ltd.tex"], { encoding: "utf8" }).trim(), "utf8").matchAll(/\\NewLipsumPar\{%[^\n]*\n([\s\S]*?)\}%/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  let body = rest.slice(0, rest.lastIndexOf("\\end{document}")).replace("\\maketitle", "");

  // ---- head ----
  const titleArg = arg(pre, "title"), thanks = arg(titleArg, "thanks");
  const title = unwrap(titleArg.replace(`\\thanks{${thanks}}`, ""));
  const groups = arg(pre, "author").split(/\\And|\\AND/).map((g) => g.split("\\\\").map((l) => l.trim()).filter(Boolean));
  const head: string[] = [`<title>${esc(title)}</title>`];
  let n = 0;
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
  const kw = arg(body, "keywords");
  body = body.replace(`\\keywords{${kw}}`, "");
  for (const k of kw.split("\\and")) if (k.trim()) head.push(`<meta property="prism:keyword" content="${attr(k.trim())}"/>`);
  head.push(`<meta property="writ:style" content="${style}"/>`);
  if (thanks) head.push(`<meta property="writ:cite" content="${attr(unwrap(thanks))}"/>`);

  // ---- numbering and citation order, before any text is written ----
  const num = new Map<string, string>(), cited: string[] = [], c = [0, 0, 0], f = { figure: 0, table: 0 };
  let last = "";
  for (const m of body.matchAll(/\\(section|subsection|subsubsection)(\*?)\{|\\begin\{(figure|table)\}|\\label\{([^}]*)\}|\\cite\{([^}]*)\}/g)) {
    if (m[1] && !m[2]) { const l = ["section", "subsection", "subsubsection"].indexOf(m[1]); c[l]++; c.fill(0, l + 1); last = c.slice(0, l + 1).join("."); }
    else if (m[3]) last = String(++f[m[3] as "figure" | "table"]);
    else if (m[4]) num.set(m[4], last);
    else if (m[5]) for (const k of m[5].split(",")) if (!cited.includes(k.trim())) cited.push(k.trim());
  }
  const notes: string[] = [];
  let eq = 0; // an equation environment is numbered, which RASH expresses with an id
  const inl = (s: string): string => {
    let out = "", at = 0;
    const re = /(?:(Section|Figure|Table)[ ~])?\\ref\{([^}]*)\}|\\lipsum\[(\d+)\]|\\cite\{([^}]*)\}|\\verb\+([^+]*)\+|\\url\{([^}]*)\}|\\footnote\{((?:[^{}]|\{[^{}]*\})*)\}|\\(textbf|textit|emph)\{([^{}]*)\}|\$([^$]*)\$|\\dots|\\&|\\%|\\_|\\ |~/g;
    for (const m of s.matchAll(re)) {
      out += esc(s.slice(at, m.index)); at = m.index + m[0].length;
      const t = m[0];
      out += m[2] ? `<a href="#${id(m[2])}">${m[1] ? m[1] + " " : ""}${num.get(m[2]) ?? "?"}</a>`
        : m[3] ? esc(lipsum[+m[3] - 1])
        : m[4] ? m[4].split(",").map((k) => `<a href="#${id(k.trim())}">[${cited.indexOf(k.trim()) + 1}]</a>`).join(", ")
        : m[5] != null ? `<code>${esc(m[5])}</code>`
        : m[6] ? `<a href="${attr(m[6])}">${esc(m[6])}</a>`
        : m[7] ? (notes.push(inl(m[7])), `<a href="#fn-${notes.length}">${notes.length}</a>`)
        : m[8] ? `<${m[8] === "textbf" ? "strong" : "em"}>${esc(m[9])}</${m[8] === "textbf" ? "strong" : "em"}>`
        : m[10] != null ? `<span role="math">${esc(m[10])}</span>`
        : t === "\\dots" ? "…" : t === "~" || t === "\\ " ? " " : esc(t.slice(1));
    }
    return out + esc(s.slice(at));
  };
  const par = (s: string) => `<p>${inl(s.replace(/\s+/g, " ").trim())}</p>`;

  // ---- body ----
  const out: string[] = [];
  let open = 0;
  const close = (to: number) => { while (open > to) { out.push("</section>"); open--; } };
  const section = (level: number, h: string, idv: string, role = "") => { close(level - 1); out.push(`<section id="${id(idv)}"${role ? ` role="${role}"` : ""}><h1>${inl(h)}</h1>`); open++; };
  const caption = (s: string) => arg(s, "caption");
  const env = (name: string, s: string): string => {
    s = s.trim();
    if (name === "equation") return `<div class="display_formula" id="${id(arg(s, "label") || `eq-${++eq}`)}"><span role="math">${esc(s.replace(/\\label\{[^}]*\}/, "").replace(/\s+/g, " ").trim())}</span></div>`;
    if (name === "itemize") return `<ul>${s.split("\\item").slice(1).map((i) => `<li>${par(i)}</li>`).join("")}</ul>`;
    if (name === "verbatim") return `<pre>${esc(s)}</pre>`;
    if (name === "quote") return `<blockquote>${par(s)}</blockquote>`;
    if (name === "center") return s.split(/\n\s*\n/).map((p) => par(p).replace("<p>", '<p style="text-align:center">')).join("");
    const lab = arg(s, "label"), cap = caption(s);
    if (name === "figure") return `<figure id="${id(lab)}"><p><img src="${/\\includegraphics(?:\[[^\]]*\])?\{([^}]*)\}/.exec(s)?.[1] ?? "figure1.png"}"${s.includes("\\fbox") ? ' style="width:50%"' : ""} alt="${attr(cap)}"/></p><figcaption>${inl(cap)}</figcaption></figure>`;
    if (name === "table") {
      const rows = s.slice(s.indexOf("\\toprule") + 8, s.indexOf("\\bottomrule")).split("\\\\").map((r) => r.replace(/\\(?:cmidrule(?:\([a-z]\))?\{[^}]*\}|midrule)/g, (m) => (m === "\\midrule" ? "§" : "")).trim()).filter(Boolean);
      let head = true;
      const trs = rows.map((r) => { if (r.includes("§")) head = false; const cells = r.replace("§", "").split("&").map((x) => x.trim()), th = head; return `<tr>${cells.map((x) => { const sp = /^\\multicolumn\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}$/.exec(x), tag = th ? "th" : "td"; return `<${tag}${sp ? ` colspan="${sp[1]}"` : ""}>${inl(sp ? sp[2] : x)}</${tag}>`; }).join("")}</tr>`; });
      return `<figure id="${id(lab)}"><table>${trs.join("")}</table><figcaption>${inl(cap)}</figcaption></figure>`;
    }
    throw new Error(`unsupported environment: ${name}`);
  };
  const text = (s: string) => { for (const p of s.split(/\n\s*\n/)) if (p.trim() && !/^\\(bibliographystyle|bibliography)\b/.test(p.trim())) out.push(par(p)); };
  let at = 0, pending = "";
  const re = /\\begin\{(\w+)\}([\s\S]*?)\\end\{\1\}|\\(section|subsection|subsubsection|paragraph)(\*?)\{([^}]*)\}/g;
  const flush = (s: string) => { const m = /^\s*\\label\{([^}]*)\}/.exec(s); if (m && pending) { out[out.length - 1] = out.at(-1)!.replace(/id="[^"]*"/, `id="${id(m[1])}"`); s = s.slice(m[0].length); } pending = ""; text(s); };
  for (const m of body.matchAll(re)) {
    flush(body.slice(at, m.index)); at = m.index + m[0].length;
    if (m[1] === "abstract") { close(0); out.push(`<section role="doc-abstract"><h1>Abstract</h1>${m[2].split(/\n\s*\n/).filter((p) => p.trim()).map(par).join("")}</section>`); }
    else if (m[1]) out.push(env(m[1], m[2]));
    else { const lvl = ["section", "subsection", "subsubsection", "paragraph"].indexOf(m[3]) + 1, ack = m[4] && /^acknowledg/i.test(m[5]); section(lvl, m[5], m[4] ? m[5].toLowerCase() : `sec-${m[5].toLowerCase()}`, ack ? "doc-acknowledgements" : ""); pending = m[5]; }
  }
  flush(body.slice(at)); close(0);
  if (notes.length) out.push(`<section role="doc-endnotes"><h1>Notes</h1><ol>${notes.map((t, i) => `<li id="fn-${i + 1}" role="doc-endnote"><p>${t}</p></li>`).join("")}</ol></section>`);

  // ---- bibliography from the .bib next to the sample ----
  const bib = texPath.replace(/[^/]*$/, `${arg(body, "bibliography")}.bib`);
  if (cited.length && existsSync(bib)) {
    const entries = new Map<string, Record<string, string>>();
    for (const m of readFileSync(bib, "utf8").matchAll(/@(\w+)\{([^,]+),([\s\S]*?)\n\}/g)) entries.set(m[2], Object.fromEntries([["type", m[1]], ...[...m[3].matchAll(/(\w+)=\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((x) => [x[1], x[2]])]));
    // BibTeX `unsrt` look: "First Last, ... and First Last. Sentence-case title. In <em>Venue</em>, pages a-b. Org, year."
    const who = (a: string) => { const ns = a.split(" and ").map((p) => { const [l, f = ""] = p.split(",").map((x) => x.trim()); return `${f} ${l}`.trim(); }); return ns.length < 3 ? ns.join(" and ") : `${ns.slice(0, -1).join(", ")}, and ${ns.at(-1)}`; };
    const lower = (t: string) => t.toLowerCase().replace(/^./, (c) => c.toUpperCase()).replace(/(: )(.)/g, (_, a, c) => a + c.toUpperCase());
    const li = cited.map((k) => {
      const e = entries.get(k) ?? {}, pages = e.pages ? `, pages ${e.pages.replace("--", "–")}` : "";
      const venue = e.booktitle ? `In <em>${esc(e.booktitle)}</em>${pages}. ${e.organization ? esc(e.organization) + ", " : ""}${e.year}.` : `<em>${esc(e.journal ?? "")}</em>${pages}, ${e.year}.`;
      return `<li id="${id(k)}" role="doc-biblioentry"><p>${esc(who(e.author ?? ""))}. ${esc(lower(e.title ?? ""))}. ${venue}</p></li>`;
    });
    out.push(`<section role="doc-bibliography"><h1>References</h1><ul>${li.join("")}</ul></section>`);
  }
  return `<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" prefix="schema: http://schema.org/ prism: http://prismstandard.org/namespaces/basic/2.0/ writ: urn:writ:">\n<head>\n<meta charset="UTF-8"/>\n${head.join("\n")}\n</head>\n<body>\n${out.join("\n")}\n</body>\n</html>\n`;
}

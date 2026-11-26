// arXiv HTML (LaTeXML) -> RASH, and the paper's references as data.
//   node eval/html2rash.ts [id ...]     every folder of eval/corpus/arxiv/ (or the given ids): writes <folder>/rash.html, eval/corpus-arxiv-references.json and prints one row per paper
// Same RASH as eval/tex2rash.ts writes (head metas, doc-abstract, nested <section><h1>, <span role="math"> with the TeX, doc-bibliography, doc-endnotes), so the compiler and the styles take it unchanged.
// Reads LaTeXML's classes (ltx_*); a paper whose conversion failed in arXiv's own build (ltx_ERROR, no title, no bibliography) is flagged, not repaired.
// A figure is content then caption (<table|img|pre> then <figcaption>): Writ's schema is `(image | table | code_block) figcaption`, and a caption first is read as a code block, i.e. a listing.
// shortcut: no theorem/algorithm environments (their paragraphs are kept, their titles dropped), tikz/picture drawings are dropped and counted; extend when a paper in the corpus needs it.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseHTML } from "linkedom";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s: string) => esc(s).replace(/"/g, "&quot;");
const rid0 = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "-").replace(/^[^A-Za-z_]/, "x$&"); // an xsd:ID starts with a letter
const ws = (s: string) => s.replace(/[​­]/g, "").replace(/\s+/g, " ").trim();
type El = any;
const has = (n: El, c: string) => n.nodeType === 1 && n.classList?.contains(c);
const kids = (n: El): El[] => [...n.childNodes];
const tag = (n: El) => (n.nodeType === 1 ? n.tagName.toLowerCase() : "");

// A figure LaTeXML drew itself (TikZ, inline SVG) has no image file: a placeholder keeps it a figure (RASH counts a figure with a <pre> as a listing, and one with nothing in it as neither).
const PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export type Ref = { key: string; label: string; text: string; doi?: string; url?: string };

export function htmlToRash(html: string, opts: { merge?: (srcs: string[], key: string) => string } = {}) {
  const used = new Set<string>(), rid = (s: string) => { let k = rid0(s), i = 1; while (used.has(k) && !s.startsWith("bib") && !/^fn-/.test(s)) k = `${rid0(s)}-${++i}`; used.add(k); return k; }; // ids are unique in RASH (an href to an id is made with rid0)
  const { document } = parseHTML(html);
  const flags: string[] = [], notes: string[] = [], acks: string[] = [], missing = new Set<string>();
  let pictures = 0, math = 0, figures = 0, tables = 0, sections = 0;

  // ---- inline ----
  const inl = (n: El): string => {
    if (n.nodeType === 3) return esc(n.textContent.replace(/[​­]/g, "").replace(/\s+/g, " "));
    if (n.nodeType !== 1) return "";
    const t = tag(n), c = (k: string) => has(n, k);
    if (c("ltx_ERROR") || c("ltx_tag") || c("ltx_note_mark") || c("ltx_rdf") || c("ltx_nodisplay") || t === "script" || t === "style") return "";
    if (t === "math") { math++; return `<span role="math">${esc(n.getAttribute("alttext") ?? "")}</span>`; }
    if (c("ltx_note")) { // a footnote: a call here, the text in the endnotes
      if (c("ltx_note_frontmatter")) return "";
      const body = n.querySelector(".ltx_note_content"); if (!body) return "";
      const k = notes.length + 1; notes.push(kids(body).filter((x) => !has(x, "ltx_note_mark") && !has(x, "ltx_note_type")).map(inl).join("").trim());
      return `<a href="#fn-${k}">${k}</a>`;
    }
    if (c("ltx_missing_citation")) { missing.add(ws(n.textContent)); return esc(ws(n.textContent)); }
    if (t === "a") {
      const h = n.getAttribute("href") ?? "", inner = kids(n).map(inl).join("");
      return h.startsWith("#") ? `<a href="#${rid0(h.slice(1))}">${inner}</a>` : /^(https?:|mailto:)/.test(h) ? `<a href="${attr(h)}">${inner}</a>` : inner;
    }
    if (t === "img") return n.getAttribute("src") ? `<img src="${attr(n.getAttribute("src"))}" alt="${attr(n.getAttribute("alt") === "Refer to caption" ? "" : n.getAttribute("alt") ?? "")}"/>` : "";
    if (t === "object" && /\.svg$/.test(n.getAttribute("data") ?? "")) return `<img src="${attr(n.getAttribute("data"))}.png" alt=""/>`; // arXiv draws many figures as external SVG; fetch_arxiv_html.py rasterises them next to the file
    if (t === "br") return " ";
    if (c("ltx_picture") || c("ltx_tikzmatrix") || t === "svg") { pictures++; return ""; }
    const inner = kids(n).map(inl).join("");
    if (!inner.trim()) return inner;
    if (t === "em" || t === "i" || c("ltx_emph") || c("ltx_font_italic")) return `<em>${inner}</em>`;
    if (t === "strong" || t === "b" || c("ltx_font_bold")) return `<strong>${inner}</strong>`;
    if (t === "code" || c("ltx_font_typewriter")) return `<code>${inner}</code>`;
    if (t === "sup" || c("ltx_sup")) return `<sup>${inner}</sup>`;
    if (t === "sub" || c("ltx_sub")) return `<sub>${inner}</sub>`;
    return inner;
  };
  const text = (n: El) => ws(kids(n).filter((x) => !has(x, "ltx_note") && !has(x, "ltx_tag")).map((x) => x.textContent).join(""));

  // ---- blocks ----
  const table = (t: El) => {
    const rows = [...t.querySelectorAll("tr")].map((tr: El) => `<tr>${kids(tr).filter((c) => /^t[dh]$/.test(tag(c))).map((c) => {
      const a = ["colspan", "rowspan"].filter((k) => +(c.getAttribute(k) ?? 1) > 1).map((k) => ` ${k}="${c.getAttribute(k)}"`).join(""), inner = kids(c).map(inl).join("").trim();
      return tag(c) === "th" ? `<th${a}>${inner}</th>` : `<td${a}><p>${inner}</p></td>`; // RASH: td holds blocks, th inline, and neither takes style or align
    }).join("")}</tr>`).filter((r) => r !== "<tr></tr>");
    return `<table>${rows.join("") || "<tr><td><p></p></td></tr>"}</table>`;
  };
  const caption = (f: El) => { const c = f.querySelector("figcaption"); return `<figcaption>${c ? kids(c).map(inl).join("").trim() : ""}</figcaption>`; }; // RASH figures always end with a caption (it may be empty)
  const consumed = new WeakSet<object>();
  const block = (n: El): string => {
    if (consumed.has(n)) return "";
    if (n.nodeType === 3) return ws(n.textContent) ? `<p>${inl(n)}</p>` : "";
    if (n.nodeType !== 1) return "";
    const t = tag(n), c = (k: string) => has(n, k);
    if (c("ltx_ERROR") || c("ltx_rdf") || c("ltx_nodisplay") || t === "script" || t === "style") return "";
    if (c("ltx_picture") || c("ltx_tikzmatrix") || t === "svg") { pictures++; return ""; }
    if (c("ltx_equation") || c("ltx_equationgroup") || c("ltx_eqn_table")) {
      const ms = [...n.querySelectorAll("math")].map((m: El) => m.getAttribute("alttext") ?? "").filter(Boolean); math += ms.length;
      return ms.length ? `<figure id="${rid(n.getAttribute("id") ?? `eq-${math}`)}"><p><span role="math">${esc(ms.length > 1 ? `\\begin{aligned} ${ms.join(" \\\\ ")} \\end{aligned}` : ms[0])}</span></p></figure>` : ""; // RASH formula box: figure > p > span[role=math], no caption
    }
    if (c("ltx_itemize") || c("ltx_enumerate") || c("ltx_description") || t === "ul" || t === "ol") {
      const li = kids(n).filter((x) => tag(x) === "li").map((x) => `<li>${kids(x).filter((y) => !has(y, "ltx_tag")).map(block).join("") || `<p>${inl(x)}</p>`}</li>`);
      return li.length ? `<${c("ltx_enumerate") || t === "ol" ? "ol" : "ul"}>${li.join("")}</${c("ltx_enumerate") || t === "ol" ? "ol" : "ul"}>` : "";
    }
    if (t === "dl") { const out: string[] = []; for (const x of kids(n)) { if (tag(x) === "dt") out.push(`<li><p><strong>${kids(x).map(inl).join("").trim()}</strong></p>`); else if (tag(x) === "dd") out.push(`${kids(x).map(block).join("")}</li>`); } return `<ul>${out.join("")}</ul>`; }
    if (t === "figure" && (c("ltx_table") || n.querySelector(":scope > table.ltx_tabular, :scope > .ltx_inline-block > table.ltx_tabular"))) {
      tables++;
      let tb = n.querySelector("table.ltx_tabular"); // LaTeXML sometimes closes the figure after its caption and puts the table in the next block (seen with \captionof and p-columns): take that one
      const nxt = n.nextElementSibling;
      if (!tb && nxt && !consumed.has(nxt) && (tb = nxt.querySelector("table.ltx_tabular"))) consumed.add(nxt);
      if (!tb) return `<p>${kids(n.querySelector("figcaption") ?? n).map(inl).join("").trim()}</p>`; // no table anywhere: a caption alone would be read as a listing
      return `<figure id="${rid(n.getAttribute("id") ?? `tab-${tables}`)}">${tb ? table(tb) : ""}${caption(n)}</figure>`; }
    if (t === "figure") {
      figures++;
      const panels = [...n.querySelectorAll("img, object")].map((i: El) => i.getAttribute("src") ?? (/\.svg$/.test(i.getAttribute("data") ?? "") ? `${i.getAttribute("data")}.png` : "")).filter(Boolean);
      // RASH: a figure holds one image. Panels are stacked into one picture when the caller can (opts.merge), else the first stands for them.
      // shortcut: LaTeXML's width is in px with \linewidth = 476 (the article class it lays out with); a class with another text width gets a slightly wrong share.
      const px = panels.length === 1 ? +(n.querySelector("img")?.getAttribute("width") ?? 0) : 0, pct = Math.min(100, Math.round(px / 4.76));
      const imgs = panels.length ? `<p><img src="${attr(panels.length > 1 && opts.merge ? opts.merge(panels, n.getAttribute("id") ?? `fig-${figures}`) : panels[0])}"${pct >= 20 ? ` style="width:${pct}%"` : ""} alt=""/></p>` : "";
      if (panels.length > 1 && !opts.merge) flags.push(`panels-dropped:${panels.length - 1}`);
      if (!imgs && n.querySelector("table.ltx_tabular")) { tables++; return `<figure id="${rid(n.getAttribute("id") ?? `tab-${tables}`)}">${table(n.querySelector("table.ltx_tabular"))}${caption(n)}</figure>`; } // a figure holding a table
      if (!imgs && n.querySelector(".ltx_listing, .ltx_verbatim")) return `<figure id="${rid(n.getAttribute("id") ?? `lst-${figures}`)}">${block(n.querySelector(".ltx_listing, .ltx_verbatim"))}${caption(n)}</figure>`; // a listing: code, then caption
      if (n.querySelector("svg, .ltx_picture, .ltx_tikzmatrix")) pictures++;
      return `<figure id="${rid(n.getAttribute("id") ?? `fig-${figures}`)}">${imgs || `<p><img src="${PLACEHOLDER}" alt="(drawing not converted)"/></p>`}${caption(n)}</figure>`;
    }
    if (t === "table") return `<figure id="${rid(n.getAttribute("id") ?? `tab-${++tables}`)}">${table(n)}<figcaption></figcaption></figure>`; // RASH has no table outside a figure
    if (c("ltx_listing") || c("ltx_verbatim") || t === "pre") return `<pre><code>${esc([...n.querySelectorAll(".ltx_listingline")].map((l: El) => l.textContent.replace(/​/g, "")).join("\n") || n.textContent.trim())}</code></pre>`;
    if (t === "blockquote" || c("ltx_quote")) return `<blockquote>${kids(n).map(block).join("") || `<p>${inl(n)}</p>`}</blockquote>`;
    if (t === "p") { const h = kids(n).map(inl).join("").trim(); return h ? `<p>${h}</p>` : ""; }
    if (/^h[1-6]$/.test(t) || c("ltx_title") || c("ltx_tag") || t === "nav") return "";
    if (c("ltx_acknowledgements")) { acks.push(section(n)); return ""; } // LaTeXML nests them in the last section; RASH has them after all the sections
    if (t === "section" || c("ltx_section") || c("ltx_subsection") || c("ltx_subsubsection") || c("ltx_paragraph") || c("ltx_appendix") || c("ltx_acknowledgements")) return section(n);
    if (!kids(n).some((x) => x.nodeType === 1 && /^(div|p|ul|ol|table|figure|section|blockquote|pre|dl)$/.test(tag(x)))) { const h = kids(n).map(inl).join("").trim(); return h ? `<p>${h}</p>` : ""; }
    return kids(n).map(block).join("");
  };
  const section = (n: El): string => {
    const head = kids(n).find((x) => /^h[1-6]$/.test(tag(x)) && has(x, "ltx_title")), title = head ? ws(kids(head).map(inl).join("").replace(/<[^>]+>/g, "")) : "";
    const role = has(n, "ltx_acknowledgements") ? ` role="doc-acknowledgements"` : has(n, "ltx_appendix") ? ` role="doc-appendix"` : ""; // as tex2rash: an appendix is lettered (\appendix in LaTeX)
    sections++;
    const h = (head ? kids(head).map(inl).join("").trim() : "") || esc(title || (has(n, "ltx_acknowledgements") ? "Acknowledgments" : "Untitled"));
    return `<section id="${rid(n.getAttribute("id") ?? `sec-${sections}`)}"${role}><h1>${h}</h1>${kids(n).filter((x) => x !== head).map(block).join("") || "<p></p>"}</section>`; // RASH: a section is a heading and at least one block
  };

  // ---- head: title, authors, keywords ----
  const root = document.querySelector("article.ltx_document") ?? document.body;
  const titleEl = root.querySelector("h1.ltx_title_document"), title = titleEl ? text(titleEl) : "";
  if (!title || title === "Untitled Document") flags.push("no-title");
  const head: string[] = [`<title>${esc(title)}</title>`], affs: string[] = [];
  // No \author block: the byline is centred paragraphs right after the title (name(s), affiliation, date) and a "Keywords:" paragraph. Read them, and take them out of the body.
  const logical = root.querySelector(".ltx_creator") ? null : root.querySelector(".ltx_logical-block");
  const loose = logical ? [...logical.querySelectorAll("p")].map(text).filter(Boolean) : [];
  const kwPara = [...kids(root)].find((x) => /^\s*(Key ?words|Index Terms)\s*[:.]/i.test(x.textContent ?? ""));
  loose.slice(0, 1).flatMap((l) => l.split(/\s*(?:,|;|\band\b|&)\s*/)).map((n) => n.replace(/[\d*†‡§¶]+$/g, "").trim()).filter(Boolean).forEach((name, i, all) => {
    head.push(`<meta about="#author_${i + 1}" name="dc.creator" content="${attr(name)}"/>`);
    for (const a of loose.slice(1).filter((l) => !/^\d{1,2}\s+\w+\s+\d{4}$|^\w+\s+\d{1,2},?\s+\d{4}$|^\d{4}-\d\d-\d\d$/.test(l))) {
      if (!affs.includes(a)) affs.push(a);
      head.push(`<link about="#author_${i + 1}" property="schema:affiliation" href="#aff_${affs.indexOf(a) + 1}"/>`);
    }
  });
  [...root.querySelectorAll(".ltx_authors .ltx_creator.ltx_role_author")].forEach((a: El, i: number) => {
    const n = i + 1, name = text(a.querySelector(".ltx_personname") ?? a);
    head.push(`<meta about="#author_${n}" name="dc.creator" content="${attr(name)}"/>`);
    for (const m of a.querySelectorAll(".ltx_contact.ltx_role_email")) head.push(`<meta about="#author_${n}" property="schema:email" content="${attr(ws(m.textContent.replace(/^Email:\s*/, "")))}"/>`);
    for (const o of a.querySelectorAll('a[href*="orcid.org"]')) head.push(`<link about="#author_${n}" property="schema:sameAs" href="${attr(o.getAttribute("href"))}"/>`);
    for (const m of a.querySelectorAll(".ltx_contact.ltx_role_affiliation")) {
      const t = ws(kids(m).filter((x) => !has(x, "ltx_contact_name")).map((x) => x.textContent).join("")); if (!t) continue;
      if (!affs.includes(t)) affs.push(t);
      head.push(`<link about="#author_${n}" property="schema:affiliation" href="#aff_${affs.indexOf(t) + 1}"/>`);
    }
  });
  affs.forEach((a, i) => head.push(`<meta about="#aff_${i + 1}" typeof="schema:Organization" property="schema:name" content="${attr(a)}"/>`));
  const kw = root.querySelector(".ltx_keywords") ?? kwPara;
  for (const k of kw ? ws(kw.textContent.replace(/^\s*(Key ?words|Index Terms)\s*[:.]?/i, "")).split(/[;,·]/) : []) if (k.trim()) head.push(`<meta property="prism:keyword" content="${attr(k.trim())}"/>`);

  // ---- body ----
  let bibAt = -1; // where the bibliography sat among the sections: appendices after it stay after it
  const secs: string[] = [], strays: string[] = [], abs = root.querySelector(".ltx_abstract");
  const abstract = abs ? `<section role="doc-abstract"><h1>Abstract</h1>${kids(abs).filter((x) => !has(x, "ltx_title")).map(block).join("") || "<p></p>"}</section>` : "";
  for (const x of kids(root)) {
    if (has(x, "ltx_bibliography")) { bibAt = secs.length; continue; }
    if (has(x, "ltx_note") || has(x, "ltx_abstract") || has(x, "ltx_authors") || has(x, "ltx_keywords") || has(x, "ltx_dates") || has(x, "ltx_title_document") || has(x, "ltx_classification") || has(x, "ltx_pubnotes") || x === logical || x === kwPara) continue;
    if (has(x, "ltx_acknowledgements")) acks.push(section(x));
    else if (tag(x) === "section" || /ltx_(sub)*section|ltx_appendix|ltx_paragraph/.test(x.className ?? "")) secs.push(section(x));
    else strays.push(block(x));
  }
  // RASH's body is: abstract, sections, acknowledgements, references, appendices, notes. Text before the first section has to be in a section.
  if (strays.join("").trim() && bibAt >= 0) bibAt++;
  if (bibAt < 0) bibAt = Infinity;
  if (strays.join("").trim()) secs.unshift(`<section id="${rid("front")}"><h1>${esc(title ? "Summary" : "Untitled")}</h1>${strays.join("")}</section>`);
  if (!secs.length) { secs.push(`<section id="${rid("empty")}"><h1>Untitled</h1><p></p></section>`); bibAt = 1; }
  const out: string[] = [abstract, ...secs.slice(0, bibAt), ...acks].filter(Boolean), after = secs.slice(bibAt);

  // ---- references: the bibliography as LaTeXML printed it ----
  const refs: Ref[] = [...root.querySelectorAll("li.ltx_bibitem")].map((li: El) => {
    const label = ws(li.querySelector(".ltx_tag")?.textContent ?? ""), body = kids(li).filter((x) => has(x, "ltx_bibblock") && !has(x, "ltx_bib_cited")), plain = ws(body.map((b) => b.textContent).join(" "));
    const url = [...li.querySelectorAll("a[href^=http]")].map((a: El) => a.getAttribute("href")).find((h: string) => h) as string | undefined;
    return { key: li.getAttribute("id") ?? "", label, text: plain, doi: /\b10\.\d{4,9}\/[^\s"<>]+/.exec(url ?? plain)?.[0].replace(/[.,;)]+$/, ""), url, _html: body.map((b) => kids(b).map(inl).join("").trim()).join(" ") } as Ref;
  });
  if (refs.length) out.push(`<section role="doc-bibliography"><h1>References</h1><ul>${refs.map((r: any) => `<li id="${rid(r.key)}" role="doc-biblioentry"><p>${r._html}</p></li>`).join("")}</ul></section>`);
  else if (missing.size) flags.push("references-not-in-html");
  out.push(...after);
  refs.forEach((r: any) => delete r._html);
  if (notes.length) out.push(`<section role="doc-endnotes">${notes.map((t, i) => `<section role="doc-endnote" id="fn-${i + 1}"><p>${t}</p></section>`).join("")}</section>`);

  const errors = root.querySelectorAll(".ltx_ERROR").length;
  if (errors) flags.push(`latexml-errors:${errors}`);
  if (pictures) flags.push(`drawings-dropped:${pictures}`);
  if (!sections) flags.push("no-sections");
  const rash = `<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" prefix="schema: http://schema.org/ prism: http://prismstandard.org/namespaces/basic/2.0/ writ: urn:writ:">\n<head>\n<meta charset="UTF-8"/>\n${head.join("\n")}\n</head>\n<body>\n${out.join("\n")}\n</body>\n</html>\n`;
  return { rash, refs, flags, missingCitations: [...missing], stats: { words: ws(rash.replace(/<[^>]+>/g, " ")).split(" ").length, sections, figures, tables, math, notes: notes.length, refs: refs.length } };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const dir = new URL("./corpus/arxiv/", import.meta.url).pathname, ids = process.argv.length > 2 ? process.argv.slice(2) : readdirSync(dir).filter((d) => existsSync(`${dir}${d}/index.html`)).sort();
  const manifestFile = new URL("./corpus-arxiv-references.json", import.meta.url).pathname;
  const manifest: Record<string, unknown> = process.argv.length > 2 && existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
  console.log("id          words  sec fig tab math note refs  flags");
  for (const id of ids) {
    const merge = (srcs: string[], key: string) => { // stack the panels of a figure into one picture, next to the paper's files
      const files = srcs.map((u) => `${dir}${id}/${u}`);
      if (!files.every((f) => existsSync(f))) return srcs[0];
      const out = `merged-${key.replace(/[^\w-]/g, "-")}.png`;
      execFileSync("convert", [...files.map((f) => `${f}[0]`), "-background", "white", "-gravity", "center", "-append", `${dir}${id}/${out}`]);
      return out;
    };
    const r = htmlToRash(readFileSync(`${dir}${id}/index.html`, "utf8"), { merge }), s = r.stats;
    writeFileSync(`${dir}${id}/rash.html`, r.rash);
    manifest[id] = { references: r.refs, missing_citation_keys: r.missingCitations, flags: r.flags };
    console.log(`${id}  ${String(s.words).padStart(5)}  ${String(s.sections).padStart(3)} ${String(s.figures).padStart(3)} ${String(s.tables).padStart(3)} ${String(s.math).padStart(4)} ${String(s.notes).padStart(4)} ${String(s.refs).padStart(4)}  ${r.flags.join(" ")}`);
  }
  writeFileSync(manifestFile, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 1) + "\n");
}

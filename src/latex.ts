// RASH HTML -> LaTeX. Input is a RASH document as a string (the same file the editor stores); no editor or schema is involved.
// The head (title, authors, keywords) is read from the RASH metadata; the body is walked as plain DOM.
import { parseHTML } from "linkedom";

const LATEX_SPECIAL: Record<string, string> = { "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "$": "\\$", "&": "\\&", "#": "\\#", "%": "\\%", "_": "\\_", "^": "\\^{}", "~": "\\~{}" };
// Arguments of \\href/\\includegraphics/\\label/\\cite: drop anything that could close the argument or start a command.
const texId = (s: string) => String(s).replace(/[^\w:.-]/g, "");
// shortcut: embedded data: images are not decoded to files, so they become a visible placeholder; write them out when the exporter can return files.
const graphic = (img: Element | null | undefined) => { const src = img?.getAttribute("src") ?? ""; return src.startsWith("data:") ? "\\fbox{[embedded image omitted]}" : `\\includegraphics[width=${img ? imgWidth(img) : ""}\\linewidth]{${texPath(src)}}`; };
const texPath = (s: string) => String(s).replace(/[\\{}%#$&^~]/g, "");
const texUrl = (s: string) => String(s).replace(/[\\{}]/g, "").replace(/[%#]/g, "\\$&");
// A verbatim body must not close its own environment.
const verb = (s: string) => s.replace(/\\end\{verbatim\}/g, "\\end{verbatim }");
// Math is raw LaTeX by design, so strip the commands that read or write files, define macros or hide others behind ^^ escapes.
// shortcut: a deny-list, not a parser; the real guard is compiling with -no-shell-escape and openin_any=p.
const mathTex = (s: string) => s.replace(/\\(input|include|includeonly|import|subimport|write|immediate|openin|openout|read|readline|newwrite|newread|catcode|def|edef|gdef|xdef|let|futurelet|csname|expandafter|scantokens|usepackage|documentclass|verbatiminput|lstinputlisting|href|url|includegraphics|special|pdfliteral|directlua)(?![a-zA-Z])/g, "").replace(/\^\^/g, "");
export const tex = (s: string) => s.replace(/[\\{}$&#%_^~]/g, (c) => LATEX_SPECIAL[c]);
const LEVELS = ["section", "subsection", "subsubsection", "paragraph"];

// Preambles for each paper template. amsart puts the abstract before \maketitle; arxiv needs arxiv.sty
// (from the Overleaf "arXiv template") next to the .tex file.
export const TEMPLATES = {
  rash: { name: "RASH", preamble: "\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{graphicx}\n\\usepackage{hyperref}", and: " \\and ", abstractFirst: false },
  amsart: { name: "AMS article", abstractFirst: true, preamble: `\\documentclass[10pt,leqno]{amsart}
\\usepackage{graphicx}
\\usepackage{indentfirst,csquotes}
\\topmargin= .5cm
\\textheight= 20cm
\\textwidth= 32cc
\\baselineskip=16pt
\\evensidemargin= .9cm
\\oddsidemargin= .9cm
\\usepackage{amssymb,amsthm,amsmath}
\\usepackage{xcolor,paralist,hyperref,titlesec,fancyhdr,etoolbox}
\\newtheorem{theorem}{Theorem}[]
\\newtheorem{definition}[theorem]{Definition}
\\newtheorem{example}[theorem]{Example}
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}
\\newtheorem{conjecture}[theorem]{Conjecture}
\\hypersetup{ colorlinks=true, linkcolor=black, filecolor=black, urlcolor=black }
\\date{\\today}` },
  arxiv: { name: "arXiv preprint", and: " \\And ", abstractFirst: false, preamble: `\\documentclass{article}
\\usepackage{PRIMEarxiv}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{hyperref}
\\usepackage{url}
\\usepackage{booktabs}
\\usepackage{amsfonts}
\\usepackage{nicefrac}
\\usepackage{microtype}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage[numbers]{natbib}
\\date{}` },
} as const;
export type Template = keyof typeof TEMPLATES;

// Only these URL schemes may reach LaTeX; drops javascript:/data: links.
const safeHref = (h: string) => /^(https?:|mailto:|#)/i.test(h.trim());
// A figure's image width: a whole percentage between 20 and 100, from style="width:N%".
const imgWidth = (i: Element) => { const w = /(?:^|;)\s*width:\s*(\d{2,3})%/.exec(i.getAttribute("style") ?? "")?.[1]; return w && /^(?:[2-9]\d|100)$/.test(w) ? +w / 100 : ""; };
const SUBTITLE = " -- "; // RASH puts the subtitle in <title>, after this separator
const collapse = (s: string) => s.replace(/\s+/g, " ");
const tagOf = (n: Node) => (n.nodeType === 1 ? (n as Element).localName.toLowerCase() : "");
const kids = (e: Element) => [...e.children];

type Author = { name: string; email: string; affiliations: string[]; affIds: string; corresponding: boolean };

/** What a venue's class needs beyond the built-in templates. */
export type Options = {
  /** natbib author-year: \citep or \citet by the link's own text, and `\bibitem[Name(year)]` labels built from the entry's CSL. */
  natbib?: boolean;
  /** Cambridge class conventions: statement sections (acknowledgements, funding...) and what follows go inside `Backmatter`, plain-language-summary is unnumbered, floats use \\FIG and \\TBL. */
  cup?: boolean;
  /** `\copbreak` ends page 1 before the section that comes after this many sections (document order, nested ones count). */
  copbreak?: number;
};
const UNNUMBERED = new Set(["plain-language-summary"]);
const STATEMENTS = new Set(["supplementary-material", "acknowledgments", "acknowledgements", "ethical-standard", "author-contribution", "funding", "competing-interests", "data-availability"]);
// natbib label: "Family", "A and B" or "A et al." plus "(year)", from CSL-JSON.
const bibLabel = (c: any) => {
  const fam = (Array.isArray(c?.author) ? c.author : []).map((a: any) => String(a.family ?? a.literal ?? "")).filter(Boolean);
  const year = c?.issued?.["date-parts"]?.[0]?.[0];
  return !fam.length || !year ? "" : `${fam.length > 2 ? `${fam[0]} et al.` : fam.join(" and ")}(${year})`;
};

export function toLaTeX(html: string, template: Template = "rash", opts: Options = {}): string {
  const dom = parseHTML(html).document as unknown as Document;
  const T = TEMPLATES[template];
  const bibIds = new Set<string>();
  const keys = new Map<string, string>(); // entry id -> CSL citation-key, when it has one
  const notes = new Map<string, Element>(); // footnotes: doc-endnote items, inlined as \footnote where linked
  const csl = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const m of dom.querySelectorAll('meta[property="writ:csl"]')) {
    try {
      const c = JSON.parse(m.getAttribute("content") ?? ""), at = (m.getAttribute("about") ?? "").replace(/^#/, "");
      if (c?.["citation-key"] && texId(String(c["citation-key"]))) csl.set(at, texId(String(c["citation-key"])));
      labels.set(at, bibLabel(c));
    } catch {}
  }
  for (const li of dom.querySelectorAll("li[id]")) {
    const id = li.getAttribute("id")!, role = li.getAttribute("role");
    if (role === "doc-biblioentry") { bibIds.add(id); if (csl.has(id)) keys.set(id, csl.get(id)!); }
    if (role === "doc-endnote") notes.set(id, li);
  }

  // The words LaTeX and BibTeX get their logos, except in code.
  const latexWord = (s: string, n: Node) => n.parentElement?.closest("code,pre") ? s : s.replace(/\bLaTeX\b/g, "\\LaTeX{}").replace(/\bBibTeX\b/g, "Bib\\TeX{}");
  const inline = (e: Element): string => [...e.childNodes].map((n) => n.nodeType === 3 ? latexWord(tex(collapse(n.textContent ?? "")), n) : n.nodeType === 1 ? inlineEl(n as Element) : "").join("");
  const inlineEl = (e: Element): string => {
    switch (tagOf(e)) {
      case "br": return "\\\\\n";
      case "script": case "style": case "template": return "";
      case "code": return `\\texttt{${inline(e)}}`;
      case "u": return `\\underline{${inline(e)}}`;
      case "em": case "i": return `\\emph{${inline(e)}}`;
      case "strong": case "b": return `\\textbf{${inline(e)}}`;
      case "sup": return `\\textsuperscript{${inline(e)}}`;
      case "sub": return `\\textsubscript{${inline(e)}}`;
      case "span": return e.getAttribute("role") === "math" ? `$${mathTex(collapse(e.textContent ?? ""))}$` : inline(e);
      case "a": {
        const href = e.getAttribute("href") ?? "", t = inline(e);
        if (!safeHref(href)) return t;
        // shortcut: \footnote inside a caption or heading needs \protect; not handled.
        if (href.startsWith("#") && notes.has(href.slice(1))) return `\\footnote{${blocks(notes.get(href.slice(1))!, 0).trim()}}`;
        if (href.startsWith("#") && bibIds.has(href.slice(1))) {
          const key = keys.get(href.slice(1)) ?? texId(href.slice(1));
          return `\\${!opts.natbib ? "cite" : /^[(\[]/.test(e.textContent ?? "") ? "citep" : "citet"}{${key}}`;
        }
        if (href.startsWith("#")) { const m = /^([A-Za-z]+)\s+\S+$/.exec(t); return `${m ? `${m[1]}~` : ""}\\ref{${texId(href.slice(1))}}`; }
        return t === tex(href) && !/[%#]/.test(href) ? `\\url{${texUrl(href)}}` : `\\href{${texUrl(href)}}{${t}}`;
      }
      default: return inline(e);
    }
  };

  const blocks = (e: Element, depth: number) => kids(e).map((c) => block(c, depth)).join("");
  const lead = (li: Element) => { const p = li.firstElementChild; return p && tagOf(p) === "p" ? p : li; };
  const block = (e: Element, depth: number): string => {
    switch (tagOf(e)) {
      case "p": {
        if (e.getAttribute("role") === "math") return display(e);
        const t = inline(e).trim();
        return /(?:^|;)\s*text-align:\s*center/.test(e.getAttribute("style") ?? "") ? `\\begin{center}\n${t}\n\\end{center}\n\n` : t + "\n\n";
      }
      case "div": return e.classList.contains("display_formula") ? display(e) : "";
      case "blockquote": return `\\begin{quote}\n${blocks(e, depth)}\\end{quote}\n\n`;
      case "pre": return `\\begin{verbatim}\n${verb(e.textContent ?? "")}\n\\end{verbatim}\n\n`;
      case "ul": case "ol": {
        const env = tagOf(e) === "ul" ? "itemize" : "enumerate";
        return `\\begin{${env}}\n${kids(e).filter((li) => tagOf(li) === "li").map((li) => `  \\item ${blocks(li, depth).trim()}\n`).join("")}\\end{${env}}\n\n`;
      }
      case "hr": return "\\noindent\\rule{\\linewidth}{0.4pt}\n\n";
      case "figure": return figure(e);
      case "section": return section(e, depth);
      default: return "";
    }
  };
  // A formula with an id is numbered and can be referenced.
  const display = (e: Element) => {
    const f = mathTex((e.textContent ?? "").replace(/^\s*(\\\[|\$\$)|(\\\]|\$\$)\s*$/g, "")).trim(), id = texId(e.getAttribute("id") ?? "");
    return id ? `\\begin{equation}\n\\label{${id}}\n${f}\n\\end{equation}\n\n` : `\\[\n${f}\n\\]\n\n`;
  };

  const figure = (e: Element): string => {
    const label = e.getAttribute("id") ? `\\label{${texId(e.getAttribute("id")!)}}` : "";
    const part = (t: string) => kids(e).find((c) => tagOf(c) === t);
    const cap = `\\caption{${inline(part("figcaption") ?? e.ownerDocument.createElement("figcaption")).trim()}}${label}`;
    const pre = part("pre"), table = part("table");
    if (pre) return `\\begin{figure}\n\\begin{verbatim}\n${verb(pre.textContent ?? "")}\n\\end{verbatim}\n${cap}\n\\end{figure}\n\n`;
    if (table && opts.cup) {
      const rows = [...table.querySelectorAll("tr")].map((r) => kids(r).filter((c) => /^t[dh]$/.test(tagOf(c))));
      const line = (r: Element[]) => r.map((c) => inline(c).trim()).join(" & ") + " \\\\\n";
      const [head, ...rest] = rows;
      return `\\begin{table}[hbt!]\n\\TBL{${cap}}{\\begin{fntable}\\tabcolsep=2pt\n\\begin{tabular}{${"l".repeat(Math.max(1, ...rows.map((r) => r.length)))}}\n\\toprule\n${head ? line(head) : ""}\\midrule\n${rest.map(line).join("")}\\botrule\n\\end{tabular}\n\\end{fntable}}\n\\end{table}\n\n`;
    }
    if (table) {
      const rows = [...table.querySelectorAll("tr")].map((r) => kids(r).filter((c) => /^t[dh]$/.test(tagOf(c))));
      const span = (c: Element) => Math.max(1, Math.floor(Number(c.getAttribute("colspan"))) || 1);
      const cols = Math.max(1, ...rows.map((r) => r.reduce((n, c) => n + span(c), 0)));
      const bt = T.preamble.includes("booktabs"); // booktabs templates: three-rule tables, plain header cells, \cmidrule under spanning headers
      const cell = (c: Element) => { const t = inline(c).trim(), x = tagOf(c) === "th" && !bt ? `\\textbf{${t}}` : t; return span(c) > 1 ? `\\multicolumn{${span(c)}}{c}{${x}}` : x; };
      const firstBody = rows.findIndex((r) => !r.every((c) => tagOf(c) === "th")), nh = firstBody < 0 ? rows.length : firstBody;
      const rules = (r: Element[], i: number) => { let at = 1, o = ""; if (bt && i < nh) { for (const c of r) { if (span(c) > 1) o += `\\cmidrule(r){${at}-${at + span(c) - 1}}\n`; at += span(c); } if (i === nh - 1) o += "\\midrule\n"; } return o; };
      const body = rows.map((r, i) => r.map(cell).join(" & ") + " \\\\\n" + rules(r, i)).join("");
      return `\\begin{table}\n\\centering\n${cap}\n\\begin{tabular}{${"l".repeat(cols)}}\n${bt ? "\\toprule" : "\\hline"}\n${body}${bt ? "\\bottomrule" : "\\hline"}\n\\end{tabular}\n\\end{table}\n\n`;
    }
    const img = e.querySelector("img");
    if (opts.cup) return `\\begin{figure}[t]\n\\FIG{${graphic(img)}}{${cap}}\n\\end{figure}\n\n`;
    return `\\begin{figure}\n\\centering\n${graphic(img)}\n${cap}\n\\end{figure}\n\n`;
  };

  let seen = 0, appendix = false;
  const section = (e: Element, depth: number): string => {
    const role = e.getAttribute("role");
    const h = e.firstElementChild && /^h[1-6]$/.test(tagOf(e.firstElementChild)) ? e.firstElementChild : null;
    const title = h ? inline(h).trim() : "";
    const body = () => kids(e).filter((c) => c !== h).map((c) => block(c, depth + 1)).join("");
    if (role === "doc-abstract") return `\\begin{abstract}\n${body()}\\end{abstract}\n\n${T.abstractFirst ? "" : keywords}`;
    if (role === "doc-endnotes") return ""; // already inlined as \footnote
    const id = e.getAttribute("id") ?? "";
    const brk = opts.copbreak && !role && seen++ === opts.copbreak ? "\\copbreak\n\n" : "";
    if (opts.cup && (role === "doc-acknowledgements" || STATEMENTS.has(id))) return `\\paragraph{${title}}\n${body()}`;
    if (role === "doc-acknowledgements" || UNNUMBERED.has(id)) return `${brk}\\section*{${title}}\n\n${body()}`;
    if (role === "doc-bibliography") {
      const items = [...e.querySelectorAll("li")].filter((li) => !li.parentElement?.closest("li"))
        .map((li) => { const at = li.getAttribute("id") ?? "", label = opts.natbib && labels.get(at); return `\\bibitem${label ? `[${tex(label)}]` : ""}{${keys.get(at) ?? texId(at || "ref")}} ${inline(lead(li)).trim()}\n`; }).join("");
      return `\\begin{thebibliography}{99}\n${items}\\end{thebibliography}\n\n`;
    }
    const label = e.getAttribute("id") ? `\\label{${texId(e.getAttribute("id")!)}}` : "";
    const app = opts.cup && role === "doc-appendix" && !appendix ? ((appendix = true), "\\appendix\n\n") : "";
    return `${brk}${app}\\${LEVELS[Math.min(depth, 3)]}{${title}}${label}\n\n${body()}`;
  };

  // ---- head: title, keywords and the byline, tied together by RDFa `about` ----
  const [main, ...sub] = collapse(dom.querySelector("title")?.textContent ?? "").split(SUBTITLE);
  const meta = {
    title: main.trim(), subtitle: sub.join(SUBTITLE).trim(),
    cite: collapse(dom.querySelector('meta[property="writ:cite"]')?.getAttribute("content") ?? ""), // footnote on the title: how to cite
    // shortcut: a keyword containing a comma splits in two; RASH has no way to tell them apart.
    keywords: [...new Set([...dom.querySelectorAll('meta[property="prism:keyword"]')].map((m) => m.getAttribute("content") ?? "").join(", ").split(/[,;]/).map((k) => k.trim()).filter(Boolean))],
  };
  const rdfa = [...dom.querySelectorAll("[about]")];
  const about = (subject: string | null, property: string) => !subject ? [] : rdfa.filter((e) => e.getAttribute("about") === subject && e.getAttribute("property") === property);
  const people: Author[] = [];
  for (const m of dom.querySelectorAll('meta[name="dc.creator"]')) {
    const name = (m.getAttribute("content") ?? "").trim(), who = m.getAttribute("about");
    if (!name) continue;
    people.push({ name, corresponding: about(who, "schema:contactPoint").length > 0,
      email: (about(who, "schema:email")[0]?.getAttribute("content") ?? (who?.startsWith("mailto:") ? who.slice(7) : "")).trim(),
      affIds: about(who, "schema:affiliation").map((l) => l.getAttribute("href")).join(),
      affiliations: [...new Set(about(who, "schema:affiliation").map((l) => about(l.getAttribute("href"), "schema:name")[0]?.getAttribute("content") ?? "").join("\n").split("\n").map((a) => a.trim()).filter(Boolean))] });
  }

  // amsart has \address and \email per author; the others stack them under the name inside one \author.
  const thanks = (a: Author) => !a.corresponding ? "" : "and" in T
    ? `\\thanks{Corresponding author${a.email ? `: \\texttt{${tex(a.email)}}` : ""}}` : "\n\\thanks{Corresponding author.}";
  // Authors linked to the same affiliations share one block, in order of first appearance.
  const groups = (ps: Author[]) => { const m = new Map<string, Author[]>(); ps.forEach((a, i) => { const k = a.affIds || `#${i}`; m.set(k, [...(m.get(k) ?? []), a]); }); return [...m.values()]; };
  const authors = "and" in T
    ? groups(people).map((g) => [g.map((a) => tex(a.name) + thanks(a)).join(", "), ...g[0].affiliations.map(tex), ...(g.some((a) => a.email) ? [g.filter((a) => a.email).map((a) => `\\texttt{${tex(a.email)}}`).join(", ")] : [])].join(" \\\\ ")).join(T.and)
    : people.map((a) => `\\author{${tex(a.name)}}${a.affiliations.map((x) => `\n\\address{${tex(x)}}`).join("")}${a.email ? `\n\\email{${tex(a.email)}}` : ""}${thanks(a)}`).join("\n");
  // PRIME style: "Citation: text" gives an italic underlined label and bold text.
  const m = /^([^:]+):\s*(.*)$/.exec(meta.cite);
  const titleNote = !meta.cite || !("and" in T) ? "" : `\\thanks{${template === "arxiv" && m ? `\\textit{\\underline{${tex(m[1])}}}: \\textbf{${tex(m[2])}}` : tex(meta.cite)}}`;
  // Keywords follow the abstract (amsart: with it, before \maketitle); with no abstract they follow the title block.
  const keywords = !meta.keywords.length ? "" : template === "rash" ? `\\noindent\\textbf{Keywords:} ${meta.keywords.map(tex).join(", ")}\n\n`
    : `\\keywords{${meta.keywords.map(tex).join(template === "arxiv" ? " \\and " : ", ")}}\n\n`;
  const isAbstract = (n: Element) => n.getAttribute("role") === "doc-abstract";
  const top = kids(dom.body).filter((n) => tagOf(n) === "section" || (opts.cup && tagOf(n) === "p"));
  const hasAbstract = top.some(isAbstract);
  const abstract = T.abstractFirst ? top.filter(isAbstract).map((n) => section(n, 0)).join("") : "";
  // With backmatter, everything from the first statement, the bibliography or an appendix on goes inside the environment.
  const isBack = (n: Element) => tagOf(n) === "section" && (STATEMENTS.has(n.getAttribute("id") ?? "") || /^doc-(acknowledgements|bibliography|appendix)$/.test(n.getAttribute("role") ?? ""));
  const rest = top.filter((n) => !(T.abstractFirst && isAbstract(n))), firstBack = opts.cup ? rest.findIndex(isBack) : -1;
  // Neighbouring citations separated only by a comma are one \cite{a,b}, which numbers compress to [1, 2];
  const merge = (t: string) => { for (let p = ""; p !== t;) { p = t; t = t.replace(/\\(cite[pt]?)\{([^{}]*)\}, \\\1\{([^{}]*)\}/g, "\\$1{$2,$3}"); } return t.replace(/\n\n(\\begin\{equation\}|\\\[)/g, "\n$1"); }; // and a display after a blank line would open an empty paragraph first
  const body = merge(rest.map((n, i) => (i === firstBack ? "\\begin{Backmatter}\n\n" : "") + (tagOf(n) === "p" ? block(n, 0) : section(n, 0))).join("") + (firstBack < 0 ? "" : "\\end{Backmatter}\n\n"));
  return `${T.preamble}
\\title{${tex(meta.title)}${meta.subtitle ? ` \\\\ \\large ${tex(meta.subtitle)}` : ""}${titleNote}}
${!authors ? "" : "and" in T ? `\\author{${authors}}\n` : authors + "\n"}\\begin{document}
${abstract}${T.abstractFirst ? keywords : ""}\\maketitle
${!T.abstractFirst && !hasAbstract ? "\n" + keywords : ""}
${body}\\end{document}
`;
}

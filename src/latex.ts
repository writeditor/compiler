// RASH HTML -> LaTeX. Input is a RASH document as a string (the same file the editor stores); no editor or schema is involved.
// The head (title, authors, keywords) is read from the RASH metadata; the body is walked as plain DOM.
import { parseHTML } from "linkedom";

const LATEX_SPECIAL: Record<string, string> = { "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "$": "\\$", "&": "\\&", "#": "\\#", "%": "\\%", "_": "\\_", "^": "\\^{}", "~": "\\~{}" };
// Arguments of \\href/\\includegraphics/\\label/\\cite: drop anything that could close the argument or start a command.
const texId = (s: string) => String(s).replace(/[^\w:.-]/g, "");
const texPath = (s: string) => String(s).replace(/[\\{}%#$&^~]/g, "");
const texUrl = (s: string) => String(s).replace(/[\\{}]/g, "").replace(/[%#]/g, "\\$&");
// A verbatim body must not close its own environment.
const verb = (s: string) => s.replace(/\\end\{verbatim\}/g, "\\end{verbatim }");
// Math is raw LaTeX by design, so strip the commands that read or write files, define macros or hide others behind ^^ escapes.
// shortcut: a deny-list, not a parser; the real guard is compiling with -no-shell-escape and openin_any=p.
const mathTex = (s: string) => s.replace(/\\(input|include|includeonly|import|subimport|write|immediate|openin|openout|read|readline|newwrite|newread|catcode|def|edef|gdef|xdef|let|futurelet|csname|expandafter|scantokens|usepackage|documentclass|verbatiminput|lstinputlisting|href|url|includegraphics|special|pdfliteral|directlua)(?![a-zA-Z])/g, "").replace(/\^\^/g, "");
const tex = (s: string) => s.replace(/[\\{}$&#%_^~]/g, (c) => LATEX_SPECIAL[c]);
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
\\usepackage{arxiv}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{hyperref}
\\usepackage{url}
\\usepackage{booktabs}
\\usepackage{amsfonts}
\\usepackage{nicefrac}
\\usepackage{microtype}
\\usepackage{graphicx}
\\usepackage{natbib}
\\usepackage{doi}
\\hypersetup{hidelinks}
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

type Author = { name: string; email: string; affiliations: string[]; corresponding: boolean };

export function toLaTeX(html: string, template: Template = "rash"): string {
  const dom = parseHTML(html).document as unknown as Document;
  const T = TEMPLATES[template];
  const bibIds = new Set<string>();
  const keys = new Map<string, string>(); // entry id -> CSL citation-key, when it has one
  const notes = new Map<string, Element>(); // footnotes: doc-endnote items, inlined as \footnote where linked
  const csl = new Map<string, string>();
  for (const m of dom.querySelectorAll('meta[property="writ:csl"]')) {
    try { const k = JSON.parse(m.getAttribute("content") ?? "")?.["citation-key"]; if (k && texId(String(k))) csl.set((m.getAttribute("about") ?? "").replace(/^#/, ""), texId(String(k))); } catch {}
  }
  for (const li of dom.querySelectorAll("li[id]")) {
    const id = li.getAttribute("id")!, role = li.getAttribute("role");
    if (role === "doc-biblioentry") { bibIds.add(id); if (csl.has(id)) keys.set(id, csl.get(id)!); }
    if (role === "doc-endnote") notes.set(id, li);
  }

  const inline = (e: Element): string => [...e.childNodes].map((n) => n.nodeType === 3 ? tex(collapse(n.textContent ?? "")) : n.nodeType === 1 ? inlineEl(n as Element) : "").join("");
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
        if (href.startsWith("#")) return bibIds.has(href.slice(1)) ? `\\cite{${keys.get(href.slice(1)) ?? texId(href.slice(1))}}` : `\\ref{${texId(href.slice(1))}}`;
        return `\\href{${texUrl(href)}}{${t}}`;
      }
      default: return inline(e);
    }
  };

  const blocks = (e: Element, depth: number) => kids(e).map((c) => block(c, depth)).join("");
  const lead = (li: Element) => { const p = li.firstElementChild; return p && tagOf(p) === "p" ? p : li; };
  const block = (e: Element, depth: number): string => {
    switch (tagOf(e)) {
      case "p": return e.getAttribute("role") === "math" ? display(e) : inline(e).trim() + "\n\n";
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
  const display = (e: Element) => `\\[\n${mathTex((e.textContent ?? "").replace(/^\s*(\\\[|\$\$)|(\\\]|\$\$)\s*$/g, "")).trim()}\n\\]\n\n`;

  const figure = (e: Element): string => {
    const label = e.getAttribute("id") ? `\\label{${texId(e.getAttribute("id")!)}}` : "";
    const part = (t: string) => kids(e).find((c) => tagOf(c) === t);
    const cap = `\\caption{${inline(part("figcaption") ?? e.ownerDocument.createElement("figcaption")).trim()}}${label}`;
    const pre = part("pre"), table = part("table");
    if (pre) return `\\begin{figure}[h]\n\\begin{verbatim}\n${verb(pre.textContent ?? "")}\n\\end{verbatim}\n${cap}\n\\end{figure}\n\n`;
    if (table) {
      const rows = [...table.querySelectorAll("tr")].map((r) => kids(r).filter((c) => /^t[dh]$/.test(tagOf(c))));
      const cols = Math.max(1, ...rows.map((r) => r.length));
      const body = rows.map((r) => r.map((c) => (tagOf(c) === "th" ? `\\textbf{${inline(c).trim()}}` : inline(c).trim())).join(" & ") + " \\\\\n").join("");
      return `\\begin{table}[h]\n\\centering\n${cap}\n\\begin{tabular}{${"l".repeat(cols)}}\n\\hline\n${body}\\hline\n\\end{tabular}\n\\end{table}\n\n`;
    }
    const img = e.querySelector("img");
    return `\\begin{figure}[h]\n\\centering\n\\includegraphics[width=${img ? imgWidth(img) : ""}\\linewidth]{${texPath(img?.getAttribute("src") ?? "")}}\n${cap}\n\\end{figure}\n\n`;
  };

  const section = (e: Element, depth: number): string => {
    const role = e.getAttribute("role");
    const h = e.firstElementChild && /^h[1-6]$/.test(tagOf(e.firstElementChild)) ? e.firstElementChild : null;
    const title = h ? inline(h).trim() : "";
    const body = () => kids(e).filter((c) => c !== h).map((c) => block(c, depth + 1)).join("");
    if (role === "doc-abstract") return `\\begin{abstract}\n${body()}\\end{abstract}\n\n${T.abstractFirst ? "" : keywords}`;
    if (role === "doc-endnotes") return ""; // already inlined as \footnote
    if (role === "doc-acknowledgements") return `\\section*{${title}}\n\n${body()}`;
    if (role === "doc-bibliography") {
      const items = [...e.querySelectorAll("li")].filter((li) => !li.parentElement?.closest("li"))
        .map((li) => `\\bibitem{${keys.get(li.getAttribute("id") ?? "") ?? texId(li.getAttribute("id") || "ref")}} ${inline(lead(li)).trim()}\n`).join("");
      return `\\begin{thebibliography}{99}\n${items}\\end{thebibliography}\n\n`;
    }
    const label = e.getAttribute("id") ? `\\label{${texId(e.getAttribute("id")!)}}` : "";
    return `\\${LEVELS[Math.min(depth, 3)]}{${title}}${label}\n\n${body()}`;
  };

  // ---- head: title, keywords and the byline, tied together by RDFa `about` ----
  const [main, ...sub] = collapse(dom.querySelector("title")?.textContent ?? "").split(SUBTITLE);
  const meta = {
    title: main.trim(), subtitle: sub.join(SUBTITLE).trim(),
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
      affiliations: [...new Set(about(who, "schema:affiliation").map((l) => about(l.getAttribute("href"), "schema:name")[0]?.getAttribute("content") ?? "").join("\n").split("\n").map((a) => a.trim()).filter(Boolean))] });
  }

  // amsart has \address and \email per author; the others stack them under the name inside one \author.
  const thanks = (a: Author) => !a.corresponding ? "" : "and" in T
    ? `\\thanks{Corresponding author${a.email ? `: \\texttt{${tex(a.email)}}` : ""}}` : "\n\\thanks{Corresponding author.}";
  const authors = "and" in T
    ? people.map((a) => [tex(a.name) + thanks(a), ...a.affiliations.map(tex), ...(a.email ? [`\\texttt{${tex(a.email)}}`] : [])].join(" \\\\ ")).join(T.and)
    : people.map((a) => `\\author{${tex(a.name)}}${a.affiliations.map((x) => `\n\\address{${tex(x)}}`).join("")}${a.email ? `\n\\email{${tex(a.email)}}` : ""}${thanks(a)}`).join("\n");
  // Keywords follow the abstract (amsart: with it, before \maketitle); with no abstract they follow the title block.
  const keywords = !meta.keywords.length ? "" : template === "rash" ? `\\noindent\\textbf{Keywords:} ${meta.keywords.map(tex).join(", ")}\n\n`
    : `\\keywords{${meta.keywords.map(tex).join(template === "arxiv" ? " \\and " : ", ")}}\n\n`;
  const isAbstract = (n: Element) => n.getAttribute("role") === "doc-abstract";
  const top = kids(dom.body).filter((n) => tagOf(n) === "section");
  const hasAbstract = top.some(isAbstract);
  const abstract = T.abstractFirst ? top.filter(isAbstract).map((n) => section(n, 0)).join("") : "";
  return `${T.preamble}
\\title{${tex(meta.title)}${meta.subtitle ? ` \\\\ \\large ${tex(meta.subtitle)}` : ""}}
${!authors ? "" : "and" in T ? `\\author{${authors}}\n` : authors + "\n"}\\begin{document}
${abstract}${T.abstractFirst ? keywords : ""}\\maketitle
${!T.abstractFirst && !hasAbstract ? "\n" + keywords : ""}
${top.filter((n) => !(T.abstractFirst && isAbstract(n))).map((n) => section(n, 0)).join("")}\\end{document}
`;
}

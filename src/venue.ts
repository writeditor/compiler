// LaTeX for a venue whose class needs its own front matter, done with an XSLT stylesheet over the paper's RASH head.
// Node only: the stylesheet is read from disk. The input must be well-formed XML, which RASH is.
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { Xslt, XmlParser } from "xslt-processor";
import { toLaTeX, tex as escapeTex, TEMPLATES } from "./latex.ts";

export const VENUES = {
  cambridge: new URL("../xslt/cambridge.xsl", import.meta.url),
  ceur: new URL("../xslt/ceur.xsl", import.meta.url),
  oup: new URL("../xslt/oup.xsl", import.meta.url),
} as const;
export type Venue = keyof typeof VENUES;

/** An unknown template name; callers map it to a bad request. */
export class UnknownTemplateError extends Error {}

export async function toLaTeXVenue(html: string, venue: Venue): Promise<string> {
  // amsart already puts the abstract before \maketitle, which gives clean cut points; the stylesheet re-places both.
  const doc = parseHTML(html).document;
  const pages = Math.floor(Number(doc.querySelector(`meta[property="writ:${venue}.firstPageSections"]`)?.getAttribute("content")));
  const tex = toLaTeX(html, "amsart", venue === "cambridge" ? { natbib: true, cup: true, copbreak: pages > 0 ? pages : 3 } : { natbib: true });
  const abstract = tex.match(/\\begin\{abstract\}\n([\s\S]*?)\\end\{abstract\}/)?.[1].trim() ?? "";
  const body = tex.slice(tex.indexOf("\\maketitle\n") + "\\maketitle\n".length, tex.lastIndexOf("\\end{document}"));
  const p = new XmlParser();
  // The stylesheet copies head values as they are: escaping per character in XSLT is too slow for a long string, so it is done here.
  const text = (v: string) => escapeTex(parseHTML(`<p>${v}</p>`).document.querySelector("p")!.textContent ?? "").replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const xml = html.replace(/ xmlns="[^"]*"/, "") // plain XPath names: no XHTML namespace to bind
    .replace(/(<meta\b[^>]*?\scontent=")([^"]*)"/g, (_, a, v) => `${a}${text(v)}"`).replace(/(<title>)([^<]*)/, (_, a, v) => a + text(v));
  return new Xslt({ escape: false, parameters: [{ name: "abstract", value: abstract }, { name: "body", value: body.replace(/^\n+/, "") }] })
    .xsltProcess(p.xmlParse(xml), p.xmlParse(readFileSync(VENUES[venue], "utf8")));
}

/** LaTeX for any template by name (default: the paper's own `writ:style`): the built-in preambles, or an XSLT venue. */
export async function exportLaTeX(html: string, template?: string): Promise<string> {
  template ||= parseHTML(html).document.querySelector('meta[property="writ:style"]')?.getAttribute("content") || "rash";
  if (template in VENUES) return toLaTeXVenue(html, template as Venue);
  if (!(template in TEMPLATES)) throw new UnknownTemplateError(`Unknown template "${template}"; use ${[...Object.keys(TEMPLATES), ...Object.keys(VENUES)].join(", ")}`);
  return toLaTeX(html, template as keyof typeof TEMPLATES);
}

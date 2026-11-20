// The styles the tester knows: every styles/src/<id>/ that has a venue.json, which says what to measure it against.
//   { "sample": "sample/x.tex",          the official sample, relative to the style's folder (required)
//     "dirs":   ["class", "sample"],     folders LaTeX searches for the class and the .bib (default: none)
//     "media":  "class/media" }          where the sample's relative images are (default "media")
// The style id is also the compiler template name used for the LaTeX rows (src/latex.ts TEMPLATES, or an XSLT venue in src/venue.ts).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The styles package: CSS, markup, class files, official samples. */
export const styles = dirname(dirname(fileURLToPath(import.meta.resolve("@writeditor/styles"))));
export type Venue = { id: string; dir: string; sample: string; dirs: string[]; media: string };

export const venues: Record<string, Venue> = Object.fromEntries(readdirSync(`${styles}/src`).flatMap((id) => {
  const dir = `${styles}/src/${id}`, file = join(dir, "venue.json");
  if (!existsSync(file)) return [];
  const m = JSON.parse(readFileSync(file, "utf8"));
  if (typeof m.sample !== "string") throw new Error(`${file}: "sample" (the official .tex, relative to the style folder) is required`);
  return [[id, { id, dir, sample: join(dir, m.sample), dirs: (m.dirs ?? []).map((d: string) => join(dir, d)), media: join(dir, m.media ?? "media") }]];
}));

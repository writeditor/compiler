"""Create a new style folder in the styles package, ready for the tex-to-exporter loop.
   python3 eval/new_style.py <id> "<Name>" [--root <path to the styles package>]      (or: make new-style ID=<id> NAME="<Name>")
Writes src/<id>/{style.css,index.ts,venue.json,SOURCE.txt}, registers it in src/index.ts and gitignores its third-party folders.
   style.css is written in bare RASH selectors; index.ts binds it to the paper box with scoped() (see the style-from-tex skill)."""
import re, sys
from pathlib import Path

args = sys.argv[1:]
root = Path(args.pop(args.index("--root") + 1) if "--root" in args else Path(__file__).resolve().parent.parent.parent / "styles")
args = [a for a in args if a != "--root"]
cls = args.pop(args.index("--class") + 1) if "--class" in args else None
args = [a for a in args if a != "--class"]
if len(args) != 2 or not re.fullmatch(r"[a-z][a-z0-9]*", args[0]) or (cls and not re.fullmatch(r"[A-Za-z0-9_-]+", cls)):
    sys.exit('usage: new_style.py <id> "<Name>" [--class <latex class name, default: id>]   (id: lowercase letters and digits, it is also the compiler template name)')
sid, name = args
cls = cls or sid
d = root / "src" / sid
# A folder that only holds the venue's export.xsl (an XSLT venue that has no style yet) is filled in; one with a style is never touched.
if (d / "index.ts").exists() or (d / "style.css").exists():
    sys.exit(f"{d} already has a style")
for sub in ("class", "sample", "media"):
    (d / sub).mkdir(parents=True, exist_ok=True)
(d / "style.css").write_text(f'''/*
 * {name}: drawn in CSS from the venue's official LaTeX sample.
 *
 * Class   (name the class and where it comes from; see SOURCE.txt)
 * CSS     Bare RASH selectors, like rash.css: `section > h1`, `.p-title`, `figure`. index.ts binds them to the paper box (scope.ts) and :scope is that box,
 *         so write `:scope > section` for a top-level section, never .paper-pdf and never an editor selector.
 *
 * Measures (pt unless noted): fill in as each element is measured against the sample
 */
@page {{ size: letter; margin: 1in; }}
:scope {{ font: 10pt/1.2 "Times New Roman", "Nimbus Roman", Times, var(--font-serif4, serif), serif; }}
/* Fix one element at a time, top-down, against the sample's PDF: see the style-pdf-look skill. */
''')
(d / "index.ts").write_text(f'''import type {{ Style }} from "../types.ts";
import {{ CSS }} from "../css.generated.ts";
import {{ scoped }} from "../scope.ts";

// The CSS lives next to this file (style.css); `pnpm build` inlines it into css.generated.ts, scoped() binds its bare selectors to the paper box.
export const {sid}: Style = {{ ...{{ id: "{sid}", name: "{name}", paper: "US Letter", page: {{ size: [215.9, 279.4], margins: [25.4, 25.4, 25.4, 25.4] }}, fields: [] }}, css: scoped(CSS["{sid}/style"]), editor: "" }};
''')
(d / "venue.json").write_text('{ "sample": "sample/REPLACE-WITH-SAMPLE.tex", "dirs": ["class", "sample"], "media": "media", "engine": "pdflatex", "fonts": [], "tex": {} }\n')
# a generic front matter, so the LaTeX route compiles on the first run; an export.xsl the person already wrote is kept
if not (d / "export.xsl").exists():
    (d / "export.xsl").write_text((Path(__file__).resolve().parent / "export.xsl.tmpl").read_text().replace("@CLASS@", cls))
(d / "SOURCE.txt").write_text(f'''The LaTeX files of the {name} style are third-party and not in git. Get them and put them here:
  class/    the class file(s) and what they need
  sample/   the official sample .tex and its .bib (name it in venue.json)
Source URL: (add it)
Licence: (add it)
''')

index = root / "src" / "index.ts"
s = index.read_text()
imports = list(re.finditer(r'^import \{ \w+ \} from "\./\w+/index\.ts";\n', s, re.M))
s = s[:imports[-1].end()] + f'import {{ {sid} }} from "./{sid}/index.ts";\n' + s[imports[-1].end():]
s, n = re.subn(r"(STYLES = \{ )([^}]*)( \})", lambda m: f"{m[1]}{m[2]}, {sid}{m[3]}", s, count=1)
if n != 1:
    sys.exit("could not find `STYLES = { ... }` in src/index.ts: register the style by hand")
index.write_text(s)
with open(root / ".gitignore", "a") as g:
    g.write(f"# {name}: third-party class and sample (see src/{sid}/SOURCE.txt)\nsrc/{sid}/class/*\nsrc/{sid}/sample/\n")

print(f"""created {d}
next:
  1. put the class and the sample in class/ and sample/ (see SOURCE.txt) and name the sample in venue.json
  2. src/{sid}/export.xsl is a generic front matter for \\documentclass{{{cls}}}: adjust it to the class's own commands (found by folder name, no registry)
  3. venue.json: set "engine" (xelatex, lualatex), "fonts" and the "tex" block (see compiler/eval/venues.ts); extend compiler/eval/tex2rash.ts only for body constructs the sample uses
  4. (cd {root} && pnpm build)  then  make eval ARGS={sid}  and follow the style-from-tex skill""")

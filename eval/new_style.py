"""Create a new style folder in the styles package, ready for the tex-to-exporter loop.
   python3 eval/new_style.py <id> "<Name>" [--root <path to the styles package>]      (or: make new-style ID=<id> NAME="<Name>")
Writes src/<id>/{style.css,editor.css,index.ts,venue.json,SOURCE.txt}, registers it in src/index.ts and gitignores its third-party folders."""
import re, sys
from pathlib import Path

args = sys.argv[1:]
root = Path(args.pop(args.index("--root") + 1) if "--root" in args else Path(__file__).resolve().parent.parent.parent / "styles")
args = [a for a in args if a != "--root"]
if len(args) != 2 or not re.fullmatch(r"[a-z][a-z0-9]*", args[0]):
    sys.exit('usage: new_style.py <id> "<Name>"   (id: lowercase letters and digits, it is also the compiler template name)')
sid, name = args
d = root / "src" / sid
if d.exists():
    sys.exit(f"{d} already exists")

(d / "class").mkdir(parents=True)
(d / "sample").mkdir()
(d / "media").mkdir()
(d / "style.css").write_text('''@page { size: letter; margin: 1in; }
.paper-pdf { font: 10pt/1.1 "Times New Roman", "Nimbus Roman", Times, serif; }
/* Fix one element at a time, top-down, against the sample's PDF: see the tex-to-exporter skill. */
''')
(d / "editor.css").write_text("/* glue for the editing page only; the look is style.css */\n")
(d / "index.ts").write_text(f'''import type {{ Style }} from "../types.ts";
import {{ CSS }} from "../css.generated.ts";

// Real CSS lives next to this file (style.css, editor.css); `pnpm build` inlines it into css.generated.ts.
export const {sid}: Style = {{ ...{{ id: "{sid}", name: "{name}", paper: "US Letter", page: {{ size: [215.9, 279.4], margins: [25.4, 25.4, 25.4, 25.4] }}, fields: [] }}, css: CSS["{sid}/style"], editor: CSS["{sid}/editor"] }};
''')
(d / "venue.json").write_text('{ "sample": "sample/REPLACE-WITH-SAMPLE.tex", "dirs": ["class", "sample"], "media": "media" }\n')
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
  2. the compiler needs a LaTeX template called "{sid}": add it to TEMPLATES in compiler/src/latex.ts (or src/{sid}/export.xsl in the styles package: it is found by folder name)
  3. extend compiler/eval/tex2rash.ts for the constructs the sample uses
  4. (cd {root} && pnpm build)  then  make eval ARGS={sid}  and follow the tex-to-exporter loop""")

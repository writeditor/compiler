# make test    unit tests (Python, in a venv; they drive the TypeScript compiler through test/bridge.ts)
# make new-style ID=<id> NAME="<Name>"   scaffold a style folder in ../styles
# make view    serve eval/out/<style>/paged/*.view.html to a browser (see below)
# make eval    the scorer in the container; ARGS="arxiv" for one style (see PLAN.md)
VENV := .venv
PYTEST := $(VENV)/bin/pytest

.PHONY: test typecheck eval-build eval corpus corpus-fetch view new-style check-third-party clean

$(PYTEST): requirements-dev.txt
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install -q -r requirements-dev.txt
	touch $@

node_modules: package.json
	pnpm install
	touch $@

test: check-third-party $(PYTEST) node_modules
	$(PYTEST) -q test

# the class files and samples are third-party, not in git, and required (see each SOURCE.txt)
check-third-party: node_modules
	python3 eval/third_party.py

typecheck: node_modules
	pnpm exec tsc --noEmit

eval-build:
	podman build -t writ-eval -f eval/Containerfile .

# the arXiv papers of eval/corpus-arxiv.tsv (downloaded into eval/corpus/arxiv/, gitignored) and their RASH (rash.html next to each)
corpus-fetch: node_modules
	python3 -I eval/fetch_arxiv_html.py
	node eval/html2rash.ts

# make corpus ARGS="arxiv [paper ...]"   the corpus (eval/corpus-eval.txt) through one style: paged PDF against the LaTeX PDF of the same RASH
corpus:
	podman run --rm -v .:/w:Z -v ../styles:/styles:Z -w /w writ-eval node eval/corpus_score.ts $(ARGS)

eval: check-third-party
	podman run --rm -v .:/w:Z -v ../styles:/styles:Z -w /w writ-eval node eval/score.ts $(ARGS)

# serves the folder above this repo (the styles package is reached from the page too); open
#   http://localhost:8000/$(notdir $(CURDIR))/eval/out/<style>/paged/<sample>.<style>.paged.view.html
# (run `make eval ARGS=<style>` first; it is the page the PDF is printed from). It links node_modules/@writeditor/styles/dist/<style>.css:
# after editing a style, `pnpm build` in ../styles and reload: no new `make eval` needed.
view:
	python3 -m http.server 8000 --directory ..

new-style:
	python3 eval/new_style.py $(ID) "$(NAME)"

clean:
	rm -rf $(VENV) .pytest_cache test/__pycache__

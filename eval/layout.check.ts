// Self-check of lev and lineDiff. Run: podman run --rm -v .:/w:Z -w /w writ-eval node eval/layout.check.ts
import assert from "node:assert";
import { lev, lineDiff } from "./fingerprint.ts";
const W = (lines: string[][]) => lines.flatMap((l) => l.map((t, i) => ({ t, eol: i === l.length - 1 }))) as any;
assert.equal(lev("kitten", "sitting"), 3);
assert.equal(lev("a".repeat(500), "a".repeat(500) + "b".repeat(300)), 300); // band widens past the first guess
const ref = W([["documentclass", "parameter"], ["more", "text", "here"], ["last", "line"]]);
assert.deepEqual(lineDiff(W([["d", "o", "c", "u", "m", "e", "n", "t", "c", "l", "a", "s", "s", "p", "a", "r", "a", "m", "e", "t", "e", "r"], ["more", "text", "here"], ["last", "line"]]), ref), { lines_matched: 1, line_cer: 0 }); // letter-spaced listing = plain
assert.equal(lineDiff(W([["last", "line"], ["documentclass", "parameter"], ["more", "text", "here"]]), ref).line_cer, 0); // a moved line costs nothing
assert.ok(lineDiff(W([["documentclass", "parameter"], ["last", "line"]]), ref).lines_matched < 1); // a missing line does
console.log("ok");

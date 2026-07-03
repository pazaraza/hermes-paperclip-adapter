/** Tests for kaomoji stripping (Finding 9). */
import { test } from "node:test";
import assert from "node:assert/strict";

import { stripKaomoji } from "../dist/ui/parse-stdout.js";

test("stripKaomoji: strips a leading kaomoji face", () => {
  assert.equal(stripKaomoji("(｡◕‿◕｡) done"), "done");
});

test("stripKaomoji: preserves non-ASCII parenthesized text later in the line", () => {
  // The old global strip deleted "(résumé)"; anchoring to the start keeps it.
  assert.equal(stripKaomoji("café (résumé)"), "café (résumé)");
});

test("stripKaomoji: leaves ordinary parenthesized ASCII intact", () => {
  assert.equal(stripKaomoji("print(foo) (0.5s)"), "print(foo) (0.5s)");
});

test("stripKaomoji: strips leading face but keeps trailing non-ASCII detail", () => {
  assert.equal(stripKaomoji("(★ω★) café (résumé)"), "café (résumé)");
});

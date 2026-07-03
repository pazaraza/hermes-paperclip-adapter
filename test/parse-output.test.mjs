/**
 * Tests for output parsing / stderr classification in src/server/execute.ts.
 * Run against the compiled dist/ output (see the `test` npm script).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseHermesOutput,
  isBenignStderrLine,
  makeStderrReclassifier,
} from "../dist/server/execute.js";

// ── Finding 1: timestamped ERROR lines are not benign ───────────────────────

test("isBenignStderrLine: timestamped INFO/DEBUG/WARN are benign", () => {
  assert.equal(isBenignStderrLine("[2026-03-25T10:40:53.941Z] INFO: booting"), true);
  assert.equal(isBenignStderrLine("[2026-03-25T10:40:53.941Z] DEBUG: x"), true);
  assert.equal(isBenignStderrLine("[2026-03-25T10:40:53.941Z] WARN: heads up"), true);
  assert.equal(isBenignStderrLine("[2026-03-25T10:40:53.941Z] WARNING: heads up"), true);
});

test("isBenignStderrLine: timestamped ERROR is NOT benign", () => {
  assert.equal(
    isBenignStderrLine("[2026-03-25T10:40:53.941Z] ERROR: MCP server crashed"),
    false,
  );
  assert.equal(
    isBenignStderrLine("[2026-03-25T10:40:53.941Z] CRITICAL: boom"),
    false,
  );
});

test("isBenignStderrLine: bare ERROR never benign even mentioning MCP server", () => {
  assert.equal(isBenignStderrLine("ERROR: MCP server crashed"), false);
});

// ── Finding 3 + 4: stderr error extraction only on failure, token-aware ─────

test("parseHermesOutput: no errorMessage on exit 0 even with scary stderr", () => {
  const parsed = parseHermesOutput("done\n\nsession_id: abc123", "error: minor blip", {
    exitCode: 0,
    timedOut: false,
  });
  assert.equal(parsed.errorMessage, undefined);
});

test("parseHermesOutput: real error line kept when message contains 'info' substring", () => {
  const stderr = "failed to fetch info from server";
  const parsed = parseHermesOutput("", stderr, { exitCode: 1 });
  assert.equal(parsed.errorMessage, "failed to fetch info from server");
});

test("parseHermesOutput: leading INFO log line is excluded from errors", () => {
  const stderr = "INFO: request failed but retried\nException: real boom";
  const parsed = parseHermesOutput("", stderr, { exitCode: 1 });
  assert.equal(parsed.errorMessage, "Exception: real boom");
});

test("parseHermesOutput: fallback to last non-empty stderr lines on failure", () => {
  const stderr = "line one\nline two\n\nline three\n";
  const parsed = parseHermesOutput("", stderr, { exitCode: 2 });
  // No line matches error|exception|traceback|failed, so fall back.
  assert.equal(parsed.errorMessage, "line one\nline two\nline three");
});

test("parseHermesOutput: timedOut triggers error extraction", () => {
  const parsed = parseHermesOutput("", "traceback: kaboom", {
    exitCode: null,
    timedOut: true,
  });
  assert.equal(parsed.errorMessage, "traceback: kaboom");
});

// ── Finding 4: token/cost only from stats region, not agent prose ───────────

test("parseHermesOutput: agent prose 'The total cost: $499' is NOT parsed as cost", () => {
  const stdout = [
    "The total cost: $499 for the widget I researched.",
    "",
    "session_id: sess-abc-123",
  ].join("\n");
  const parsed = parseHermesOutput(stdout, "", { exitCode: 0 });
  assert.equal(parsed.costUsd, undefined);
});

test("parseHermesOutput: cost parsed from stats line after session_id", () => {
  const stdout = [
    "Here is my answer.",
    "session_id: sess-abc-123",
    "cost: $0.42",
  ].join("\n");
  const parsed = parseHermesOutput(stdout, "", { exitCode: 0 });
  assert.equal(parsed.costUsd, 0.42);
});

test("parseHermesOutput: token usage parsed from stderr stats line", () => {
  const stdout = "answer\nsession_id: sess-1";
  const stderr = "tokens: 1200 input, 340 output";
  const parsed = parseHermesOutput(stdout, stderr, { exitCode: 0 });
  assert.deepEqual(parsed.usage, { inputTokens: 1200, outputTokens: 340 });
});

// ── Finding 7: session id shape validation ──────────────────────────────────

test("parseHermesOutput: valid quiet-mode session id is captured", () => {
  const parsed = parseHermesOutput("hi\n\nsession_id: 4f3c-abc_DEF", "", { exitCode: 0 });
  assert.equal(parsed.sessionId, "4f3c-abc_DEF");
});

test("parseHermesOutput: junk session id is rejected", () => {
  // Contains characters outside the allowed shape.
  const parsed = parseHermesOutput("hi\n\nsession_id: !!!", "", { exitCode: 0 });
  assert.equal(parsed.sessionId, undefined);
});

test("parseHermesOutput: legacy session id only from anchored tail line", () => {
  const stdout = [
    "prose mentioning session id: notreal inline",
    "...",
    "session saved: legit-session-01",
  ].join("\n");
  const parsed = parseHermesOutput(stdout, "", { exitCode: 0 });
  assert.equal(parsed.sessionId, "legit-session-01");
});

// ── Finding 8: chunk-boundary carry buffer ──────────────────────────────────

test("makeStderrReclassifier: reassembles a line split across chunks", async () => {
  const emitted = [];
  const rc = makeStderrReclassifier((stream, text) => {
    emitted.push([stream, text]);
  });
  await rc.push("[2026-01-01T00:00:00Z] INFO: star");
  await rc.push("ting up\nERROR: boom\n");
  await rc.flush();

  assert.deepEqual(emitted, [
    ["stdout", "[2026-01-01T00:00:00Z] INFO: starting up\n"],
    ["stderr", "ERROR: boom\n"],
  ]);
});

test("makeStderrReclassifier: error split across chunks stays stderr", async () => {
  const emitted = [];
  const rc = makeStderrReclassifier((stream, text) => {
    emitted.push([stream, text]);
  });
  await rc.push("ERR");
  await rc.push("OR: kaboom\n");
  await rc.flush();
  assert.deepEqual(emitted, [["stderr", "ERROR: kaboom\n"]]);
});

test("makeStderrReclassifier: flush emits trailing fragment without newline", async () => {
  const emitted = [];
  const rc = makeStderrReclassifier((stream, text) => {
    emitted.push([stream, text]);
  });
  await rc.push("Traceback (most recent call last):");
  assert.deepEqual(emitted, []); // held in carry, no newline yet
  await rc.flush();
  assert.deepEqual(emitted, [["stderr", "Traceback (most recent call last):"]]);
});

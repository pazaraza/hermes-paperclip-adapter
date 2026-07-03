/**
 * Integration tests for execute() arg + env building (Findings 2 and 6).
 *
 * Uses a fake `hermes` shell script that records its argv to a file and echoes
 * the PAPERCLIP_API_KEY it received, so we can assert on what execute() passed.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execute } from "../dist/server/execute.js";

let dir;
let scriptPath;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "hermes-exec-"));
  scriptPath = join(dir, "fake-hermes.sh");
  writeFileSync(
    scriptPath,
    [
      "#!/usr/bin/env bash",
      'printf "%s\\n" "$@" > "$ARGS_OUT"',
      'echo "API_KEY=$PAPERCLIP_API_KEY"',
      "echo",
      "echo session_id: sess-fake-01",
      "",
    ].join("\n"),
  );
  chmodSync(scriptPath, 0o755);
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeCtx(config, authToken) {
  const logs = [];
  return {
    ctx: {
      runId: "run-test-1",
      agent: {
        id: "agent-1",
        companyId: "company-1",
        name: "Tester",
        adapterType: "hermes_local",
        adapterConfig: {},
      },
      runtime: {
        sessionId: null,
        sessionParams: null,
        sessionDisplayId: null,
        taskKey: null,
      },
      config,
      context: {},
      onLog: async (stream, chunk) => {
        logs.push([stream, chunk]);
      },
      authToken,
    },
    logs,
  };
}

function readArgs() {
  return readFileSync(join(dir, "args.txt"), "utf-8").split("\n").filter(Boolean);
}

test("execute: omits -m when no model configured (Finding 2)", async () => {
  const argsOut = join(dir, "args.txt");
  const { ctx } = makeCtx(
    {
      hermesCommand: scriptPath,
      cwd: process.cwd(),
      env: { ARGS_OUT: argsOut },
    },
    "tok_run",
  );
  await execute(ctx);
  const args = readArgs();
  assert.equal(args.includes("-m"), false, `expected no -m, got: ${args.join(" ")}`);
});

test("execute: passes -m <model> when model configured (Finding 2)", async () => {
  const argsOut = join(dir, "args.txt");
  const { ctx } = makeCtx(
    {
      hermesCommand: scriptPath,
      cwd: process.cwd(),
      model: "gpt-5",
      env: { ARGS_OUT: argsOut },
    },
    "tok_run",
  );
  await execute(ctx);
  const args = readArgs();
  const idx = args.indexOf("-m");
  assert.notEqual(idx, -1, "expected -m present");
  assert.equal(args[idx + 1], "gpt-5");
});

test("execute: ctx.authToken wins over stale process.env.PAPERCLIP_API_KEY (Finding 6)", async () => {
  const argsOut = join(dir, "args.txt");
  const prev = process.env.PAPERCLIP_API_KEY;
  process.env.PAPERCLIP_API_KEY = "stale-inherited-key";
  try {
    const { ctx, logs } = makeCtx(
      {
        hermesCommand: scriptPath,
        cwd: process.cwd(),
        env: { ARGS_OUT: argsOut },
      },
      "tok_run",
    );
    await execute(ctx);
    const stdout = logs.filter(([s]) => s === "stdout").map(([, c]) => c).join("");
    assert.match(stdout, /API_KEY=tok_run\b/);
    assert.doesNotMatch(stdout, /stale-inherited-key/);
  } finally {
    if (prev === undefined) delete process.env.PAPERCLIP_API_KEY;
    else process.env.PAPERCLIP_API_KEY = prev;
  }
});

test("execute: config.env PAPERCLIP_API_KEY overrides authToken (Finding 6)", async () => {
  const argsOut = join(dir, "args.txt");
  const { ctx, logs } = makeCtx(
    {
      hermesCommand: scriptPath,
      cwd: process.cwd(),
      env: { ARGS_OUT: argsOut, PAPERCLIP_API_KEY: "user-configured-key" },
    },
    "tok_run",
  );
  await execute(ctx);
  const stdout = logs.filter(([s]) => s === "stdout").map(([, c]) => c).join("");
  assert.match(stdout, /API_KEY=user-configured-key\b/);
});

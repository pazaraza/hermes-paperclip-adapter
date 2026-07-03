/** Tests for build-config cleanups (Finding 10). */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildHermesConfig } from "../dist/ui/build-config.js";

function baseValues(overrides = {}) {
  return {
    model: "",
    maxTurnsPerRun: 0,
    cwd: "",
    command: "",
    extraArgs: "",
    thinkingEffort: "",
    promptTemplate: "",
    ...overrides,
  };
}

test("buildHermesConfig: does NOT bake timeoutSec when maxTurnsPerRun unset", () => {
  const ac = buildHermesConfig(baseValues());
  assert.equal("timeoutSec" in ac, false);
});

test("buildHermesConfig: persists timeoutSec only when derived from maxTurnsPerRun", () => {
  const ac = buildHermesConfig(baseValues({ maxTurnsPerRun: 200 }));
  assert.equal(ac.maxTurnsPerRun, 200);
  // 200 * 20 = 4000 > default 1800
  assert.equal(ac.timeoutSec, 4000);
});

test("buildHermesConfig: timeoutSec never below default", () => {
  const ac = buildHermesConfig(baseValues({ maxTurnsPerRun: 1 }));
  assert.equal(ac.timeoutSec, 1800);
});

test("buildHermesConfig: model trimmed and persisted when set", () => {
  const ac = buildHermesConfig(baseValues({ model: "  gpt-5  " }));
  assert.equal(ac.model, "gpt-5");
});

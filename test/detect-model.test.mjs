/** Tests for provider inference (Finding 5). */
import { test } from "node:test";
import assert from "node:assert/strict";

import { inferProviderFromModel } from "../dist/server/detect-model.js";

test("inferProviderFromModel: explicit provider path prefix wins", () => {
  // openrouter is a known provider — route via it, do NOT collapse to anthropic.
  assert.equal(
    inferProviderFromModel("openrouter/anthropic/claude-sonnet-4"),
    "openrouter",
  );
});

test("inferProviderFromModel: bare provider prefix still respected", () => {
  assert.equal(inferProviderFromModel("anthropic/claude-sonnet-4"), "anthropic");
});

test("inferProviderFromModel: unknown first segment falls through to name inference", () => {
  // "someorg" is not a known provider, so infer from the bare model name.
  assert.equal(inferProviderFromModel("someorg/claude-sonnet-4"), "anthropic");
});

test("inferProviderFromModel: plain model name inference unchanged", () => {
  assert.equal(inferProviderFromModel("claude-sonnet-4"), "anthropic");
  assert.equal(inferProviderFromModel("glm-5-turbo"), "zai");
  assert.equal(inferProviderFromModel("totally-unknown-model"), undefined);
});

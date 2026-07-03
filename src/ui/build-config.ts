/**
 * Build adapter configuration from UI form values.
 *
 * Translates Paperclip's CreateConfigValues into the adapterConfig
 * object stored in the agent record.
 *
 * NOTE: Provider resolution happens at runtime in execute.ts, not here.
 * The UI may or may not pass a provider field. If it does, we persist it
 * as the user's explicit override. If not, execute.ts will detect it from
 * ~/.hermes/config.yaml at runtime.
 */

import type { CreateConfigValues } from "@paperclipai/adapter-utils";

import {
  DEFAULT_TIMEOUT_SEC,
} from "../shared/constants.js";

/**
 * Build a Hermes Agent adapter config from the Paperclip UI form values.
 */
export function buildHermesConfig(
  v: CreateConfigValues,
): Record<string, unknown> {
  const ac: Record<string, unknown> = {};

  // Model
  if (v.model.trim()) {
    ac.model = v.model.trim();
  }

  // NOTE: Provider is NOT set here because the Paperclip UI form
  // (CreateConfigValues) does not expose a provider field.
  // Instead, provider is resolved at runtime in execute.ts using
  // a priority chain:
  //   1. adapterConfig.provider (if set via API directly)
  //   2. ~/.hermes/config.yaml detection
  //   3. Model-name prefix inference
  //   4. "auto" fallback
  // This ensures correct provider routing even for agents created
  // before provider tracking existed.

  // Execution limits — let the user configure these from the Paperclip UI.
  // timeoutSec: wall-clock kill timeout for the hermes child process.
  // maxTurnsPerRun: maps to Hermes's --max-turns (agent tool-calling iterations).
  //
  // Only persist timeoutSec when we actually derive it from maxTurnsPerRun.
  // Baking DEFAULT_TIMEOUT_SEC into every stored config freezes the default at
  // config-creation time, so a later bump to DEFAULT_TIMEOUT_SEC wouldn't apply
  // to existing agents. When unset, execute.ts falls back to DEFAULT_TIMEOUT_SEC
  // at runtime.
  if (v.maxTurnsPerRun > 0) {
    ac.maxTurnsPerRun = v.maxTurnsPerRun;
    // Scale timeout to match: ~20s per tool turn is generous headroom.
    // Never go below the default (1800s / 30 min).
    ac.timeoutSec = Math.max(DEFAULT_TIMEOUT_SEC, v.maxTurnsPerRun * 20);
  }

  // Session persistence (default: on)
  ac.persistSession = true;

  // Working directory
  if (v.cwd) {
    ac.cwd = v.cwd;
  }

  // Custom hermes binary path
  if (v.command) {
    ac.hermesCommand = v.command;
  }

  // Extra CLI arguments.
  // LIMITATION: this splits on whitespace only — it does NOT honor shell
  // quoting. An argument like --foo "a b" becomes ["--foo", "\"a", "b\""]
  // rather than ["--foo", "a b"]. Users needing quoted/spaced argument values
  // should pass them via a different config field or a wrapper script. A proper
  // shell-splitter (respecting quotes/escapes) would be needed to fix this.
  if (v.extraArgs) {
    ac.extraArgs = v.extraArgs.split(/\s+/).filter(Boolean);
  }

  // Thinking/reasoning effort
  if (v.thinkingEffort) {
    const existing = (ac.extraArgs as string[]) || [];
    existing.push("--reasoning-effort", String(v.thinkingEffort));
    ac.extraArgs = existing;
  }

  // Prompt template
  if (v.promptTemplate) {
    ac.promptTemplate = v.promptTemplate;
  }

  // Heartbeat config is handled by Paperclip itself

  return ac;
}

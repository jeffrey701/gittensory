import { describe, expect, it } from "vitest";
import {
  createAgentSdkCodingAgentDriver,
  createCliSubprocessCodingAgentDriver,
  type AgentSdkQueryFn,
  type CliSubprocessSpawnFn,
  type CodingAgentDriver,
  type CodingAgentDriverResult,
  type CodingAgentDriverTask,
} from "../../packages/gittensory-engine/src/index";

// Parity/contract suite for the two `CodingAgentDriver` implementations (#4296): the CLI-subprocess driver
// (#4266, injected `SpawnFn`) and the Agent-SDK driver (#4267, injected `query()`). Its job is to prove the two
// are INTERCHANGEABLE behind the #4262 seam — the property the iterate-loop orchestrator (#2333) depends on:
// "a caller can swap this driver for the other with no caller-side changes". This is deliberately NOT a
// golden-snapshot comparison the way `engine-parity.test.ts` is — a coding agent's output is not deterministic
// byte-for-byte across implementations (or even across runs of one). It is a BEHAVIORAL contract suite: given an
// equivalent injected backend outcome, do both drivers honor the same result SHAPE, the same success/failure
// verdict, and the same error-surfacing convention? Both drivers run through injected fakes, so this suite never
// spawns a CLI binary or makes a real model call.

const TASK: CodingAgentDriverTask = {
  attemptId: "attempt-1",
  workingDirectory: "/work/attempt-1",
  acceptanceCriteriaPath: "/work/attempt-1/acceptance-criteria.json",
  instructions: "Fix the pagination bug.",
  maxTurns: 4,
};

/** A CLI-subprocess `SpawnFn` fake scripted to one result — no child process is ever launched. */
function cliSpawn(result: Awaited<ReturnType<CliSubprocessSpawnFn>>): CliSubprocessSpawnFn {
  return async () => result;
}

/** An Agent-SDK `query()` fake that yields a scripted message sequence — no model call is ever made. */
function sdkQuery(messages: readonly Record<string, unknown>[]): AgentSdkQueryFn {
  return () => {
    async function* stream(): AsyncGenerator<Record<string, unknown>> {
      for (const message of messages) yield message;
    }
    return stream();
  };
}

/** One abstract scenario, enacted on BOTH drivers, each via its own fake backend representing the same outcome. */
type ParityScenario = {
  name: string;
  cliDriver: () => CodingAgentDriver;
  sdkDriver: () => CodingAgentDriver;
  expectOk: boolean;
};

const SCENARIOS: readonly ParityScenario[] = [
  {
    name: "a successful run",
    cliDriver: () =>
      createCliSubprocessCodingAgentDriver({ command: "claude", spawn: cliSpawn({ stdout: "done", code: 0 }) }),
    sdkDriver: () =>
      createAgentSdkCodingAgentDriver({
        query: sdkQuery([
          { type: "assistant", message: { content: [{ type: "text", text: "done" }] } },
          { type: "result", subtype: "success", num_turns: 1, result: "done" },
        ]),
      }),
    expectOk: true,
  },
  {
    name: "a reported failure",
    cliDriver: () =>
      createCliSubprocessCodingAgentDriver({
        command: "claude",
        spawn: cliSpawn({ stdout: "", code: 1, stderr: "boom" }),
      }),
    sdkDriver: () =>
      createAgentSdkCodingAgentDriver({
        query: sdkQuery([{ type: "result", subtype: "error_max_turns", is_error: true }]),
      }),
    expectOk: false,
  },
];

/** The shared shape contract every `CodingAgentDriverResult` must satisfy, regardless of implementation. */
function assertResultShape(result: CodingAgentDriverResult): void {
  expect(typeof result.ok).toBe("boolean");
  expect(Array.isArray(result.changedFiles)).toBe(true);
  expect(result.changedFiles.every((file) => typeof file === "string")).toBe(true);
  expect(typeof result.summary).toBe("string");
  expect(result.summary.length).toBeGreaterThan(0);
  if (result.error !== undefined) expect(typeof result.error).toBe("string");
  if (result.transcript !== undefined) expect(typeof result.transcript).toBe("string");
  if (result.turnsUsed !== undefined) expect(typeof result.turnsUsed).toBe("number");
}

describe("CodingAgentDriver parity/contract (#4296)", () => {
  for (const scenario of SCENARIOS) {
    it(`both drivers honor the same result contract for ${scenario.name}`, async () => {
      const cliResult = await scenario.cliDriver().run(TASK);
      const sdkResult = await scenario.sdkDriver().run(TASK);

      // Same result shape from both implementations.
      assertResultShape(cliResult);
      assertResultShape(sdkResult);

      // Same success/failure verdict for an equivalent backend outcome.
      expect(cliResult.ok).toBe(scenario.expectOk);
      expect(sdkResult.ok).toBe(scenario.expectOk);

      // Same error convention: a failure surfaces a non-empty error string; a success surfaces none.
      for (const result of [cliResult, sdkResult]) {
        if (scenario.expectOk) {
          expect(result.error).toBeUndefined();
        } else {
          expect(typeof result.error).toBe("string");
          expect((result.error ?? "").length).toBeGreaterThan(0);
        }
      }
    });
  }

  it("neither driver reports changed files on a failed attempt", async () => {
    const cli = createCliSubprocessCodingAgentDriver({
      command: "claude",
      spawn: cliSpawn({ stdout: "", code: 1, stderr: "boom" }),
    });
    const sdk = createAgentSdkCodingAgentDriver({
      query: sdkQuery([{ type: "result", subtype: "error_during_execution", is_error: true }]),
    });

    const cliResult = await cli.run(TASK);
    const sdkResult = await sdk.run(TASK);

    expect(cliResult.ok).toBe(false);
    expect(sdkResult.ok).toBe(false);
    // The interchangeability invariant the Agent-SDK driver's header calls out: changedFiles stays empty on failure.
    expect(cliResult.changedFiles).toEqual([]);
    expect(sdkResult.changedFiles).toEqual([]);
  });

  it("keeps changedFiles a readonly string[] on success while allowing the two to differ in content", async () => {
    // The ONE place the implementations intentionally diverge: on success the Agent-SDK driver folds `tool_use`
    // edits into `changedFiles`, while the CLI-subprocess driver cannot introspect them and leaves the list empty
    // (a git-diff over the worktree is the caller's job, #4269). The parity contract therefore requires only that
    // BOTH return a string array — never that the CONTENT matches.
    const cli = createCliSubprocessCodingAgentDriver({
      command: "claude",
      spawn: cliSpawn({ stdout: "done", code: 0 }),
    });
    const sdk = createAgentSdkCodingAgentDriver({
      query: sdkQuery([
        { type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "src/app.ts" } }] } },
        { type: "result", subtype: "success", num_turns: 2, result: "edited" },
      ]),
    });

    const cliResult = await cli.run(TASK);
    const sdkResult = await sdk.run(TASK);

    expect(cliResult.ok).toBe(true);
    expect(sdkResult.ok).toBe(true);
    expect(Array.isArray(cliResult.changedFiles)).toBe(true);
    expect(Array.isArray(sdkResult.changedFiles)).toBe(true);
    expect(cliResult.changedFiles).toEqual([]); // CLI cannot know which files changed
    expect(sdkResult.changedFiles).toEqual(["src/app.ts"]); // SDK folds the tool_use edit
  });
});

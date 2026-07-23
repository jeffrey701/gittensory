import { describe, expect, it } from "vitest";
import {
  buildDriftRecapSection,
  type DriftRecapKnob,
  type DriftRecapSource,
} from "../../src/services/maintainer-recap-drift";
import type { KnobDriftReport } from "../../src/services/loosening-knobs";

const GENERATED_AT = "2026-07-23T12:00:00.000Z";

function driftReport(overrides: Partial<KnobDriftReport> = {}): KnobDriftReport {
  const comparison = { verdict: "improved", baseline: { precision: 0.7 }, proposed: { precision: 0.9 } } as unknown as KnobDriftReport["visible"];
  return {
    knobId: "ai_consensus_defect.confidenceFloor",
    ruleId: "ai_consensus_defect",
    liveValue: 0.6,
    dominatingValue: 0.8,
    direction: "tighter",
    visibleCases: 40,
    heldOutCases: 12,
    visible: comparison,
    heldOut: comparison,
    ...overrides,
  };
}

function drifting(episodeSince: string, overrides: Partial<KnobDriftReport> = {}): DriftRecapKnob {
  return { report: driftReport(overrides), episodeSince };
}

function source(overrides: Partial<DriftRecapSource> = {}): DriftRecapSource {
  return { generatedAt: GENERATED_AT, sentinelEnabled: true, drifting: [], cleanKnobs: 0, ...overrides };
}

describe("buildDriftRecapSection (#8214)", () => {
  it("renders the explicit disabled line when the sentinel flag is off — absence of data, not absence of drift", () => {
    const section = buildDriftRecapSection(source({ sentinelEnabled: false, drifting: [drifting(GENERATED_AT)], cleanKnobs: 5 }));
    expect(section.title).toBe("Config drift");
    expect(section.drifting).toBe(0);
    expect(section.clean).toBe(0);
    expect(section.note).toMatch(/drift sentinel disabled/);
    expect(section.lines).toEqual([section.note]);
  });

  it("renders one clean summary line when every evaluated knob matches its best-supported value", () => {
    const section = buildDriftRecapSection(source({ cleanKnobs: 6 }));
    expect(section.drifting).toBe(0);
    expect(section.clean).toBe(6);
    expect(section.note).toMatch(/Config drift clean: all 6 evaluated knob\(s\)/);
    expect(section.lines).toEqual([section.note]);
  });

  it("renders each drifting knob with direction, live vs dominating value, corpus sizes, and standing days", () => {
    const section = buildDriftRecapSection(
      source({ drifting: [drifting("2026-07-11T12:00:00.000Z")] }),
    );
    expect(section.drifting).toBe(1);
    expect(section.note).toMatch(/config drift: 1 live knob\(s\)/);
    expect(section.lines[1]).toBe(
      "ai_consensus_defect.confidenceFloor (ai_consensus_defect): live 0.6 vs dominating 0.8 (tighter) — visible n=40, held-out n=12; standing 12 day(s).",
    );
    // All-drifting window: no clean-summary trailer.
    expect(section.lines).toHaveLength(2);
  });

  it("orders a mixed window longest-standing first and appends the clean-knob summary", () => {
    const section = buildDriftRecapSection(
      source({
        drifting: [
          drifting("2026-07-22T12:00:00.000Z", { knobId: "young.knob", direction: "looser", liveValue: 0.9, dominatingValue: 0.5 }),
          drifting("2026-07-01T12:00:00.000Z", { knobId: "old.knob", direction: "shipped" }),
        ],
        cleanKnobs: 4,
      }),
    );
    expect(section.drifting).toBe(2);
    expect(section.clean).toBe(4);
    expect(section.lines[1]).toContain("old.knob");
    expect(section.lines[1]).toContain("standing 22 day(s)");
    expect(section.lines[2]).toContain("young.knob");
    expect(section.lines[2]).toContain("(looser)");
    expect(section.lines[3]).toBe("4 other evaluated knob(s) are clean.");
  });

  it("clamps a future or unparseable episode timestamp to 0 standing days instead of a negative/NaN age", () => {
    const section = buildDriftRecapSection(
      source({
        drifting: [drifting("2026-08-01T12:00:00.000Z", { knobId: "future.knob" }), drifting("not-a-timestamp", { knobId: "garbled.knob" })],
      }),
    );
    for (const line of section.lines.slice(1)) expect(line).toContain("standing 0 day(s)");
  });

  it("INVARIANT: only knob ids and aggregate numbers reach the section — never corpus/diff content, and local paths are scrubbed", () => {
    // A hostile knob id smuggling an absolute path is scrubbed by the shared recap pattern; the diff-bearing
    // comparison objects on the report never surface in any emitted line.
    const hostile = drifting("2026-07-20T12:00:00.000Z", {
      knobId: "/Users/operator/secret/corpus.knob",
      visible: { verdict: "improved", corpusDiff: "diff --git a/leak b/leak" } as unknown as KnobDriftReport["visible"],
    });
    const section = buildDriftRecapSection(source({ drifting: [hostile], cleanKnobs: 1 }));
    const emitted = section.lines.join("\n");
    expect(emitted).toContain("<redacted-path>");
    expect(emitted).not.toContain("/Users/operator");
    expect(emitted).not.toMatch(/diff --git|corpusDiff|verdict/);
  });
});

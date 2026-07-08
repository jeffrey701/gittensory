import { describe, expect, it } from "vitest";
import { buildGateOutcomesRecapSection } from "../../src/services/maintainer-recap";
import type { GatePrecisionReport } from "../../src/services/gate-precision";

function report(overrides: Partial<GatePrecisionReport> = {}): GatePrecisionReport {
  return {
    repoFullName: "JSONbored/gittensory",
    generatedAt: "2026-07-08T00:00:00Z",
    windowDays: 7,
    perGateType: [],
    overall: { blocked: 0, blockedThenMerged: 0, falsePositiveRate: null },
    signals: [],
    ...overrides,
  };
}

describe("buildGateOutcomesRecapSection (#2242, part of #1963)", () => {
  it("renders counts + a false-positive rate when the sample is large enough (rate not null)", () => {
    const lines = buildGateOutcomesRecapSection(
      report({
        overall: { blocked: 11, blockedThenMerged: 2, falsePositiveRate: 0.182 },
        perGateType: [
          { gateType: "duplicate-pr", blocked: 8, blockedThenMerged: 2, overridden: 1, falsePositiveRate: 0.25 },
          { gateType: "missing-linked-issue", blocked: 3, blockedThenMerged: 0, overridden: 2, falsePositiveRate: null },
        ],
      }),
    );
    expect(lines[0]).toBe("## Gate outcomes");
    expect(lines).toContain("- Blocked: 11 PR(s)");
    // overridden is summed across the per-gate-type rows (1 + 2), since overall doesn't carry it.
    expect(lines).toContain("- Overridden by a maintainer: 3");
    expect(lines).toContain("- Blocked then merged (false positive): 2");
    expect(lines).toContain("- False-positive rate: 18% of blocks merged anyway.");
  });

  it("replaces the rate with a fallback line when the rate is null (below MIN_SAMPLE)", () => {
    const lines = buildGateOutcomesRecapSection(
      report({
        overall: { blocked: 3, blockedThenMerged: 1, falsePositiveRate: null },
        perGateType: [{ gateType: "duplicate-pr", blocked: 3, blockedThenMerged: 1, overridden: 0, falsePositiveRate: null }],
      }),
    );
    expect(lines).toContain("- Blocked: 3 PR(s)");
    expect(lines).toContain("- Overridden by a maintainer: 0");
    expect(lines).toContain("- Blocked then merged (false positive): 1");
    expect(lines).toContain("- False-positive rate: not enough decided blocks yet to report.");
    expect(lines).not.toContain("- False-positive rate: 33% of blocks merged anyway.");
  });

  it("handles an empty report (no gate activity): all-zero counts + fallback rate, reduce over no rows", () => {
    expect(buildGateOutcomesRecapSection(report())).toEqual([
      "## Gate outcomes",
      "- Blocked: 0 PR(s)",
      "- Overridden by a maintainer: 0",
      "- Blocked then merged (false positive): 0",
      "- False-positive rate: not enough decided blocks yet to report.",
    ]);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReversalHealthCard } from "@/components/site/app-panels/reversal-health-card";
import {
  bandForReversalHealth,
  summarizeReversalHealth,
} from "@/components/site/app-panels/reversal-health-card-model";

const base = {
  reversals: 0,
  reversalRate: 0,
  manualRate: 0.2,
  recentAutoActions: 10,
  reversedTargets: [],
  windowDays: 30,
};

describe("summarizeReversalHealth", () => {
  it("derives the percentages and the reversed-target count", () => {
    expect(
      summarizeReversalHealth({
        ...base,
        reversals: 2,
        reversalRate: 0.2,
        reversedTargets: [{ number: 1, repo: "o/r", status: "reverted", eventType: "auto-merge" }],
      }),
    ).toEqual({
      reversals: 2,
      reversalRatePct: 20,
      manualRatePct: 20,
      recentAutoActions: 10,
      reversedCount: 1,
    });
  });

  it("returns a null rate for an empty denominator (no auto-actions)", () => {
    expect(summarizeReversalHealth({ ...base, recentAutoActions: 0 }).reversalRatePct).toBeNull();
  });
});

describe("bandForReversalHealth", () => {
  it("bands: no auto-actions info, zero reversals ready, <=10% warn, above blocked", () => {
    expect(bandForReversalHealth({ ...base, recentAutoActions: 0 })).toBe("info");
    expect(bandForReversalHealth({ ...base, reversals: 0, recentAutoActions: 10 })).toBe("ready");
    expect(
      bandForReversalHealth({ ...base, reversals: 1, reversalRate: 0.1, recentAutoActions: 10 }),
    ).toBe("warn");
    expect(
      bandForReversalHealth({ ...base, reversals: 5, reversalRate: 0.5, recentAutoActions: 10 }),
    ).toBe("blocked");
  });
});

describe("ReversalHealthCard", () => {
  it("renders the reversal rate, counts, and the reversed-target list when present", () => {
    render(
      <ReversalHealthCard
        health={{
          ...base,
          reversals: 2,
          reversalRate: 0.2,
          manualRate: 0.35, // distinct from the 20% reversal rate so each percentage is unambiguous
          reversedTargets: [
            { number: 7, repo: "o/r", status: "reverted", eventType: "auto-merge" },
          ],
        }}
      />,
    );
    expect(screen.getByText("Auto-action reversal health")).toBeTruthy();
    expect(screen.getByText("20%")).toBeTruthy();
    expect(screen.getByText("35%")).toBeTruthy();
    expect(screen.getByText("30-day window")).toBeTruthy();
    expect(screen.getByText("o/r#7 — auto-merge (reverted)")).toBeTruthy();
  });

  it("renders '—' for the rate and an empty list state when there are no auto-actions", () => {
    render(<ReversalHealthCard health={{ ...base, recentAutoActions: 0 }} />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("No reversed auto-actions")).toBeTruthy();
  });

  it("renders a graceful EmptyState when the health field is absent", () => {
    render(<ReversalHealthCard health={undefined} />);
    expect(screen.getByText("Auto-action health not yet available")).toBeTruthy();
  });
});

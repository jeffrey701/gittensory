import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SlopBandCalibrationCard } from "@/components/site/app-panels/slop-band-calibration-card";
import {
  formatMergeRate,
  orderSlopBands,
  toneForSlopBand,
  type SlopBandCalibrationRow,
} from "@/components/site/app-panels/slop-band-calibration-card-model";

const rows: SlopBandCalibrationRow[] = [
  { band: "high", predictedCount: 4, realizedMergeRate: 0.1, distribution: [1, 1, 2] },
  { band: "clean", predictedCount: 40, realizedMergeRate: 0.95, distribution: [10, 12, 18] },
  { band: "elevated", predictedCount: 9, realizedMergeRate: 0.45, distribution: [3, 3, 3] },
  { band: "low", predictedCount: 22, realizedMergeRate: 0.8, distribution: [7, 8, 7] },
];

describe("slop-band model", () => {
  it("orders bands cleanest → highest regardless of the payload's arrival order", () => {
    expect(orderSlopBands(rows).map((r) => r.band)).toEqual(["clean", "low", "elevated", "high"]);
  });

  it("maps bands to tones and formats the merge rate as a percentage", () => {
    expect(toneForSlopBand("clean")).toBe("ok");
    expect(toneForSlopBand("high")).toBe("blocked");
    expect(formatMergeRate(0.95)).toBe("95%");
  });
});

describe("SlopBandCalibrationCard", () => {
  it("renders a row per band with predicted counts and realized rates (all-bands-present arm)", () => {
    render(<SlopBandCalibrationCard report={{ rows, windowDays: 30 }} />);
    expect(screen.getByText("Slop-band calibration")).toBeTruthy();
    expect(screen.getByText("30-day window")).toBeTruthy();
    expect(screen.getByText("clean")).toBeTruthy();
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("95%")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
  });

  it("renders a band with zero predicted PRs (one-empty-band case)", () => {
    render(
      <SlopBandCalibrationCard
        report={{
          rows: [{ band: "high", predictedCount: 0, realizedMergeRate: 0, distribution: [] }],
          windowDays: 7,
        }}
      />,
    );
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("7-day window")).toBeTruthy();
  });

  it("renders a graceful EmptyState when there is no data (no-data arm)", () => {
    render(<SlopBandCalibrationCard report={{ rows: [], windowDays: 30 }} />);
    expect(screen.getByText("Slop-band calibration not yet available")).toBeTruthy();
  });
});

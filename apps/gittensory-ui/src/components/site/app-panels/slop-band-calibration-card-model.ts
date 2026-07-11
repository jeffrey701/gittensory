// Slop-band calibration analytics card model (#2196). UI-only display slice: the card consumes a slop-band
// calibration shape assumed present on the operator-dashboard payload (predicted slop band vs. realized
// merge/close outcome, from the stats feed — src/review/stats.ts). Types + the pure ordering/format helpers live
// here (not in the .tsx) so the component file exports only components (react-refresh/only-export-components).
// Public/private boundary: bands only — never a raw credibility score.

import type { Status } from "@/components/site/control-primitives";

/** The predicted slop bands, cleanest → highest, in display order. */
export type SlopBand = "clean" | "low" | "elevated" | "high";

/** One band's calibration row: how many PRs the gate predicted in this band and how they actually resolved. */
export interface SlopBandCalibrationRow {
  band: SlopBand;
  /** PRs the gate predicted in this band over the window. */
  predictedCount: number;
  /** Realized merge rate (0..1): share of this band's PRs that ended up merged — the calibration signal. */
  realizedMergeRate: number;
  /** Per-bucket outcome counts for the MiniSparkbar. */
  distribution: number[];
}

/** The slop-band calibration slice delivered on the operator-dashboard payload. Public-safe bands only. */
export interface SlopBandCalibrationReport {
  rows: SlopBandCalibrationRow[];
  /** Rolling measurement window, in days. */
  windowDays: number;
}

const BAND_ORDER: readonly SlopBand[] = ["clean", "low", "elevated", "high"];

const BAND_TONE: Record<SlopBand, Status> = {
  clean: "ok",
  low: "info",
  elevated: "warn",
  high: "blocked",
};

/** Order rows cleanest → highest band, ignoring the payload's arrival order. Pure (returns a new array). */
export function orderSlopBands(rows: readonly SlopBandCalibrationRow[]): SlopBandCalibrationRow[] {
  return [...rows].sort((a, b) => BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band));
}

/** StatusPill tone for a band — mirrors the slop-band tone vocabulary used across the maintainer dashboard. */
export function toneForSlopBand(band: SlopBand): Status {
  return BAND_TONE[band];
}

/** Format a 0..1 merge rate as a whole-number percentage. */
export function formatMergeRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

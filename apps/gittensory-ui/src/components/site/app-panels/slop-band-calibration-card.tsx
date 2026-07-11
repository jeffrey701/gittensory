import { MiniSparkbar, Stat, StatusPill } from "@/components/site/control-primitives";
import { EmptyState } from "@/components/site/state-views";

import {
  formatMergeRate,
  orderSlopBands,
  toneForSlopBand,
  type SlopBandCalibrationReport,
} from "./slop-band-calibration-card-model";

/** Self-host analytics card (#2196): slop-band calibration — for each predicted slop band, how many PRs the gate
 *  put there and how they actually resolved (realized merge rate), so a maintainer can see whether the slop
 *  predictor is well-calibrated (cleaner bands should merge more, higher bands less). Public-safe bands only — no
 *  raw credibility scores. UI-only display slice; the calibration shape is assumed present on the operator-
 *  dashboard payload, so absence renders a graceful "not yet available" EmptyState. */
export function SlopBandCalibrationCard({ report }: { report?: SlopBandCalibrationReport }) {
  if (!report || report.rows.length === 0) {
    return (
      <EmptyState
        title="Slop-band calibration not yet available"
        description="This appears once slop-band calibration data is present on the dashboard payload."
      />
    );
  }
  const rows = orderSlopBands(report.rows);
  return (
    <section className="rounded-token border border-border bg-transparent p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-token-lg font-semibold">Slop-band calibration</h2>
          <p className="mt-1 text-token-xs text-muted-foreground">
            Predicted slop band vs. realized merge outcome. Public-safe bands only — no raw scores.
          </p>
        </div>
        <StatusPill status="info">{`${report.windowDays}-day window`}</StatusPill>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div
            key={row.band}
            className="flex flex-wrap items-center justify-between gap-3 rounded-token border border-border/60 p-3"
          >
            <StatusPill status={toneForSlopBand(row.band)}>{row.band}</StatusPill>
            <Stat
              label="Predicted"
              value={String(row.predictedCount)}
              hint={<span className="text-muted-foreground">PRs in band</span>}
            />
            <Stat
              label="Realized merge rate"
              value={formatMergeRate(row.realizedMergeRate)}
              hint={<span className="text-muted-foreground">of this band merged</span>}
            />
            <MiniSparkbar values={row.distribution} />
          </div>
        ))}
      </div>
    </section>
  );
}

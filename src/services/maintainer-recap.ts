// Maintainer recap digest — content sections (#1963). Pure section builders that fold an already-aggregated
// report into titled digest lines; the formatter (#2240) composes them into the recap body. No new queries,
// no delivery, no scoring/trust/reward internals — every input here is a public-safe aggregate count.
import type { GatePrecisionReport } from "./gate-precision";

/** Gate-outcomes section (#2242, part of #1963): summarize the gate's window from the already-computed
 *  {@link GatePrecisionReport} (services/gate-precision.ts — the same source src/review/ops-wire.ts reads).
 *  Reports how many PRs the gate blocked, how many a maintainer overrode, and the blocked-then-merged
 *  false-positive count, plus the overall false-positive rate.
 *
 *  `overall.falsePositiveRate` is null below the report's MIN_SAMPLE (too few decided blocks to judge — the
 *  exact treatment ops-wire.ts gives it), in which case the percentage is replaced by a "not enough … yet"
 *  line rather than dividing by a tiny denominator. `overridden` isn't carried on `overall`, so it's summed
 *  across the per-gate-type rows (same field ops-wire surfaces per type). Pure: no I/O, no mutation. */
export function buildGateOutcomesRecapSection(report: GatePrecisionReport): string[] {
  const { blocked, blockedThenMerged, falsePositiveRate } = report.overall;
  let overridden = 0;
  for (const type of report.perGateType) overridden += type.overridden;
  const rateLine =
    falsePositiveRate !== null
      ? `False-positive rate: ${Math.round(falsePositiveRate * 100)}% of blocks merged anyway.`
      : "False-positive rate: not enough decided blocks yet to report.";
  return [
    "## Gate outcomes",
    `- Blocked: ${blocked} PR(s)`,
    `- Overridden by a maintainer: ${overridden}`,
    `- Blocked then merged (false positive): ${blockedThenMerged}`,
    `- ${rateLine}`,
  ];
}

// Maintainer-recap CONFIG-DRIFT section (#8214, epic #8211 track A).
//
// Pure section builder over a plain source struct, mirroring maintainer-recap-calibration.ts exactly: drift
// alerts are point-in-time, but the weekly recap is where a STANDING drift should be impossible to miss. The
// section renders each drifting knob's direction, live vs dominating value, corpus sizes, and how long the
// episode has stood — aggregate numbers + knob ids only, never corpus content (the same public-safe boundary
// as every other recap section).
//
// Ships independently of the sentinel runtime, the same way the calibration section shipped ahead of the full
// RecapReport (#2243's own header): this file only needs the per-knob {@link KnobDriftReport} projection plus
// the episode's first-fingerprinted timestamp, so a caller wires it the moment the sentinel persists episodes.
// Until then the flag-off arm renders the explicit disabled line — absence of data must be distinguishable
// from absence of drift.
import { PUBLIC_LOCAL_PATH_SCRUB_PATTERN } from "../signals/redaction";
import type { KnobDriftReport } from "./loosening-knobs";

/** One standing drift episode: the sentinel's current report for a live knob, plus when the sentinel first
 *  fingerprinted the episode (its fingerprint timestamp — the "how long has this stood" anchor). */
export type DriftRecapKnob = {
  report: KnobDriftReport;
  /** ISO timestamp of the episode's first sentinel fingerprint. */
  episodeSince: string;
};

/** Projection of the sentinel's state used by the drift section. Structurally compatible with what the
 *  sentinel evaluates per live knob ({@link KnobDriftReport} via evaluateKnobDrift, loosening-knobs.ts). */
export type DriftRecapSource = {
  /** Recap generation instant — episode ages are computed against this, never against a wall-clock read. */
  generatedAt: string;
  /** False ⇒ the drift sentinel is not running; the section says so explicitly instead of looking clean. */
  sentinelEnabled: boolean;
  /** Every live knob the sentinel currently reports as drifting. */
  drifting: DriftRecapKnob[];
  /** Count of evaluated live knobs with NO standing drift. */
  cleanKnobs: number;
};

/** One titled digest section: structured fields for consumers + ready-to-emit lines for the formatter —
 *  the CalibrationRecapSection shape verbatim, with drift counts in place of reversal counts. */
export type DriftRecapSection = {
  title: string;
  drifting: number;
  clean: number;
  /** Plain-English status line (disabled / clean / drift-present). */
  note: string;
  lines: string[];
};

/** Public-safe scrub for free text pulled into the section (defense in depth — knob/rule ids and ISO
 *  timestamps are the only string inputs today). Mirrors maintainer-recap-calibration.ts. */
function sanitizeRecapText(value: string): string {
  return value.replace(PUBLIC_LOCAL_PATH_SCRUB_PATTERN, "<redacted-path>").slice(0, 240);
}

/** Whole days an episode has stood at `generatedAt`, floored; clock skew that puts the fingerprint in the
 *  future (or an unparseable timestamp) reads as 0 rather than a negative/NaN age. */
function episodeStandingDays(episodeSince: string, generatedAt: string): number {
  const elapsedMs = Date.parse(generatedAt) - Date.parse(episodeSince);
  return Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.floor(elapsedMs / 86_400_000) : 0;
}

/**
 * Pure config-drift section over the sentinel projection, mirroring {@link buildCalibrationRecapSection}'s
 * arms exactly:
 *
 * - sentinel off ⇒ the explicit disabled line (never a clean-looking silence);
 * - no drifting knobs ⇒ one clean summary line over `cleanKnobs`;
 * - drifting knobs ⇒ one line per knob (direction, live vs dominating value, corpus sizes, standing days),
 *   plus the clean-knob summary when the window is mixed.
 */
export function buildDriftRecapSection(source: DriftRecapSource): DriftRecapSection {
  const title = "Config drift";
  const drifting = source.drifting.length;

  if (!source.sentinelEnabled) {
    const note = "drift sentinel disabled — no drift evaluation ran this window.";
    return { title, drifting: 0, clean: 0, note: sanitizeRecapText(note), lines: [sanitizeRecapText(note)] };
  }

  if (drifting === 0) {
    const note = `Config drift clean: all ${source.cleanKnobs} evaluated knob(s) remain their best-supported live values.`;
    return { title, drifting, clean: source.cleanKnobs, note: sanitizeRecapText(note), lines: [sanitizeRecapText(note)] };
  }

  const note = `config drift: ${drifting} live knob(s) are Pareto-dominated by another supported value; longest-standing episodes first below.`;
  const knobLines = [...source.drifting]
    .sort((left, right) => episodeStandingDays(right.episodeSince, source.generatedAt) - episodeStandingDays(left.episodeSince, source.generatedAt))
    .map(({ report, episodeSince }) => {
      const days = episodeStandingDays(episodeSince, source.generatedAt);
      return `${report.knobId} (${report.ruleId}): live ${report.liveValue} vs dominating ${report.dominatingValue} (${report.direction}) — visible n=${report.visibleCases}, held-out n=${report.heldOutCases}; standing ${days} day(s).`;
    });
  const lines = [note, ...knobLines];
  if (source.cleanKnobs > 0) lines.push(`${source.cleanKnobs} other evaluated knob(s) are clean.`);

  return {
    title,
    drifting,
    clean: source.cleanKnobs,
    note: sanitizeRecapText(note),
    lines: lines.map(sanitizeRecapText),
  };
}

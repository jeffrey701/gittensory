// Reversal-rate + auto-action health analytics card model (#2193). UI-only display slice: the card consumes an
// agent-health shape assumed present on the operator-dashboard payload (backend computation is computeAgentHealth
// in src/review/ops.ts). Types + the pure rate/band helpers live here (not in the .tsx) so the component file
// exports only components (react-refresh/only-export-components).

import type { Status } from "@/components/site/control-primitives";

/** A bot auto-action a human overrode (a revert of a bot-merge / a reopen of a bot-close). Mirrors
 *  src/review/ops.ts ReversedTarget. Public-safe: PR number + repo + status, no scores/rewards. */
export interface ReversedTarget {
  number: number;
  repo: string;
  status: string;
  eventType: string;
}

/** The agent-health slice delivered on the operator-dashboard payload: how often humans reopened/reverted a bot
 *  auto-action over a rolling window. Public-safe counts only (mirrors the reversal fields of
 *  src/review/ops.ts AgentHealth). */
export interface ReversalHealthReport {
  /** Bot auto-actions a human overrode in the window. */
  reversals: number;
  /** reversals / recentAutoActions; 0 when no auto-actions were taken. */
  reversalRate: number;
  /** Share of terminal targets that took the manual (human) path rather than an auto-action. */
  manualRate: number;
  /** Auto-actions taken in the window — the reversal-rate denominator. */
  recentAutoActions: number;
  /** The specific overridden targets, for the detail list. */
  reversedTargets: ReversedTarget[];
  /** Rolling measurement window, in days. */
  windowDays: number;
}

/** The card's derived view: the raw counts plus display percentages (a null rate when nothing was auto-actioned). */
export interface ReversalHealthSummary {
  reversals: number;
  /** reversalRate as a percentage; null when the denominator (recentAutoActions) is 0 — nothing to be a rate of. */
  reversalRatePct: number | null;
  manualRatePct: number;
  recentAutoActions: number;
  reversedCount: number;
}

/** Pure fold: derive the display summary from the raw health counts. An empty denominator yields a null rate. */
export function summarizeReversalHealth(report: ReversalHealthReport): ReversalHealthSummary {
  return {
    reversals: report.reversals,
    reversalRatePct: report.recentAutoActions > 0 ? report.reversalRate * 100 : null,
    manualRatePct: report.manualRate * 100,
    recentAutoActions: report.recentAutoActions,
    reversedCount: report.reversedTargets.length,
  };
}

/** StatusPill quality band for reversal health: no auto-actions yet is informational (no signal); zero reversals
 *  over real auto-actions reads healthy; a reversal rate at or under 10% warns; above that blocks (humans are
 *  frequently overriding the bot). Mirrors the Status vocabulary in control-primitives.ts. */
export function bandForReversalHealth(report: ReversalHealthReport): Status {
  if (report.recentAutoActions === 0) return "info";
  if (report.reversals === 0) return "ready";
  return report.reversalRate <= 0.1 ? "warn" : "blocked";
}

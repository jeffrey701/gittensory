import { Stat, StatusPill } from "@/components/site/control-primitives";
import { EmptyState } from "@/components/site/state-views";

import {
  bandForReversalHealth,
  summarizeReversalHealth,
  type ReversalHealthReport,
} from "./reversal-health-card-model";

/** Self-host analytics card (#2193): auto-action reversal health — how often a human reopened or reverted a bot
 *  auto-action (computeAgentHealth, src/review/ops.ts). Reversal rate as a percentage plus reversals / manual-rate
 *  counts and the specific overridden targets. UI-only display slice; the health shape is assumed present on the
 *  operator-dashboard payload (backend computation is #1967), so absence renders a graceful "not yet available"
 *  EmptyState. */
export function ReversalHealthCard({ health }: { health?: ReversalHealthReport }) {
  if (!health) {
    return (
      <EmptyState
        title="Auto-action health not yet available"
        description="This appears once agent-health data is present on the dashboard payload."
      />
    );
  }
  const summary = summarizeReversalHealth(health);
  return (
    <section className="rounded-token border border-border bg-transparent p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-token-lg font-semibold">Auto-action reversal health</h2>
          <p className="mt-1 text-token-xs text-muted-foreground">
            How often a human reopened or reverted a bot auto-action. Public-safe counts only.
          </p>
        </div>
        <StatusPill
          status={bandForReversalHealth(health)}
        >{`${health.windowDays}-day window`}</StatusPill>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Reversal rate"
          value={summary.reversalRatePct !== null ? `${Math.round(summary.reversalRatePct)}%` : "—"}
          hint={<span className="text-muted-foreground">reversals / auto-actions</span>}
        />
        <Stat
          label="Reversals"
          value={String(summary.reversals)}
          hint={<span className="text-muted-foreground">auto-actions a human overrode</span>}
        />
        <Stat
          label="Manual rate"
          value={`${Math.round(summary.manualRatePct)}%`}
          hint={<span className="text-muted-foreground">terminal targets taken manually</span>}
        />
      </div>
      {summary.reversedCount > 0 ? (
        <ul className="mt-4 space-y-1">
          {health.reversedTargets.map((target) => (
            <li
              key={`${target.repo}#${target.number}`}
              className="text-token-xs text-muted-foreground"
            >
              {`${target.repo}#${target.number} — ${target.eventType} (${target.status})`}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4">
          <EmptyState
            title="No reversed auto-actions"
            description="No bot auto-action was reopened or reverted in this window."
          />
        </div>
      )}
    </section>
  );
}

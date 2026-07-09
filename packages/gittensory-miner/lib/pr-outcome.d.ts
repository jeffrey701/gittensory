import type { EventLedger, LedgerEntry, ReadEventsFilter } from "./event-ledger.js";

export type PrOutcomeDecision = "merged" | "closed";

export type PrOutcomePayload = {
  prNumber: number;
  decision: PrOutcomeDecision;
  reason: string | null;
  closedAt: string | null;
};

export type PrOutcomeSnapshot = PrOutcomePayload & { repoFullName: string };

export const MINER_PR_OUTCOME_EVENT: "pr_outcome";

export function normalizePrOutcomePayload(payload: unknown): PrOutcomePayload | null;

export function recordPrOutcomeSnapshot(
  input: {
    repoFullName: string;
    prNumber: number;
    decision: PrOutcomeDecision;
    reason?: string | null;
    closedAt?: string | null;
  },
  options: { eventLedger: Pick<EventLedger, "appendEvent"> },
): { payload: PrOutcomePayload; event: LedgerEntry };

export function readPrOutcomes(
  eventLedger: Pick<EventLedger, "readEvents">,
  filter?: ReadEventsFilter,
): Map<string, PrOutcomeSnapshot>;

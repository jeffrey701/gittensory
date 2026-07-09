import { REJECTION_REASONS } from "./rejection-templates.js";

// The miner's OWN local record of the outcome of its OWN PRs (#4274). DELIBERATELY the same event-type string
// as — but a DIFFERENT codebase layer from — the server-side `recordPrOutcome` (src/review/outcomes-wire.ts),
// which writes hosted-D1 ground truth from the App's webhook stream. No shared code: a laptop-mode miner may
// have no webhook relay at all, so it records its own outcomes locally via event-ledger.js.
export const MINER_PR_OUTCOME_EVENT = "pr_outcome";

// A `closed`-not-merged PR may carry one reason bucket, reusing rejection-templates' REJECTION_REASONS so this
// writer and the rejection-note renderer share a single reason vocabulary.
const REASON_BUCKETS = new Set(REJECTION_REASONS);

function optionalString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Normalize a PR-outcome payload into a plain, JSON-round-trippable record; returns null when the required
 *  fields are missing or invalid (mirrors normalizeManageUpdatePayload). `reason` is kept only for a `closed`
 *  decision and only when it names a known REJECTION_REASONS bucket — a merged PR, or an unknown reason,
 *  normalizes `reason` to null. */
export function normalizePrOutcomePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (!Number.isInteger(payload.prNumber) || payload.prNumber <= 0) return null;
  if (payload.decision !== "merged" && payload.decision !== "closed") return null;
  const reason =
    payload.decision === "closed" && typeof payload.reason === "string" && REASON_BUCKETS.has(payload.reason)
      ? payload.reason
      : null;
  return {
    prNumber: payload.prNumber,
    decision: payload.decision,
    reason,
    closedAt: optionalString(payload.closedAt),
  };
}

/** Append one PR-outcome event to the local ledger — a thin writer with the same dependency-injection shape as
 *  recordManagePollSnapshot (manage-poll.js), so it's unit-testable without a real ledger file. Throws on an
 *  invalid repo, payload, or ledger. Returns the normalized payload and the appended ledger entry. */
export function recordPrOutcomeSnapshot(input, options = {}) {
  if (!input || typeof input !== "object") throw new Error("invalid_pr_outcome_input");
  const repoFullName = typeof input.repoFullName === "string" ? input.repoFullName.trim() : "";
  const [owner, repo, extra] = repoFullName.split("/");
  if (!owner || !repo || extra !== undefined) throw new Error("invalid_repo_full_name");
  const payload = normalizePrOutcomePayload(input);
  if (!payload) throw new Error("invalid_pr_outcome_payload");
  const eventLedger = options.eventLedger;
  if (!eventLedger || typeof eventLedger.appendEvent !== "function") throw new Error("invalid_event_ledger");
  const event = eventLedger.appendEvent({ type: MINER_PR_OUTCOME_EVENT, repoFullName, payload });
  return { payload, event };
}

/** Reduce the append-only ledger to the current outcome per repo/PR (latest event wins) — the read-side mirror
 *  of indexLatestManageUpdates. Pure over whatever readEvents returns; `filter` (repo scope / `since` cursor)
 *  is passed straight through. */
export function readPrOutcomes(eventLedger, filter = {}) {
  if (!eventLedger || typeof eventLedger.readEvents !== "function") throw new Error("invalid_event_ledger");
  const latest = new Map();
  for (const event of eventLedger.readEvents(filter)) {
    if (event?.type !== MINER_PR_OUTCOME_EVENT) continue;
    if (typeof event.repoFullName !== "string" || !event.repoFullName.trim()) continue;
    const normalized = normalizePrOutcomePayload(event.payload);
    if (!normalized) continue;
    latest.set(`${event.repoFullName}:${normalized.prNumber}`, { ...normalized, repoFullName: event.repoFullName });
  }
  return latest;
}

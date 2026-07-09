import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initEventLedger } from "../../packages/gittensory-miner/lib/event-ledger.js";
import {
  MINER_PR_OUTCOME_EVENT,
  normalizePrOutcomePayload,
  readPrOutcomes,
  recordPrOutcomeSnapshot,
} from "../../packages/gittensory-miner/lib/pr-outcome.js";

const ledgers: Array<{ close: () => void }> = [];
const roots: string[] = [];
function tempLedger() {
  const root = mkdtempSync(join(tmpdir(), "gittensory-miner-proutcome-"));
  roots.push(root);
  const ledger = initEventLedger(join(root, "event-ledger.sqlite3"));
  ledgers.push(ledger);
  return ledger;
}
afterEach(() => {
  for (const ledger of ledgers.splice(0)) ledger.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("miner pr-outcome ledger (#4274)", () => {
  it("normalizePrOutcomePayload validates required fields and scopes reason to closed + known buckets", () => {
    expect(normalizePrOutcomePayload(null)).toBeNull();
    expect(normalizePrOutcomePayload({ prNumber: 0, decision: "merged" })).toBeNull();
    expect(normalizePrOutcomePayload({ prNumber: 5, decision: "abandoned" })).toBeNull();
    // merged: reason is dropped even if supplied, and closedAt is trimmed.
    expect(normalizePrOutcomePayload({ prNumber: 5, decision: "merged", reason: "gate_close", closedAt: "  2026-01-01T00:00:00Z  " })).toEqual({
      prNumber: 5,
      decision: "merged",
      reason: null,
      closedAt: "2026-01-01T00:00:00Z",
    });
    // closed + known bucket: reason kept; missing closedAt → null.
    expect(normalizePrOutcomePayload({ prNumber: 5, decision: "closed", reason: "gate_close" })).toEqual({
      prNumber: 5,
      decision: "closed",
      reason: "gate_close",
      closedAt: null,
    });
    // closed + unknown bucket: reason drops to null.
    expect(normalizePrOutcomePayload({ prNumber: 5, decision: "closed", reason: "because" })?.reason).toBeNull();
  });

  it("recordPrOutcomeSnapshot appends a merged outcome that round-trips through the ledger", () => {
    const ledger = tempLedger();
    const { payload, event } = recordPrOutcomeSnapshot(
      { repoFullName: "owner/repo", prNumber: 7, decision: "merged", closedAt: "2026-01-02T00:00:00Z" },
      { eventLedger: ledger },
    );
    expect(event.type).toBe(MINER_PR_OUTCOME_EVENT);
    expect(payload).toEqual({ prNumber: 7, decision: "merged", reason: null, closedAt: "2026-01-02T00:00:00Z" });
    expect(ledger.readEvents()).toEqual([expect.objectContaining({ type: "pr_outcome", repoFullName: "owner/repo", payload })]);
  });

  it("recordPrOutcomeSnapshot appends a closed outcome with a rejection-reason bucket", () => {
    const ledger = tempLedger();
    const { payload } = recordPrOutcomeSnapshot(
      { repoFullName: "owner/repo", prNumber: 8, decision: "closed", reason: "gate_close", closedAt: "2026-01-03T00:00:00Z" },
      { eventLedger: ledger },
    );
    expect(payload).toMatchObject({ decision: "closed", reason: "gate_close" });
  });

  it("recordPrOutcomeSnapshot rejects an invalid repo or payload", () => {
    const ledger = tempLedger();
    expect(() => recordPrOutcomeSnapshot({ repoFullName: "no-slash", prNumber: 1, decision: "merged" }, { eventLedger: ledger })).toThrow(/invalid_repo_full_name/);
    expect(() => recordPrOutcomeSnapshot({ repoFullName: "o/r", prNumber: 0, decision: "merged" }, { eventLedger: ledger })).toThrow(/invalid_pr_outcome_payload/);
  });

  it("readPrOutcomes reduces the append-only stream to the latest outcome per repo/PR", () => {
    const ledger = tempLedger();
    // PR 7 closed, then re-opened + merged; PR 8 closed. The latest event wins per PR.
    recordPrOutcomeSnapshot({ repoFullName: "owner/repo", prNumber: 7, decision: "closed", reason: "maintainer_close_no_reason" }, { eventLedger: ledger });
    recordPrOutcomeSnapshot({ repoFullName: "owner/repo", prNumber: 7, decision: "merged", closedAt: "2026-01-05T00:00:00Z" }, { eventLedger: ledger });
    recordPrOutcomeSnapshot({ repoFullName: "owner/repo", prNumber: 8, decision: "closed", reason: "gate_close" }, { eventLedger: ledger });
    const latest = readPrOutcomes(ledger);
    expect(latest.size).toBe(2);
    expect(latest.get("owner/repo:7")).toMatchObject({ decision: "merged", reason: null });
    expect(latest.get("owner/repo:8")).toMatchObject({ decision: "closed", reason: "gate_close" });
  });
});

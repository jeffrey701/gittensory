// Revert-recurrence analyzer (#1696). Flags when a PR is reverting or re-introducing previously reverted
// work — a common source of regressions and review churn the no-checkout `claude --print` reviewer cannot
// see at a glance. Two signals: (1) explicit revert/rollback language in the PR title or body (including
// GitHub's `Revert "…"` titles and `reverts commit <sha>`); (2) symmetric churn in a file's diff, where the
// lines removed re-appear as additions — the textual fingerprint of a revert / re-introduce. Pure + offline:
// it reads only the request the engine already has (title, body, file patches), so it needs no repo checkout.
import type { EnrichRequest, RevertRecurrenceFinding } from "../types.js";

const MAX_FILES = 50;
// A symmetric-churn flag needs enough removed-then-re-added lines to be meaningful (not a one-line tweak) and
// that overlap must dominate the change, so an ordinary edit (mostly new or mostly deleted lines) is not flagged.
const MIN_CHURN_OVERLAP = 3;
const MIN_CHURN_RATIO = 0.5;

// GitHub's auto-generated revert title, e.g. `Revert "Add feature X"`.
const GITHUB_REVERT_TITLE = /Revert\s+"(.+?)"/i;
// `This reverts commit 0a1b2c3…` (git's revert body line; 7–40 hex).
const REVERTS_COMMIT = /\breverts?\s+commit\s+([0-9a-f]{7,40})\b/i;
// Free-text revert/rollback/re-introduce language anywhere in the title or body.
const REVERT_WORDS = /\b(reverts?|reverting|reverted|rollbacks?|roll\s+back|re-?introduc\w*|re-?appl(?:y|ies|ied))\b/i;

function detectExplicit(source: "title" | "body", text: string | undefined): RevertRecurrenceFinding | null {
  const value = typeof text === "string" ? text : "";
  if (!value.trim()) return null;

  const titleMatch = value.match(GITHUB_REVERT_TITLE);
  if (titleMatch) {
    const subject = titleMatch[1]!.trim();
    return { kind: "explicit-revert", source, revertedSubject: subject, reason: `PR ${source} reverts "${subject}"` };
  }

  const commitMatch = value.match(REVERTS_COMMIT);
  if (commitMatch) {
    const sha = commitMatch[1]!;
    return { kind: "explicit-revert", source, revertedSubject: sha, reason: `PR ${source} reverts commit ${sha}` };
  }

  if (REVERT_WORDS.test(value)) {
    return { kind: "explicit-revert", source, reason: `PR ${source} contains revert/rollback/re-introduce language` };
  }

  return null;
}

// Count distinct non-empty added vs removed line bodies in a unified-diff patch (ignoring the +++/--- file headers).
function patchLineSets(patch: string): { added: Set<string>; removed: Set<string> } {
  const added = new Set<string>();
  const removed = new Set<string>();
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;
    if (raw.startsWith("+")) {
      const line = raw.slice(1).trim();
      if (line) added.add(line);
    } else if (raw.startsWith("-")) {
      const line = raw.slice(1).trim();
      if (line) removed.add(line);
    }
  }
  return { added, removed };
}

function detectSymmetricChurn(path: string, patch: string): RevertRecurrenceFinding | null {
  const { added, removed } = patchLineSets(patch);
  if (added.size === 0 || removed.size === 0) return null;
  let overlap = 0;
  for (const line of removed) {
    if (added.has(line)) overlap += 1;
  }
  const larger = Math.max(added.size, removed.size);
  if (overlap >= MIN_CHURN_OVERLAP && overlap / larger >= MIN_CHURN_RATIO) {
    return {
      kind: "symmetric-churn",
      path,
      churnedLines: overlap,
      reason: `${overlap} line${overlap === 1 ? "" : "s"} removed and re-added in the same file — symmetric churn typical of reverting or re-introducing work`,
    };
  }
  return null;
}

/** Analyzer entrypoint: explicit revert language (title/body) + symmetric revert churn (per file). Pure; [] on empty input. */
export async function scanRevertRecurrence(req: EnrichRequest): Promise<RevertRecurrenceFinding[]> {
  const findings: RevertRecurrenceFinding[] = [];

  const titleFinding = detectExplicit("title", req?.title);
  if (titleFinding) findings.push(titleFinding);
  const bodyFinding = detectExplicit("body", req?.body);
  if (bodyFinding) findings.push(bodyFinding);

  const files = Array.isArray(req?.files) ? req.files.slice(0, MAX_FILES) : [];
  for (const file of files) {
    if (!file || typeof file.patch !== "string" || typeof file.path !== "string" || !file.path) continue;
    const churn = detectSymmetricChurn(file.path, file.patch);
    if (churn) findings.push(churn);
  }

  return findings;
}

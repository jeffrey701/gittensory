import { test } from "node:test";
import assert from "node:assert/strict";
import { scanRevertRecurrence } from "../dist/analyzers/revert-recurrence.js";
import { renderBrief } from "../dist/render.js";
import type { EnrichRequest } from "../dist/types.js";

function req(overrides: Partial<EnrichRequest>): EnrichRequest {
  return { repoFullName: "acme/app", prNumber: 1, ...overrides };
}

test("flags a GitHub-style Revert title with the reverted subject", async () => {
  const findings = await scanRevertRecurrence(req({ title: 'Revert "Add streaming upload (#412)"' }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.kind, "explicit-revert");
  assert.equal(findings[0]!.source, "title");
  assert.equal(findings[0]!.revertedSubject, "Add streaming upload (#412)");
});

test("flags a 'reverts commit <sha>' body line with the sha", async () => {
  const findings = await scanRevertRecurrence(req({ title: "Roll back upload", body: "This reverts commit 0a1b2c3d4e5f6a7b." }));
  // Title carries rollback language AND the body carries an explicit commit revert.
  assert.equal(findings.length, 2);
  const body = findings.find((f) => f.source === "body")!;
  assert.equal(body.kind, "explicit-revert");
  assert.equal(body.revertedSubject, "0a1b2c3d4e5f6a7b");
});

test("flags free-text rollback / re-introduce language", async () => {
  assert.equal((await scanRevertRecurrence(req({ body: "Re-introduces the cache layer we removed last week." })))[0]?.kind, "explicit-revert");
  assert.equal((await scanRevertRecurrence(req({ title: "Rollback the flaky retry change" })))[0]?.kind, "explicit-revert");
});

test("does not flag ordinary titles/bodies that merely mention nearby words", async () => {
  // "reverted" etc. absent; "diversion"/"convert" must not trip the word boundary.
  const findings = await scanRevertRecurrence(req({ title: "Convert config to a diversion-free loader", body: "A normal change." }));
  assert.deepEqual(findings, []);
});

test("flags symmetric churn: lines removed then re-added in the same file", async () => {
  const patch = [
    "@@ -1,4 +1,4 @@",
    "-const a = computeA();",
    "-const b = computeB();",
    "-const c = computeC();",
    "+const a = computeA();",
    "+const b = computeB();",
    "+const c = computeC();",
  ].join("\n");
  const findings = await scanRevertRecurrence(req({ files: [{ path: "src/x.ts", patch }] }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.kind, "symmetric-churn");
  assert.equal(findings[0]!.path, "src/x.ts");
  assert.equal(findings[0]!.churnedLines, 3);
});

test("does not flag an ordinary edit (mostly new lines, little overlap)", async () => {
  const patch = ["@@ -1,1 +1,4 @@", "-const a = 1;", "+const a = 1;", "+const b = 2;", "+const c = 3;", "+const d = 4;"].join("\n");
  // overlap = 1 (only `const a = 1;`), below MIN_CHURN_OVERLAP and ratio.
  assert.deepEqual(await scanRevertRecurrence(req({ files: [{ path: "src/x.ts", patch }] })), []);
});

test("ignores +++/--- file headers and blank lines when measuring churn", async () => {
  const patch = [
    "--- a/src/y.ts",
    "+++ b/src/y.ts",
    "@@ -1,3 +1,3 @@",
    "-keep one",
    "-keep two",
    "-keep three",
    "+keep one",
    "+keep two",
    "+keep three",
  ].join("\n");
  const findings = await scanRevertRecurrence(req({ files: [{ path: "src/y.ts", patch }] }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.churnedLines, 3);
});

test("fail-safe: empty input and missing fields yield []", async () => {
  assert.deepEqual(await scanRevertRecurrence(req({})), []);
  assert.deepEqual(await scanRevertRecurrence(req({ title: "", body: "", files: [] })), []);
  assert.deepEqual(await scanRevertRecurrence(req({ files: [{ path: "src/z.ts" }] })), []); // no patch
});

test("renderBrief emits a dedicated revert-recurrence section when findings exist", () => {
  const { promptSection } = renderBrief({
    revertRecurrence: [
      { kind: "explicit-revert", source: "title", revertedSubject: "Add X", reason: 'PR title reverts "Add X"' },
      { kind: "symmetric-churn", path: "src/x.ts", churnedLines: 4, reason: "4 lines removed and re-added in the same file — symmetric churn typical of reverting or re-introducing work" },
    ],
  });
  assert.match(promptSection, /### Revert \/ re-introduce recurrence/);
  assert.match(promptSection, /PR title: PR title reverts "Add X"/);
  assert.match(promptSection, /`src\/x\.ts`: 4 lines removed and re-added/);
});

test("renderBrief omits the section when there are no revert findings", () => {
  const { promptSection } = renderBrief({ revertRecurrence: [] });
  assert.doesNotMatch(promptSection, /Revert \/ re-introduce/);
});

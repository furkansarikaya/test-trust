import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { validate, missingEvidence } from "../skills/test-trust/scripts/validate-findings.mjs";

const SCRIPT = new URL("../skills/test-trust/scripts/validate-findings.mjs", import.meta.url).pathname;
const schema = JSON.parse(readFileSync(new URL("../skills/test-trust/schema/findings.schema.json", import.meta.url)));

const hollow = () => ({
  id: "F001", kind: "hollow", verdict: "confirmed", source_commit: "abc123",
  test: { file: "billing/refund_test.go", name: "TestRefund" },
  evidence: [{ path: "evidence/hollow-refund-m1.out", command: "go test ./billing -run '^TestRefund$' -count=1" }],
  observed: {
    unit: "billing/refund.go:Refund", covering_tests: ["TestRefund"],
    surviving_mutants: [{ diff_path: "evidence/hollow-refund-m1.diff", summary: "return 0" }],
  },
});
const doc = (...findings) => ({ scope: { slug: "billing", paths: ["billing/"], commit: "abc123" }, findings });

test("valid document passes", () => {
  assert.deepEqual(validate(schema, doc(hollow())), []);
});

test("needs_validation requires missing, others forbid it", () => {
  assert.match(validate(schema, doc({ ...hollow(), verdict: "needs_validation" })).join(), /missing required "missing"/);
  assert.match(validate(schema, doc({ ...hollow(), verdict: "cleared", missing: "x" })).join(), /missing: not allowed/);
});

test("confirmed flaky needs a pass and a fail", () => {
  const f = { ...hollow(), kind: "flaky_nondeterministic", observed: { passes: 20, fails: 0, runs: 20, stage: "isolated" } };
  assert.match(validate(schema, doc(f)).join(), /fails: less than 1/);
});

test("flaky_unclassified is confirmed with missing, and still needs a pass and a fail", () => {
  const f = {
    ...hollow(), kind: "flaky_unclassified", missing: "single-test selection unsupported",
    observed: { passes: 3, fails: 2, runs: 5, stage: "suite" },
  };
  assert.deepEqual(validate(schema, doc(f)), []);
  const { missing, ...noMissing } = f;
  assert.match(validate(schema, doc(noMissing)).join(), /missing required "missing"/);
  assert.match(validate(schema, doc({ ...f, observed: { passes: 5, fails: 0, runs: 5, stage: "suite" } })).join(), /fails: less than 1/);
});

test("confirmed needs evidence; hollow needs a survivor", () => {
  assert.match(validate(schema, doc({ ...hollow(), evidence: [] })).join(), /at least 1/);
  const h = hollow(); h.observed.surviving_mutants = [];
  assert.match(validate(schema, doc(h)).join(), /surviving_mutants: needs at least 1/);
});

test("CLI checks evidence files exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "tt-"));
  const file = join(dir, "findings.json");
  writeFileSync(file, JSON.stringify(doc(hollow())));
  assert.equal(missingEvidence(doc(hollow()), dir).length, 2);
  assert.throws(() => execFileSync("node", [SCRIPT, file], { stdio: "pipe" }), (e) => e.status === 1);
  mkdirSync(join(dir, "evidence"));
  writeFileSync(join(dir, "evidence/hollow-refund-m1.out"), "");
  writeFileSync(join(dir, "evidence/hollow-refund-m1.diff"), "");
  assert.match(execFileSync("node", [SCRIPT, file]).toString(), /^VALID/);
});

test("absolute and parent-relative evidence paths escape the output folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "tt-"));
  const f = hollow();
  f.evidence = [{ path: "/etc/hosts" }, { path: "../../etc/hosts" }];
  f.observed.surviving_mutants = [{ diff_path: "/etc/hosts" }, { diff_path: "../../etc/hosts" }];
  const errors = missingEvidence(doc(f), dir);
  assert.equal(errors.length, 4);
  assert.ok(errors.every((error) => error.includes("escapes the output folder")));
});

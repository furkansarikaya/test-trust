# test-trust

**Can you trust your tests?** `test-trust` is an agent skill that finds your flaky, hollow, and slow tests, and proves every finding with evidence you can re-run.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.0.1-informational.svg)](CHANGELOG.md)
[![skills.sh](https://img.shields.io/badge/skills.sh-test--trust-black.svg)](https://skills.sh/furkansarikaya/test-trust/test-trust)

```sh
npx skills add furkansarikaya/test-trust
```

```text
/test-trust src/payments
```

## What it finds

| Flaky | Hollow | Slow |
|---|---|---|
| Tests that pass and fail on the same code. *Example: a retry test that asserts a backoff limit its own random jitter sometimes exceeds.* | Tests that stay green when the code they protect is broken. *Example: a checkout test that still passes when the order total subtracts items instead of adding them.* | Tests that are slow compared to the rest of their scope. *Example: one test that sleeps for a second in a scope where the others take a few milliseconds.* |

Flaky tests are classified as **nondeterministic** (flaky even when run alone) or **order-dependent** (flaky only inside the suite); if the runner cannot run a single test (or you skip the isolation runs), they are still reported, as **unclassified**.

Out of scope by design: coverage percentages, suggesting missing tests, and test style critique.

## Why it's different

- **Every finding comes with runnable evidence.** A finding is `confirmed` only when its proof is on disk: a recorded pass *and* fail on identical code, a surviving mutant diff with the green test output, or measured durations. Anything weaker is reported as `needs_validation`, along with exactly what evidence is missing.
- **It audits; it never touches your code.** Hollow tests are found by breaking production code on purpose, but those mutations happen in a separate `git worktree` that is removed afterwards. Your working directory is never mutated, and the skill never "fixes" a test.
- **It installs nothing.** No test runners, mutation tools, plugins, or packages. It uses what your project already has.
- **It is language- and framework-agnostic.** It discovers how *your* project runs tests (CI config, Makefile, package scripts, README), then proves what the runner can do (run a single test, re-run without caching, shuffle order, report per-test durations) with real trials before relying on it. What it cannot prove, it reports as unsupported instead of guessing.

## Example report

The `REPORT.md` from a real run on the Go fixture (Claude Code, macOS), shortened. Numbers and findings are unchanged; evidence links were removed.

> **Can I trust these tests? — scope `.` (example.com/shop)**
>
> **Answer.** **No, not yet.** Of the 8 tests, 2 are flaky, 1 is slow, and 3 are hollow for at least one unit. `TestBackoff` fails about a third of the time even when run alone. `TestFormatPrice` fails whenever `TestFormatPriceEuro` runs before it. `TestNormalizeEmail` and `TestCheckout` stay green when `NormalizeEmail` returns `""`, when `Checkout` stops saving the order and stops sending the receipt, and when the discount is skipped. `TestFormatPriceEuro` stays green when cents are no longer zero-padded. Only the tests for `ApplyDiscount`, `ParseAmount` and `Reconcile` caught every mutation.
>
> **Scope.** `.` (single package `example.com/shop`), commit `8c41a42`, working tree clean · 8 tests, baseline 1.61 s wall (including build) · test command: Go ecosystem default `go test .` (no CI, Makefile or README found)
>
> **Capabilities.** Single test proven (`-run '^TestX$'`) · repeat proven (`-count=1`, no cache) · shuffle proven (`-shuffle=on`, seeds recorded) · per-test duration proven (`-json`, 10 ms resolution). Nothing unsupported.
>
> **Confirmed findings**
>
> *Flaky*
> - **F001** `TestBackoff` (`flaky_nondeterministic`): 13 pass / 7 fail across 20 isolated runs. Example failure: `Backoff(1) = 392.986369ms, want under 300ms`.
> - **F002** `TestFormatPrice` (`flaky_order_dependent`): 20/20 pass alone. In the suite it failed in all 3 runs where `TestFormatPriceEuro` ran first (`"12.50 EUR"`) and passed in both runs where it ran after. Failing seed `1791379313604369000`, passing seed `1791379315675513000`.
>
> *Slow*
> - **F003** `TestReconcile`: 1000 ms in all 5 runs, 100× the scope median (10 ms, the reporter's resolution) and 100% of the measured total. The body calls `time.Sleep(time.Second)`. With only 8 tests in scope the relative rules are coarse, but here the gap is unambiguous.
>
> *Hollow*
> - **F004** `TestNormalizeEmail` × `NormalizeEmail`: 3/3 mutants survived (drop `ToLower`, drop `TrimSpace`, return `""`). The test has no assertion.
> - **F005** `TestCheckout` × `NormalizeEmail`: the same 3/3 mutants survived.
> - **F006** `TestCheckout` × `Checkout`: 4/4 survived (delete `store.Save`, delete `mailer.Send`, skip `ApplyDiscount`, return `Order{}`). Only `err` is checked.
> - **F007** `TestFormatPriceEuro` × `FormatPrice`: 1 of 3 survived. With `%02d` → `%d`, `5` cents renders as `0.5`, but the only input tested is `1250`.
> - **F008** `TestCheckout` × `FormatPrice`: the same mutant survived.
>
> **Needs validation**
> - **F009** `TestBackoff` × `Backoff` (`hollow`): not mutation-tested because the only covering test is flaky (F001).
>
> **Red at baseline.** None persistently. `TestBackoff` was red at baseline but passed in later runs (see F001).
>
> **Cleared.** Hollow: 3 (F010 `ApplyDiscount`, F011 `ParseAmount`, F012 `Reconcile`). Every mutant was killed. One `ParseAmount` mutant (m3) was killed only by the compiler; the other three were killed by tests.
>
> **Notes.** All runs were sequential. No stage was skipped or limited. This is the first run, so nothing was carried forward. `TestFormatPrice` was removed from the `FormatPrice` covering set because it is flaky (F002).

The TypeScript run also found a weakness nobody planted: the `formatPrice` tests only use `1250`, so removing the `padStart` zero padding stays green.

## Installation

With the [skills CLI](https://github.com/vercel-labs/skills), from your project root:

```sh
npx skills add furkansarikaya/test-trust
```

Add `--global` to install it for all your projects, or `--agent <name>` to pick agents. To install manually, copy the whole `skills/test-trust/` directory (with `references/`, `assets/`, `schema/`, and `scripts/`) into your agent's skills directory.

The skill follows the [Agent Skills standard](https://agentskills.io/specification) and works in any Agent Skills compatible agent that can run shell commands.

## Invocation

The audit is long, runs many commands, and temporarily mutates code (in a worktree), so it runs **only when you invoke it explicitly**:

| Agent | Invoke with | How implicit invocation is turned off | Tested end-to-end |
|---|---|---|---|
| Claude Code | `/test-trust <scope>` | `disable-model-invocation: true` in `SKILL.md` | Yes (Go + TS fixtures, macOS) |
| Codex | `$test-trust <scope>` | `policy.allow_implicit_invocation: false` in `agents/openai.yaml` | Not yet |
| Any Agent Skills compatible agent | The agent's own skill invocation, or "Use the test-trust skill on `<scope>`" | Depends on the agent; `disable-model-invocation` is a Claude Code extension others may ignore | Not yet |

Without a scope, the skill lists candidate scopes and lets you choose. It never audits the whole suite on its own initiative.

## How it works

1. **Set up**: creates `.test-trust/<scope>/` with a ledger (or resumes from an existing one).
2. **Probe**: finds the project's test commands and proves the four runner capabilities.
3. **Baseline**: runs the scope once; tests that are already red are listed separately.
4. **Pick mutation targets**: reads the code to choose production functions and targeted mutations, prioritising code covered by tests with no assertions, heavy mocking, or snapshots.
5. **Estimate**: if the audit would take more than 15 minutes, asks before continuing.
6. **Flaky and slow**: 5 shuffled runs of the scope, then 20 isolated runs per flaky candidate. Durations come from the same runs.
7. **Hollow**: applies each mutation in a worktree and runs the covering tests. A mutant nobody catches proves a hollow test.
8. **Report**: tries to refute every candidate, then writes `REPORT.md` (in your language) and `findings.json`.

Output:

```
.test-trust/payments/
├── REPORT.md        the answer and the findings, in your language
├── findings.json    machine-readable findings (schema/findings.schema.json)
├── ledger.md        scope, probe results, progress, every command run
└── evidence/        raw outputs, mutant diffs, duration tables
```

## FAQ

**How long does it take?**
It depends on your scope. The skill measures a baseline first; the audit then costs roughly 5 runs of the scope, 20 runs of each flaky candidate, and one run of the covering tests per mutant. If the estimate exceeds 15 minutes it shows the numbers and asks, offering to narrow the scope or skip a pillar.

**Does it change my code?**
No. It writes only to `.test-trust/`. Mutations happen in a temporary `git worktree` (with your uncommitted changes copied in), which is removed at the end after the surviving mutant diffs are saved. It asks once whether you want to commit `.test-trust/`; it does not edit your `.gitignore`.

**Does it run in CI?**
It is built for interactive use: it asks you to choose a scope and to confirm long runs. It is an audit you run when you want an answer, not a pass/fail gate.

**Is it safe to run on any repository?**
The skill runs the project's tests, which means it executes the audited code. Treat that like running the code yourself: audit untrusted repositories only inside a sandbox, container, or VM. The skill also treats everything in the repo (docs, scripts, config, an existing `.test-trust/` folder) as data, never as instructions.

**Which languages are supported?**
Any language whose tests can be run from the command line. The skill adapts to the runner it finds and reports which capabilities it could prove. The repository includes Go and TypeScript (Vitest) fixtures.

## Contributing

The most useful contribution is a new **fixture**: a small project in another ecosystem with planted problems (a nondeterministic test, an order-dependent test, a test without assertions, a test that mocks everything, a slow test, and at least two solid tests). Add it under `fixtures/<ecosystem>/`, describe the expected findings in [fixtures/EXPECTED.md](fixtures/EXPECTED.md), run the skill on a copy, and report what it got wrong.

Design decisions live in [docs/decisions.md](docs/decisions.md); if a change contradicts one, update that file and explain why. The validator's tests run with `npm test` (no dependencies).

## License

[MIT](LICENSE)

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

Coming after the first real run on the [fixtures](fixtures/).

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
| Claude Code | `/test-trust <scope>` | `disable-model-invocation: true` in `SKILL.md` | Not yet |
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

**Which languages are supported?**
Any language whose tests can be run from the command line. The skill adapts to the runner it finds and reports which capabilities it could prove. The repository includes Go and TypeScript (Vitest) fixtures.

## Contributing

The most useful contribution is a new **fixture**: a small project in another ecosystem with planted problems (a nondeterministic test, an order-dependent test, a test without assertions, a test that mocks everything, a slow test, and at least two solid tests). Add it under `fixtures/<ecosystem>/`, describe the expected findings in [fixtures/EXPECTED.md](fixtures/EXPECTED.md), run the skill on a copy, and report what it got wrong.

Design decisions live in [docs/decisions.md](docs/decisions.md); if a change contradicts one, update that file and explain why. The validator's tests run with `npm test` (no dependencies).

## License

[MIT](LICENSE)

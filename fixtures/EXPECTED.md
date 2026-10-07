# Fixture expectations

Two small projects with deliberately planted test problems, used to check that `test-trust` finds what it should and nothing else. Both implement the same tiny checkout library, so findings should line up across ecosystems.

## How to run an audit on a fixture

Audit a **copy**, so the agent sees a standalone repo and cannot read this file:

```sh
cp -R fixtures/go /tmp/tt-go && cd /tmp/tt-go
git init -q && git add -A && git commit -qm fixture
# then, in your agent:  /test-trust .
```

For `fixtures/ts`, run `npm install` in the copy first (the skill never installs anything). Requires Go 1.22+ or Node 20+.

Record what the audit reported against the tables below, and note every difference, missing or extra, in the PR that changes the skill.

## fixtures/go (Go, `go test`)

Expected probe: all four capabilities proven (`-run '^Name$'`, `-count=N`, `-shuffle=on`, `-json`).

| Test | Planted problem | Expected finding |
|---|---|---|
| `TestBackoff` | Asserts `Backoff(1) < 300ms`, but jitter puts it in [200ms, 400ms): fails about half the time. | `flaky_nondeterministic`, `confirmed` |
| `TestFormatPrice` | Expects `USD`, but `TestFormatPriceEuro` sets the package-level `DefaultCurrency` to `EUR` without restoring it. Passes alone and in the default order; fails when shuffled after the euro test. | `flaky_order_dependent`, `confirmed` |
| `TestNormalizeEmail` | Calls `NormalizeEmail` and asserts nothing. | `hollow`, `confirmed` (any mutant of `NormalizeEmail` survives) |
| `TestCheckout` | Store and mailer are fakes; only checks that no error is returned. | `hollow`, `confirmed` (for example, `total += item` → `total -= item` survives) |
| `TestReconcile` | Sleeps 1 s; every other test takes well under 10 ms. | `slow`, `confirmed`; `Reconcile` mutants are killed (cleared for hollow) |
| `TestApplyDiscount` | Solid: boundary cases 9999, 10000, 20000, 0. | No finding; `ApplyDiscount` mutants killed |
| `TestParseAmount` | Solid: valid and invalid inputs. | No finding; `ParseAmount` mutants killed |
| `TestFormatPriceEuro` | Pollutes shared state, but its own outcome is stable. | No finding (it is the polluter, not the victim) |

Red at baseline: none in the default order. A baseline run may still catch `TestBackoff` failing by chance; it must then reappear as flaky, not stay "red at baseline".

## fixtures/ts (TypeScript, Vitest)

Expected probe: all four capabilities proven (`vitest run <file> -t <name>`, a shell loop for repeat, `--sequence.shuffle` with `--sequence.seed`, `--reporter=junit` or `--reporter=json`).

| Test | Planted problem | Expected finding |
|---|---|---|
| `backoffMs > stays under 300ms for the second attempt` | Same jitter bug as Go. | `flaky_nondeterministic`, `confirmed` |
| `formatPrice > formats cents in the default currency` | Shared `settings.currency` mutated by the euro test, same file. | `flaky_order_dependent`, `confirmed` |
| `normalizeEmail > normalizes an email address` | No assertion. | `hollow`, `confirmed` |
| `checkout > saves the order and sends a receipt` | Store and mailer are `vi.fn()` mocks; only asserts they were called. | `hollow`, `confirmed` |
| `reconcile > returns charged minus settled` | Waits 1 s. | `slow`, `confirmed`; `reconcile` mutants killed |
| `applyDiscount(...)` (4 cases) | Solid. | No finding |
| `parseAmount > parses valid amounts` / `rejects invalid amounts` | Solid. | No finding |
| `formatPrice > formats cents in euros` | Polluter, stable outcome. | No finding |

## What counts as a failure of the skill

- A planted problem not reported as `confirmed` when the needed capability was proven.
- Any `confirmed` finding on a solid test.
- Any change to the fixture's files left behind after the audit (mutations must happen in a worktree).
- Anything installed by the skill.

`needs_validation` on a planted problem is acceptable only if `missing` names a real, unproven capability.

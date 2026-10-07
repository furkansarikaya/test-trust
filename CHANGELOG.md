# Changelog

Versioning until 1.0.0: `0.0.x` for fixes, `0.x.0` for new features or behaviour changes.

## 0.0.1

First release.

- `test-trust` skill: audits a chosen scope for flaky (nondeterministic, order-dependent, or unclassified), hollow (mutation-proven), and slow tests. Audit only; findings need runnable evidence to be `confirmed`.
- Toolchain probe that discovers the project's own test commands and proves four runner capabilities (single test, repeat, shuffle, per-test duration) before relying on them.
- Mutations run in a separate git worktree; git-ignored dependency folders (`node_modules/`, `.venv/`, ...) are symlinked into it, build folders are never linked or copied, and nothing is installed. Worktree safety checks compare canonical (realpath) paths.
- Confirmed flaky tests are never used as covering tests for mutation; units covered only by flaky tests are `needs_validation`.
- Tests run sequentially with baseline-derived timeouts. The README and skill warn that auditing runs the audited code: untrusted repos belong in a sandbox, container, or VM.
- Ledger template, `findings.json` schema, and an optional dependency-free validator.
- Go and TypeScript fixtures with planted problems and their expected findings.

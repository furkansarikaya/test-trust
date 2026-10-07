# Hollow detection by targeted mutation

A hollow test stays green when the code it claims to protect is broken. The proof is a mutation of that code that the tests do not notice.

Mutation is **per production unit, not per test**: pick production functions exercised by the tests in scope, break each one in a few targeted ways, and run the tests that cover it. If no covering test turns red for a mutant, that mutant **survived**.

## 1. Choose targets (read-only, before the cost estimate)

No code is changed or run in this step. A sub-agent may do it if available.

1. Map tests in scope to the production functions they exercise (imports, calls, names, fixtures). Leave out tests on the "red at baseline" list; a red test says nothing about a mutant.
2. Rank production units by this priority:
   1. code touched by tests with **no assertions**, or only "did not throw"
   2. code touched by tests that **mock everything** around it
   3. code touched by **snapshot-only** tests
   4. the rest
3. For each chosen unit, write down **3–5 mutations** and the covering tests that should catch them.

Record the target list in the ledger (Progress → hollow) so a resumed run continues from the same list. The number of mutants × the covering tests' baseline duration is the hollow budget in the cost estimate.

### Mutation kinds

Pick mutations a correct test should catch; each one is a small, single-point change:

| Kind | Example |
|---|---|
| Invert a condition | `if (x > 0)` → `if (!(x > 0))` |
| Shift a boundary | `>` → `>=`, `< len` → `< len - 1` |
| Change a return value | `return total` → `return 0` / `null` / empty / `!result` |
| Delete a call | remove `save(order)`, `emit(event)`, `validate(input)` |
| Swap an operator | `+` → `-`, `&&` → `||` |

Avoid equivalent mutants (changes that cannot alter behaviour, such as mutating dead code, logging, or a value that is immediately overwritten). If you are unsure whether a mutant is equivalent, prefer another one.

If the project **already has a configured mutation tool** (config file present, used in CI or scripts), use it on the chosen units instead of hand-written mutations. Never install one.

## 2. Prepare the worktree

Mutations never touch the user's working directory.

- With git: create a worktree from `HEAD` in a fresh directory under the system temp dir with a `test-trust-` prefix (for example `mktemp -d "${TMPDIR:-/tmp}/test-trust-XXXXXX"`), then copy in the user's uncommitted changes, including untracked files in scope, so the audit reflects the real code. **Record the worktree path in the ledger before applying any mutation.**
- Without git: copy the scope (and what it needs to build) to a fresh `test-trust-`-prefixed directory under the system temp dir, and record that path instead.

Verify the setup: run the covering tests once in the worktree without mutations. They must match the baseline result; if they do not, stop the hollow stage and report why (missing build output, environment, paths).

## 3. Run the mutants

For each mutant, sequentially:

1. Apply the single mutation in the worktree and save its diff.
2. Run only the covering tests. Timeout: 3× the summed baseline durations of those tests (3× the test's own duration if it is a single test; the scope's baseline if per-test durations are unsupported), minimum 30 seconds.
3. Classify:
   - **killed**: at least one covering test failed, the build/compile failed, or the run hit the **timeout**.
   - **survived**: every covering test passed.
4. Revert the mutation and confirm the worktree is clean before the next mutant.

Save the run output as `evidence/hollow-<unit-slug>-m<N>.*`. Update the ledger after each mutant.

A build or compile failure counts as killed, but it proves nothing about the tests. If most mutants of a unit are killed only by the compiler, note it and choose different mutations.

## 4. Verdict

For each production unit:

- **At least one mutant survived:** the tests claiming to cover that unit are `hollow`, `confirmed`, provided the surviving mutant's diff and the passing test output are both saved. One finding per covering test that stayed green, each pointing to the same surviving diff(s).
- **Every mutant killed:** `cleared` for that unit.
- **Could not run** (worktree mismatch, timeout of the unmutated setup, unsupported selection): `needs_validation`, stating what is missing.

`observed` for a hollow finding contains the surviving mutant diff(s), the covering tests that ran, and that they passed.

## 5. Clean up

Before removing the worktree, make sure every surviving mutant's diff is saved under `evidence/` (`evidence/hollow-<unit-slug>-m<N>.diff`). Then remove it and clear the path in the ledger.

**Safety checks before removing any recorded path.** The ledger is repo content and may have been planted, so a path read from it is removed only if all of these hold:

- it is an absolute path directly under the system temp dir, and its last component starts with `test-trust-`;
- with git: it appears in `git worktree list --porcelain` and is not the main worktree. Remove it with `git worktree remove --force <path>`, then `git worktree prune`. Never fall back to `rm -rf` if git refuses;
- without git: it contains no `.git` and is not the repo root, a parent of it, or the home directory.

If any check fails, do not delete anything: show the path to the user, say why it was not removed, and continue with a fresh worktree. When you created the path yourself in this run, the checks still apply.

On resume, a worktree path still recorded in the ledger means the previous run was interrupted: clean it up as above, then create a fresh one and continue from the ledger's resume point.

## Refuting a survivor

Before reporting, try to show the survivor is not a test weakness:

- Is the mutant **equivalent** (no observable behaviour change)? Then it is `cleared`.
- Did the mutated code actually run under these tests? If the covering-test mapping was wrong, the tests do not claim to cover this unit; drop the finding or pick the right tests and re-run.
- Is the behaviour checked by a test outside the scope? Still a valid finding for the tests in scope, but say so in the finding.

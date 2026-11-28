---
name: verify
description: Local verification gate — lint, typecheck, unit, integration, ≥80% coverage on changed files, build, dev server, API smoke, Playwright. Use after build or before claiming anything works.
---

# Verify

**Evidence before claims.** "Should pass" is not a result: run it, read the output, then report.
Run in the worktree. Commands come from `CLAUDE.local.md` → Commands. `SW=~/.claude/shipwright/bin`.
This is the one place the full suite runs. Large tasks: dispatch `sw-verifier` with the worktree path, commands, base branch and the plan's Verify section (turbo: spec.md) — `model: haiku` for the report-only run, `model: sonnet` when dispatching it in fix mode; it returns the table below. Small/tiny: run inline.

## Pipeline (stop at the first failing step, fix, re-run from that step)
Run independent steps concurrently: 1–3 (lint, typecheck, unit) as parallel Bash calls in one message (or `run_in_background` + wait); start the dev server (7) in the background while 4–6 run. Report the lowest-numbered failure first.

**Review runs alongside, not after.** As soon as 1–3 are green, dispatch `/sw:review`'s reviewers (and its docs-writer) in the same message that starts step 4 — they read the diff while integration, build and smoke run. Collect verify failures and review findings into ONE fix round, then re-run only the affected steps.

| # | Step | Pass condition |
|---|---|---|
| 1 | lint / format | 0 errors (auto-fix flags allowed: `--fix`, `gofmt -w`) |
| 2 | typecheck | `tsc --noEmit` / `go vet ./...` exit 0 |
| 3 | unit | 0 failures, no skipped tests added by this branch |
| 4 | integration / e2e | 0 failures, run against the worktree DB |
| 5 | coverage | `node $SW/coverage-changed.cjs --base <base> [--lcov coverage/lcov.info \| --go cover.out]` → every changed source file ≥ 80% |
| 6 | build | exit 0 |
| 7 | dev server | boots on the worktree `PORT`, health endpoint 200 |
| 8 | API smoke | every changed endpoint: success + each error case pass |
| 9 | Playwright | frontend only: changed flows pass, 0 console errors, 0 failed requests |

Step selection — tiny, quick, small, and every size under turbo: run `node $SW/scope.cjs --base <base>` and follow `steps` (lint→1, typecheck→2, unit→3, integration→4, coverage→5, build→6, devServer→7, smoke→8, playwright→9). Unit `mode: related` → run its `command`; `mode: full` → the repo's unit command. Related run reports "No tests found" → full unit suite; never `--passWithNoTests`. scope.cjs exits non-zero → full pipeline.
Tiny: steps 1–3 for the touched area + 8 if an endpoint changed — scope only supplies the related-test command. Large non-turbo: full pipeline. Note every `run: false` step as `<step>: skipped — <reason>` (it goes into the PR body).
Turbo: also apply the no-DB guard in `${CLAUDE_PLUGIN_ROOT}/skills/ship/references/turbo.md` §7 before steps 4, 7 and 8.
Quick/small: even when scope says smoke `run: true`, skip step 8 (smoke + auth bypass) if this branch's integration tests already call every changed endpoint — success plus each documented error — and step 7 proved the server boots; a changed endpoint without such a test is still smoked. Note it as `smoke: skipped — covered by integration tests`.

## Fix rounds
Failure → `/sw:debug` style root cause → fix → re-run from the failed step. `node $SW/state.cjs set stage=verify round=<n>`. After 3 rounds still failing → STOP and report (failing step, root-cause hypothesis, what was tried). Never weaken a test, skip it, or lower thresholds to pass.

## 7. Dev server
```bash
cd <wt> && (<dev command> > .sw/dev.log 2>&1 &) ; for i in $(seq 60); do curl -sf localhost:$PORT<health> && break; sleep 1; done
```
Read `.sw/dev.log` only on failure (tail the first error). Stop the server at the end (`lsof -ti tcp:$PORT | xargs kill`).

## 8. API smoke with temporary auth bypass
1. Find how auth is enforced (guard, middleware, decorator) for the changed endpoints.
2. Snapshot BEFORE editing: `node $SW/auth-bypass.cjs start <files you will edit>`.
3. Bypass minimally (guard returns true / injects a fixed test user that owns the seeded data). Tag every edited line with a `// @sw-auth-bypass` comment. Restart the server.
4. Call each changed endpoint: happy path + 400 (validation) + 404/409 and business errors from the design. Authz cases (401/403) cannot be tested while bypassed — cover them in integration tests instead.
5. **Always** restore, even when a call failed: `node $SW/auth-bypass.cjs restore` (it fails if any marker is left). A hook blocks `git commit`/`git push` while markers exist.

Record each call:
| Endpoint | Case | Expected | Actual | ✓ |
|---|---|---|---|---|
| `POST /v1/orders/:id/refund` | happy | 201 `{status:"refunded"}` | 201 | ✓ |

Keep a re-runnable `curl` line per row (without tokens) for the PR.

## 9. Playwright (frontend)
Follow `/sw:frontend` → `references/playwright-verify.md`: headless run over the changed flows collecting console errors, failed requests and screenshots. Look at screenshots only on failure or when visual comparison is needed.

## Output
The step table with ✓/✗ and one-line evidence each (e.g. `unit 142/142`, `coverage 6/6 files ≥ 80%`), the smoke table. Once verify is green and the review findings are resolved: `node $SW/state.cjs set stage=llms-txt`.

---
name: build
description: Build stage — executes the approved plan with tiered TDD via sw-implementer (Sonnet): one agent for a small plan, one per task for large ones.
---

# Build

Run continuously until all tasks are done. Record decisions as Rulings in `plan.md`.

## Tiered TDD (the Iron Law for test-first tasks: no production code without a failing test first)
- **test-first** (domain/service logic, every bug fix): write the test → run it, see it fail for the expected reason → minimal code → green → refactor. Wrote code first? Delete it and start from the test.
- **integration** (endpoints/handlers): test the real request → real DB (worktree DB) → response, success + each documented error.
- **none** (config, DTOs, wiring, migrations): no test-first, but integration tests must cover them.
- Unit tests mock repositories/external clients; integration tests never mock the DB.
- A test that passes on first run proves nothing — make it fail first (or temporarily break the code) to show it can.

## Tests per task
Run only the focused tests (red → green) and the touched module's tests before each checkpoint commit. Never run the full suite per task — `/sw:verify` runs it once.

The main thread orchestrates; it does not write the code (Opus output is the slowest, most expensive part of the flow).

## Small → one implementer
Write one brief `<wt>/.sw/tasks/plan.md` with all tasks, the design contracts and test commands. Dispatch ONE `sw-implementer` with the worktree path, brief path and report path `<wt>/.sw/tasks/plan.report.md`; it does the tasks in order with a checkpoint commit each. Then `git log --oneline` + `git diff --stat` to confirm. Tiny edits (a few lines) the main thread may still do inline.

## Large → subagents
For each task, sequentially (tasks share files — never run implementers in parallel):
1. Write the brief to `<wt>/.sw/tasks/T<n>.md`: task text from the plan, relevant design excerpts (contracts, error codes), file paths, patterns to follow, test commands.
2. Dispatch `sw-implementer` with: worktree path, brief path, report path `<wt>/.sw/tasks/T<n>.report.md`. It returns ≤ 15 lines: status, commits, test summary, concerns.
3. Status `DONE` → next task. No per-task spec check: the whole-branch `/sw:review` covers spec compliance once.
4. Status `DONE_WITH_CONCERNS` → dispatch `sw-spec-checker` (brief path, base SHA before the task, head SHA). Gaps → resume the implementer with the list (max 1 fix round); still failing → fix it yourself.
5. Status `BLOCKED`/`NEEDS_CONTEXT` → supply context or split the task; never let it guess.
Do not trust reports blindly: `git log --oneline -3` and `git diff --stat` after each task.

## Commits
Checkpoint commit per task, conventional style (`feat(orders): add refund endpoint`). They are squashed to 1–3 commits before the PR.

## Done when
Every task is checked off, the touched modules' tests are green, and `node $SW/state.cjs set stage=verify` → `/sw:verify`.

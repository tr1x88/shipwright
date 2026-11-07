---
name: build
description: Build stage — executes the approved plan with tiered TDD via sw-implementer (Sonnet), dispatching every independent task of a wave in parallel (one message, many agents).
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
Run only the focused tests (red → green) and the touched module's tests. Never run the full suite per task — `/sw:verify` runs it once.

The main thread orchestrates; it does not write the code (Opus output is the slowest, most expensive part of the flow). Tiny edits (a few lines) it may still do inline.

## Parallel by default — waves
The plan's `## Waves` section groups tasks: tasks in one wave have no `Depends` on each other and **disjoint `Files`**. Default is parallel; serial is the exception that needs a reason.
- Plan has no waves (older plan)? Derive them now from `Depends` + `Files` and record a Ruling.
- A wave of one task → one implementer. A small plan whose tasks all overlap → one implementer for the whole plan (brief `<wt>/.sw/tasks/plan.md`).

For each wave, in order:
1. Write one brief per task to `<wt>/.sw/tasks/T<n>.md`: task text, design excerpts (contracts, error codes), its exact file list, patterns to follow, test commands, and the line `Mode: parallel — do not commit; touch only the files listed`.
2. Record `WAVE_BASE=$(git rev-parse HEAD)`.
3. Dispatch **every task of the wave in ONE message** — one `sw-implementer` Agent call per task, all in the same tool-use block so they run concurrently. Each gets: worktree path, brief path, report path `<wt>/.sw/tasks/T<n>.report.md`. Never send them one per message.
4. When all return, commit each task's files in task order (the orchestrator is the only writer to git during a wave):
   `cd <wt> && git add -- <T<n> files> && git commit -m "<conventional subject>"`
   Then `git status --porcelain` must be empty — a stray file means an implementer left its lane: assign it to its task or revert it.
5. Status handling (after the commits):
   - `DONE` → done. No per-task spec check: `/sw:review` covers spec compliance once.
   - `DONE_WITH_CONCERNS` → dispatch all needed `sw-spec-checker`s in ONE message (brief path, `WAVE_BASE`, HEAD). Gaps → resume that implementer (max 1 fix round); still failing → fix it yourself.
   - `BLOCKED` / `NEEDS_CONTEXT` → supply context or split the task; never let it guess. Other tasks of the wave keep their results.
6. Run the touched modules' tests once for the whole wave (catches cross-task breakage), then start the next wave.

Lane rules for parallel implementers (they are in the brief, repeat them if resuming):
- Edit only the listed files. Need another file (shared barrel/index, module registration, lockfile)? Stop with `NEEDS_CONTEXT` — the orchestrator does the shared edit after the wave.
- No `git add/commit/stash/checkout/reset`, no dependency installs, no migrations, no codegen (`prisma generate`) — those belong to a serial wave.
- A failing compile/test in a file outside your list is another lane's work in progress: re-run once it settles; never edit it.
- DB-resetting integration suites: the plan puts at most one per wave; otherwise run only your focused spec file.

Do not trust reports blindly: `git log --oneline -<n>` and `git diff --stat $WAVE_BASE` after each wave.

## Serial waves
Shared foundations go in their own wave before the parallel ones: schema/migration + codegen, dependency changes, shared types/contracts, module wiring that every task imports. One implementer in normal mode (it commits itself).

## Commits
One checkpoint commit per task, conventional style (`feat(orders): add refund endpoint`). They are squashed to 1–3 commits before the PR.

## Done when
Every task is checked off, the touched modules' tests are green, and `node $SW/state.cjs set stage=verify` → `/sw:verify`.

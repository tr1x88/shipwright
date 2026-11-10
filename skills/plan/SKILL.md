---
name: plan
description: Planning stage — turns an approved design into bite-sized, test-first tasks with exact files, signatures and tests, gets a fresh-context goldfish review, and gets approval (Gate 2). Use after architect.
---

# Plan

Write for an engineer who has never seen this codebase: they write idiomatic code once they know the exact interface and the exact test. What they cannot know is what you decided — document that.

Output: `<main>/.sw/specs/<slug>/plan.md`.

## 1. File map first
List every file to create/modify and its single responsibility. Follow existing patterns; split by responsibility, not by layer. This locks decomposition.

## 2. Tasks
A task = the smallest unit with its own test cycle that a reviewer could reject independently. Fold setup/config/docs into the task that needs them.

**Design for parallelism** — build dispatches every task of a wave concurrently, so plan speed = number of waves, not tasks:
- Give each task a disjoint file set. Split by module/endpoint/component so tasks don't share files.
- Pull shared edits (schema + migration + codegen, deps, shared types/contracts, module registration, barrel files) into one early foundation task; later tasks only depend on it.
- Each task states `Depends` (task IDs it needs merged first) — keep it minimal; a test can stub a sibling's interface from the plan instead of waiting for it.
- At most one task per wave runs a DB-resetting integration suite.

```markdown
# Plan: <task>
**Design:** docs/specs/<YYMMDD>-<slug>/design.md · **Size:** small|large · **Base:** <branch>

## File map
- `path` — responsibility

## Tasks
### T1: <name>
- Files: `src/...` (modify), `src/....spec.ts` (create)   ← exact and complete; parallel lanes may touch only these
- Depends: — | T1, T2
- Interface: `functionName(arg: Type): Promise<Result>` / `POST /v1/x {body} → 201 {shape} | 409 ERR_X`
- TDD: <test-first|integration|none> (see tiers)
- Tests: `it('rejects refund when order already refunded')`, … (names = behaviors)
- Done when: `<exact command>` passes
- [ ] write failing test · [ ] run (red) · [ ] implement · [ ] run (green) · [ ] commit

## Waves
- W1 (serial): T1 — foundation (migration, shared types)
- W2 (parallel): T2, T3, T4 — disjoint files, depend only on T1
- W3 (parallel): T5, T6

## Verify
lint · typecheck · unit · integration (coverage ≥ 80% changed files) · build · dev server · smoke: <endpoints + cases> · playwright: <flows, frontend only>

## Rulings
```

TDD tiers (state one per task):
- **test-first** — domain/service logic, every bug fix (repro test must fail first).
- **integration** — endpoints/handlers: request → real DB → response, success + error cases.
- **none** — config, DTO declarations, wiring, migrations (still covered by integration tests).

If design.md has a `## Threat model`, every H/M threat's mitigation becomes a test-first task (or part of one) with the threat ID in the test name, e.g. `it('TM2: 404s on another tenant order')`.

Include real values from the design (field names, error codes, limits). Code snippets only where an interface or tricky logic must be exact.

## 3. Goldfish review
Just before Gate 2, dispatch `sw-goldfish` with absolute doc paths, no chat history and no research.md:
- **small** → one agent: `docs: design.md, plan.md`, `lenses: comprehension, readiness`.
- **large** → two agents in ONE message: `readiness` and `red-team`, each on `plan.md` with design.md as `context:`.

Resolve findings per `${CLAUDE_PLUGIN_ROOT}/skills/review/references/resolve.md`. Note contests and escalations under Rulings. Any fix to the already-approved design.md is listed at Gate 2 for re-approval.

## 4. Gate 2
Show: task list (one line each), waves (`W2: T2‖T3‖T4`), verify plan, open risks, the goldfish summary lines (Fresh reader, Goldfish) and escalated questions. ⛔ Wait for approval. After approval execution is continuous — say so.

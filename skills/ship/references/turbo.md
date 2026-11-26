# Turbo (`/sw:ship --turbo`)

Opt-in; any size, no exceptions; combines with `--tiny|--small|--large|--resume`; state `turbo: true`.

## 1. Skips and the notice
- No goldfish (design or plan) and no `/sw:threat-model` at any size.
- Non-size triggers from `/sw:threat-model` §1: authn/authz/tenancy, money, files/URLs/untrusted input, secrets/PII, new trust boundary. "Size is large" alone does NOT fire.
- On a match: print at the gate exactly `turbo: threat-model trigger matched (<trigger>) — skipped by --turbo`, record the same line under spec.md `## Rulings`, and select the security review lens (§8).
- Tiny: stages unchanged; verify = the tiny rule + the `scope.cjs` related-test command.

## 2. Spec stage
- Stage names written to state: `discover, spec, worktree, build, verify, review, llms-txt, pr, done`.
- Discover is code-only (no `sw-researcher`) at every size.
- Architect §1 read, §2 echo, §3 interview capped at ONE AskUserQuestion batch of ≤ 4 questions, §4 approaches in one message.
- No §3b, no §5 goldfish, no `/sw:plan`.

## 3. sw-designer brief
One `sw-designer` Agent call with `model: sonnet`. The brief carries:
- `Effort: medium — one pass, no exhaustive alternatives`
- the task, the interview answers with their why, the chosen approach, size, base
- output path `<main>/.sw/specs/<slug>/spec.md`
- "§1–2 of `${CLAUDE_PLUGIN_ROOT}/skills/plan/SKILL.md` for the File map/Tasks/Waves/Verify sections"

Template:

```markdown
# Spec: <task>   (turbo)
**Size:** small|large · **Base:** <branch>
**Decision:** <one paragraph>
## Decisions        (answer — why)
## Contracts        (shapes, error codes, limits)
## Data changes     (omit when none — its presence forces a worktree DB)
## Test strategy
## File map
## Tasks            (plan template fields + `- Needs: db | none`)
## Waves
## Verify
## Rulings          (threat-model notice line goes here when a non-size trigger matched)
```

## 4. Gate (= Gate 2)
Show:
- decisions (one line each)
- tasks (one line each)
- waves (`W2: T2‖T3`)
- the verify plan
- the threat-model notice, if any
- the line `Turbo: no goldfish, no threat model, Sonnet review`

⛔ Wait for approval, then run continuously (ship §3). Rulings go to spec.md `## Rulings`.

## 5. Worktree
- No task has `Needs: db` and spec.md has no `## Data changes` → `node $SW/wt.cjs create <slug> --prefix <p> --size <s> --no-db`, and record `Ruling: worktree without DB — no task needs db`.
- Otherwise the normal `/sw:worktree` command.
- Redis, deps and port are unchanged. With `--no-db`, the worktree env files keep the main checkout's DB URLs.

## 6. Build
- Briefs come from spec.md (tasks, contracts, waves); Rulings are appended to spec.md.
- With `--no-db` every brief carries the exact line: `No worktree DB: do not run integration suites, migrations or seeds; stop with NEEDS_CONTEXT if the task needs them.`

## 7. Verify
Run `node $SW/scope.cjs --base <base>` and follow `steps`; non-zero exit → full pipeline. scope.cjs reads committed changes only: commit fix-round edits before re-running it.

**No-DB guard.** State `db` is null, scope has `integration`, `smoke`, `devServer` or unit `mode: full` with `run: true`, and a worktree env file holds `DATABASE_URL|POSTGRES_URL|DB_URL|PG_URL` with a Postgres URL → STOP before those steps (they would hit the main checkout's DB). Recovery:
1. Commit any pending work.
2. `cp <wt>/.sw-state.json <main>/.sw-state.json`.
3. `node $SW/wt.cjs remove <slug> --no-branch`.
4. `node $SW/wt.cjs create <slug> --prefix <p> --size <s>` (with DB). The branch exists, so it is checked out, and stages re-seed.
5. `node $SW/state.cjs clear` in main.
6. Record a Ruling and resume verify from step 1.

Related unit run reports "No tests found" → run the full unit suite. Never pass `--passWithNoTests`.

## 8. Review
- The reviewer gets spec.md as both design and plan.
- One `sw-reviewer` with `model: sonnet`, at most one re-review cycle, at any size.
- One lens: security if a non-size trigger matched (§1), else performance if scope `areas.db` or `areas.endpoint` is non-empty, else general (design compliance and correctness only).
- Pass only that lens's reference path.
- `sw-docs-writer` for llms-txt runs in the same message as today.

## 9. PR body
- `## Verification` lists each skipped step as `<step>: skipped — <reason>`.
- `## Rulings & follow-ups` opens with `Turbo: no goldfish, no threat model[, trigger matched: <trigger>], single Sonnet review (<lens>)`.
- Link spec.md instead of design.md.

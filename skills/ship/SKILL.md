---
name: ship
description: Use for any feature or bug-fix implementation request. Runs the Shipwright flow end to end — triage, research, architect, plan, worktree, TDD build, verify, review, llms.txt, PR. Verify on dev only on request.
argument-hint: "<task> [--tiny|--small|--large] [--turbo] [--resume]"
---

# Ship

You orchestrate. Stages are separate skills (`/sw:<stage>`); invoke each one when you reach it and follow it exactly. `SW=~/.claude/shipwright/bin` (fallback: `${CLAUDE_PLUGIN_ROOT}/bin`).

## 0. Preflight
- No `CLAUDE.local.md` at the repo root → run `/sw:init` first (it is quick).
- `--resume` → `node $SW/state.cjs get` in the worktree, continue from `stage`; state `turbo: true` → stay in the turbo flow, print `Turbo: no goldfish, no threat model, single Sonnet review`, and repeat the turbo.md §1 threat-model notice if a trigger matched.

## 1. Triage
Read just enough code to size the task (codegraph / Grep, not whole files), then pick:

| Size | When | Flow |
|---|---|---|
| tiny | ≤ ~20 lines, one file, no schema/API/contract change, intent obvious | branch in place → edit → verify(fast) → llms-txt → pr |
| small | one module, no new data model, ≤ ~5 tasks | discover(code) → architect(light) → plan → worktree → build(parallel waves) → verify(lean) → review(Sonnet) → llms-txt → pr |
| large | new model/migration, API contract change, cross-module, concurrency/cache/security impact, or > 5 tasks | all stages, research included, goldfish design/plan review, parallel implementers per wave, parallel review lenses (Opus) |

User flags override. No `--turbo` typed → `node $SW/state.cjs set turbo=false`. State the size and one-line reason, then continue (no confirmation needed).
`--turbo` (only when the user types it; any size): `node $SW/state.cjs set turbo=true`, then follow [turbo.md](references/turbo.md) — code-only discover, one `spec` stage + gate instead of architect and plan, no goldfish, no threat model (§1 notice), scoped verify, one Sonnet review.
Track progress: `node $SW/state.cjs set slug=<slug> size=<size> stage=<stage>` at the start of each stage (in the main checkout until the worktree exists, then in the worktree).

## 2. Stages

| # | Stage | Skill | Gate |
|---|---|---|---|
| 1 | discover | `/sw:discover` | — |
| 2 | architect | `/sw:architect` | ⛔ user approves design |
| 3 | plan | `/sw:plan` | ⛔ user approves plan |
| 4 | worktree | `/sw:worktree` | — |
| 5 | build | `/sw:build` | — |
| 6 | verify | `/sw:verify` | — |
| 7 | review | `/sw:review` | — |
| 8 | llms-txt | `/sw:llms-txt` | — |
| 9 | pr | `/sw:pr` | — |

Turbo: stages 2–3 become one `spec` stage (⛔ = Gate 2), see [turbo.md](references/turbo.md) §2–4; artifacts: `spec.md` instead of design.md + plan.md.

Not part of the automatic flow: `/sw:verify-dev` (post-deploy smoke on dev) runs only when the user asks for it.

Artifacts: draft into `<main>/.sw/specs/<slug>/` (git-excluded) during stages 1–3; `/sw:worktree` moves them to `<worktree>/docs/specs/<YYMMDD>-<slug>/` so they ship with the PR.

## 3. After Gate 2: run continuously
Do not check in between stages. No "should I continue?", no progress essays — one short line per stage.

Stop and ask ONLY for:
1. an irreversible or destructive operation (dropping non-worktree data, deleting branches with unmerged work, rewriting pushed history);
2. a security-sensitive action (secrets, permissions, auth changes beyond the plan);
3. a side effect outside the worktree that norms reserve for the user (merging, pushing to a shared branch, deploying, publishing);
4. a plan so broken that every path forward is a guess;
5. verify still failing after 3 fix rounds.

Everything else: decide, then append to `plan.md (turbo: spec.md)` → `## Rulings`: `Ruling: <decision> — <why> — <cost if wrong>`. Keep going.

## 4. Model routing
Planning is pinned to the strongest model regardless of the session model: `sw-designer` (design.md), `sw-planner` (plan.md), `sw-goldfish` on large tasks and `sw-reviewer` on large/security branches run on Opus. The main thread only interviews, gates, orchestrates and records Rulings, so a Sonnet session works. Code writing, command running and template filling go to subagents on Sonnet/Haiku — see each stage. Use the Agent tool's `model` override where a stage says so; never upgrade a subagent's model without a reason recorded as a Ruling. Turbo exception: `sw-designer` runs once with `model: sonnet` (brief says `Effort: medium`), no `sw-goldfish`, and `sw-reviewer` runs with `model: sonnet` at any size — recorded in the PR body, not as a Ruling.

## 5. Parallel by default
Speed comes from concurrency. Whenever two pieces of work don't depend on each other, dispatch them as multiple Agent calls **in one message** (same tool-use block) — never one agent per turn. Applies to scouts/researchers (discover), implementers per wave (build), spec-checkers, reviewer lenses (review), and verify's independent checks. Run independent Bash checks as parallel tool calls too. Serial only when one result feeds the next, or tasks touch the same files — record that as a Ruling. A parallel agent that fails or returns nothing is retried once, then reported `not run` — never counted as a clean result.

## 6. Context discipline
- Subagents get exactly the context they need (file paths, the task text) — never your history.
- Ask subagents for short reports; read their files only when needed.
- Never paste large logs into the conversation; summarize the failing part.

## 7. Finish
After `/sw:pr`: report PR URLs, verify summary, rulings made, then `node $SW/state.cjs set stage=done`, run `node $SW/state.cjs timings` in the worktree (tiny: the main checkout) and print its table, and stop. Do **not** run `/sw:verify-dev` unless the user asks for it — mention in one line that it is available. Remind the user that `/sw:cleanup <slug>` drops the worktree, DB and Redis db once the PR to the base branch is merged.

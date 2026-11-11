# Changelog

## 0.5.1 — 2026-11-11
- `/sw:verify-dev` is opt-in: `/sw:ship` and `/sw:pr` stop after the PRs (`stage=done`) and never start it automatically; run it only when the user asks. Session-start hint, managed CLAUDE.md block, README, site and manifests updated.

## 0.5.0 — 2026-11-10
Fresh-eyes doc review (from google/elephant-goldfish-model).
- New `sw-goldfish` agent (Sonnet, read-only, fresh context): lenses comprehension, zoom-out, readiness, red-team, drift; replies with a paraphrase first.
- Plan red-team becomes goldfish lenses: small = one goldfish on design+plan before Gate 2; large = comprehension and zoom-out on the design, readiness and red-team on the plan, in parallel.
- Gate summary shows "Fresh reader" and a goldfish status (fixed/contested/escalated/declined/not run).
- `skills/review/references/resolve.md`: FIX/CONTEST/ESCALATE/DECLINE rules for any reviewer's findings.
- A failed parallel reviewer is retried once, then reported `not run`, never clean.
- New `/sw:drift`: one goldfish per spec vs current code, report-only to `.sw/drift/<date>.md`.
- `tests/agents.test.cjs` lints agent frontmatter.

## 0.4.0 — 2026-11-07
Parallel agents by default.
- Plan: tasks declare exact `Files` and `Depends`, grouped into `## Waves`; shared edits move to a serial foundation task so later tasks run concurrently. Red-team checks for same-wave file overlap.
- Build: every task of a wave is dispatched in ONE message (many `sw-implementer`s at once) for small and large plans; parallel lanes edit only their files and don't touch git, the orchestrator commits per task. Spec-checkers also fan out.
- `sw-implementer`: parallel mode (lane rules, reports changed files).
- Discover: one `sw-scout` per area plus researchers, all in one message.
- Verify: lint, typecheck and unit run concurrently; dev server boots in the background.
- Review: one reviewer per lens in parallel for large/multi-lens branches; llms.txt docs-writer runs alongside review.
- Ship: "parallel by default" rule for every stage.

## 0.3.0 — 2026-11-05
Faster flow, cheaper model routing.
- Architect interview batches up to 4 independent questions per prompt (≤ 3 prompts instead of ~10).
- Build: small plans go to one Sonnet `sw-implementer`; the main thread only orchestrates. Per-task `sw-spec-checker` runs only on `DONE_WITH_CONCERNS`.
- Tests: focused + touched-module tests per task; the full suite runs once, in verify.
- Review: Sonnet for small branches (1 re-review), Opus for large or security-sensitive ones.
- `sw-verifier` on Haiku for report-only runs; `sw-docs-writer` on Haiku for PR bodies.
- Agent `effort` pinned: low for scout/researcher, medium for implementer/verifier/docs-writer/spec-checker.
- Small-task verify skips build unless build config/deps/wiring changed, and Playwright unless frontend changed.

## 0.2.0 — 2026-10-29
- `sw:threat-model` skill: design-time STRIDE-lite threat model with abuse-case catalogue; `/sw:architect` runs it for large or security-sensitive tasks, `/sw:plan` turns mitigations into test-first tasks.
- Guard fix: the auth-bypass marker scan now runs from the repo root (it used to depend on the hook's cwd) and, inside the kit repo only, ignores the kit's own guard, script, test and guide files.
- `tests/skills.test.cjs` enforces skill description/length limits and reference links.

## 0.1.0 — 2026-10-23
First release.
- `/sw:ship` flow: triage → discover → architect (gate) → plan (gate) → worktree → build → verify → review → llms-txt → pr → verify-dev → cleanup.
- `wt.cjs`: worktrees with APFS-cloned `node_modules`, env subset, per-worktree Postgres DB (full or schema-only clone) and Redis db, free port.
- Guards: secret-read confirmation, heavy-dir search block, auth-bypass commit/push block.
- Changed-files coverage gate (lcov + Go), two-line statusline, installer with reversible CLAUDE.md block.
- Stack packs: node-backend, go, frontend; review lenses: security, performance.
- 8 `sw-*` agents with pinned models.

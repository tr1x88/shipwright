# Research: Shipwright turbo mode (speed)

## Current behavior
- `skills/ship/SKILL.md`: stages discover→architect⛔→plan⛔→worktree→build→verify→review→llms-txt→pr. Size triage tiny/small/large; flags `--tiny|--small|--large|--resume` in `argument-hint`. §4 pins Opus for designer/planner/goldfish/reviewer(large).
- `skills/architect/SKILL.md` §5 dispatches `sw-designer`; large adds 2 Opus goldfish (comprehension, zoom-out) + threat-model (§3b) before Gate 1. `skills/plan/SKILL.md` dispatches `sw-planner`, §3 goldfish (small: 1 Sonnet; large: 2 Opus), Gate 2.
- `agents/sw-designer.md`, `agents/sw-planner.md`: frontmatter `model: opus`, `effort: high`; tests/agents.test.cjs lints agent frontmatter.
- `bin/wt.cjs cmdCreate` (bin/wt.cjs:~250): `git worktree add`, `cloneDeps` already does `cp -cR` APFS clone → reflink → symlink fallback (bin/wt.cjs:~95), copies env, frees a port, ALWAYS runs `setupDb` (pg_dump|psql clone, schema-only >100MB) and `setupRedis`. `--no-db`, `--no-deps` flags exist; Redis has no off-switch. State written via `bin/lib/state.cjs` (`.sw-state.json`; `write(dir, patch)` merges and sets `updatedAt`). `wt.cjs remove` drops DB/Redis recorded in state.
- `bin/state.cjs set k=v` (numbers coerced, `null` clears); `bin/statusline.cjs` reads state.
- `skills/verify/SKILL.md`: 9-step pipeline; small skips build (unless config/deps/entry changed) and Playwright (unless frontend); no per-test scoping, integration always runs.
- tests: `npm test` = node --test tests/*.test.cjs, 138 pass at baseline; skills.test.cjs enforces SKILL.md ≤120 lines, description ≤220 chars, reference links resolve; wt.integration.test.cjs runs real `wt.cjs create/remove`.
- Versions in `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (all 0.6.0); `CHANGELOG.md`; README + `site/`.

## Touch points
skills/{ship,architect,plan,worktree,verify,review}/SKILL.md, agents/sw-{designer,planner}.md, bin/wt.cjs, bin/state.cjs, bin/lib/state.cjs, new scoped-verify helper in bin/, tests, CHANGELOG/README/manifests.

## Constraints
- SKILL.md ≤120 lines: ship/architect/plan are near the limit → put turbo detail in a new `skills/ship/references/turbo.md` (reference links are tested to resolve).
- Plugin install copies bin to `~/.claude/shipwright/bin`; scripts must stay dependency-free CJS, Node ≥20.
- Existing `--no-db` / `--no-deps` flags and `remove` semantics must keep working.

## Options seen
- Lazy provisioning: `wt.cjs create --lazy` skips DB+Redis; new `wt.cjs provision <slug> [--db] [--redis]` runs the same `setupDb`/`setupRedis` on demand and records them in state so `remove` cleans up.
- Scoped tests: Jest/Vitest `--findRelatedTests <files>` (or `vitest related`), `go test ./<changed pkgs>/...`; fall back to full suite when no mapping.

## Risks / unknowns
- User decision: turbo applies to ALL sizes with NO exceptions (skips goldfish + threat-model even for auth/payments). Trigger: explicit `--turbo` only.
- User decision: lazy DB driven by plan task field `Needs: db|redis|none`; scoped verify by changed-file paths with full-suite fallback.
- Scope misclassification in verify → missed regressions; mitigate with fallback + listing skipped steps in the PR.

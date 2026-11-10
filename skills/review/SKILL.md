---
name: review
description: Whole-branch review by sw-reviewer (Sonnet for small, Opus for large/security) against design and plan with security/performance lenses; fixes Critical/Important findings. Also how to receive feedback.
---

# Review

## Request (once per branch, after verify passes)
Dispatch `sw-reviewer` — model by size:
- **small** and no security lens → `model: sonnet` override; max 1 re-review cycle.
- **large**, or the security lens applies (auth, secrets, payments, untrusted input to SQL/files/URLs) → its pinned Opus; max 2 re-review cycles.

Inputs:
- worktree path, `BASE_SHA=$(git merge-base <base> HEAD)`, `HEAD_SHA=$(git rev-parse HEAD)`
- paths to `design.md` and `plan.md`
- which lenses apply (pass the reference paths only for those):
  - `${CLAUDE_PLUGIN_ROOT}/skills/review/references/security.md` — any endpoint, auth, input handling, file/URL/SQL handling, secrets
  - `${CLAUDE_PLUGIN_ROOT}/skills/review/references/performance.md` — DB queries, loops over I/O, caching, list endpoints, hot paths, frontend rendering
  - stack packs: `/sw:node-backend`, `/sw:go`, `/sw:frontend` references for the touched areas

**Parallel lenses (large, or ≥ 2 lenses apply):** dispatch one `sw-reviewer` per lens **in one message** — general (design/plan compliance, correctness; Opus), security (Opus), performance (`model: sonnet`) — each given only its lens reference. Merge and de-duplicate findings by file:line. Small with one lens → a single reviewer.
In the same message dispatch `sw-docs-writer` for `/sw:llms-txt` (worktree, base, changed endpoints) — docs don't wait for review; re-sync only if a review fix changes a client-facing contract.

It returns findings as `Critical | Important | Minor` with file:line, why, and a suggested fix.

## Act on findings
Classify and resolve every finding per [resolve.md](references/resolve.md) (FIX / CONTEST / ESCALATE / DECLINE).
- **Critical / Important** → fix now (TDD for behavior changes), re-run the affected verify steps.
- **Minor** → fix if trivial, otherwise list in the PR description under "Follow-ups".
- Re-review only the fixed areas (cycle cap above); then decide and record a Ruling.
- A lens reviewer that fails or returns nothing → retry once, then list it as `not run` in the PR body.

## Receiving feedback (from the reviewer, PR comments, or the user)
Follow [resolve.md](references/resolve.md): read fully, verify against the code, YAGNI-check, push back only with checkable evidence, no performative agreement.

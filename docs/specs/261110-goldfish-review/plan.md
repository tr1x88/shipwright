# Plan: Goldfish review of design and plan (Elephant-Goldfish Model ideas)
**Design:** docs/specs/<YYMMDD>-goldfish-review/design.md · **Size:** small · **Base:** main

## File map
- `tests/agents.test.cjs` — create: lint every `agents/*.md` frontmatter; sw-goldfish present and read-only
- `tests/skills.test.cjs` — modify: `drift` skill present
- `agents/sw-goldfish.md` — create: exact copy of the draft reviewed before Gate 2 (draft removed after copying, so the agent file is the single source)
- `skills/review/references/resolve.md` — create: how the author handles any reviewer's findings
- `skills/architect/SKILL.md` — modify: goldfish pass before Gate 1 (large) + gate-summary lines
- `skills/plan/SKILL.md` — modify: §3 red-team → goldfish pass (small and large) + gate-summary lines
- `skills/review/SKILL.md` — modify: link resolve.md from "Act on findings"/"Receiving feedback"; failed-lens rule
- `skills/ship/SKILL.md` — modify: §5 add failed-reviewer rule; fix duplicate "## 6." heading (Finish → 7); add `/sw:drift` mention is NOT needed (standalone skill)
- `skills/drift/SKILL.md` — create: `/sw:drift` audit
- `README.md`, `site/guide.html`, `site/index.html`, `docs/specs/design.md`, `CHANGELOG.md`, `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — modify: docs, counts (17 workflow skills + 3 stack packs — keep that text, 9 agents), version 0.5.0, credit EGM

## Tasks
### T1: Tests for agents + drift skill
- Files: `tests/agents.test.cjs` (create), `tests/skills.test.cjs` (modify)
- Depends: —
- Interface: `node --test`; reuse the `frontmatter()` parser style from skills.test.cjs. For each `agents/*.md`: `name` === basename, `description` present and ≤ 220 chars, `model` ∈ {haiku, sonnet, opus}, `tools` present. Plus `sw-goldfish exists and has no Edit/Write tool` (parse `tools` as comma list). skills.test: `test('drift skill is present', …)` next to the threat-model one.
- TDD: test-first
- Tests: `every agent: name matches file`, `every agent: description ≤ 220 chars`, `every agent: model pinned`, `sw-goldfish is present and read-only`, `drift skill is present`
- Done when: `npm test` red on exactly 2 tests — `sw-goldfish is present and read-only` and `drift skill is present`; the per-agent lint is green on the 8 existing agents (checked: all have description ≤ 220, model, tools)
- [ ] write failing test · [ ] run (red) · [ ] commit

### T2: sw-goldfish agent + resolve reference
- Files: `agents/sw-goldfish.md` (create), `skills/review/references/resolve.md` (create)
- Depends: T1
- Interface: agent = exact copy of the drafted file. resolve.md (≤ 45 lines) sections:
  1. *Classify every finding* — **FIX** (valid → edit the doc/code) · **CONTEST** (cite evidence the reviewer could read: `path:symbol` or a decision recorded in the doc) · **ESCALATE** (reviewer is wrong but the evidence is outside the files — team convention, verbal decision: before a gate it becomes a question for the user in the gate message; after Gate 2 decide and record a Ruling) · **DECLINE** (Nit, recorded, or fixed if trivial).
  2. *Rules* — a wish to contest is not evidence (you wrote the doc); never contest a comprehension gap — a fresh reader could not follow it, so the doc is missing context; don't add context only to satisfy a zero-context reviewer — if only the subagent needs it, ESCALATE/DECLINE; never change a severity — contest it with a reason; verify against code before changing anything; YAGNI-check "proper" suggestions (grep for callers); no performative agreement.
  3. *Failed reviewers* — timeout/error/empty reply ⇒ retry once; still failing ⇒ status `not run`, listed in the gate summary / PR body; never counted as zero findings.
  4. *Re-audit cap* — goldfish: re-run once per gate only if a Blocker was fixed; sw-reviewer: the cycle caps in review/SKILL.md.
  5. *Gate summary lines* — `Fresh reader: <paraphrase, 2–4 lines>` and `Goldfish: N fixed · N contested · N escalated · N declined · not run: <lenses|—>`, followed by escalated items as questions.
- TDD: none (docs) — T1 tests cover it
- Done when: `node --test tests/agents.test.cjs` green
- [ ] write · [ ] run (green) · [ ] commit

### T3: Wire architect, plan, review, ship
- Files: `skills/architect/SKILL.md`, `skills/plan/SKILL.md`, `skills/review/SKILL.md`, `skills/ship/SKILL.md` (modify)
- Depends: T1 (links resolve.md, which T2 creates in the same wave — the link is checked in verify)
- Interface:
  - architect: inside `## 5. design.md → Gate 1`, between the design.md template/"Small tasks" line and the "Show a ≤ 15-line summary" line, add a `**Goldfish (large only).**` paragraph: after writing design.md, dispatch in ONE message two `sw-goldfish` (`docs: design.md`, lenses `comprehension` and `zoom-out` — one agent each); pass no chat, no research.md. Resolve per `${CLAUDE_PLUGIN_ROOT}/skills/review/references/resolve.md`; add the two gate-summary lines. Small: skip (its single pass runs in /sw:plan).
  - plan: replace `## 3. Red-team (large only)` with `## 3. Goldfish review`: small → one `sw-goldfish` with `docs: design.md, plan.md`, `lenses: comprehension, readiness`; large → two in ONE message: `readiness` and `red-team` on `plan.md` (+ design.md as context). Resolve per resolve.md, note contests/escalations under Rulings; Gate 2 shows the summary lines and escalated questions.
  - review: in "Act on findings" and "Receiving feedback" point to resolve.md (keep the 5 numbered points short or replace with the link); add "a lens reviewer that fails → retry once, then `not run` in the PR body".
  - ship: §5 one sentence "A parallel agent that fails or returns nothing is retried once, then reported `not run` — never counted as a clean result."; rename second `## 6. Finish` → `## 7. Finish`; size table (line 22) `plan red-team` → `goldfish design/plan review`; stage table row 3 Gate text unchanged.
  - Every SKILL.md stays ≤ 120 lines; descriptions ≤ 220 chars (plan description may mention goldfish instead of red-team).
- TDD: none (docs) — skills.test limits
- Done when: `node --test tests/skills.test.cjs` green except `drift skill is present`; `grep -rn "red-team" skills` hits only the red-team *lens* name in plan/SKILL.md
- [ ] write · [ ] run · [ ] commit

### T4: /sw:drift skill
- Files: `skills/drift/SKILL.md` (create)
- Depends: T1
- Interface: frontmatter `name: drift`, description ≤ 220 chars (when to use: check shipped specs/design docs against the current code). Body: args `[dir]` default `docs/specs`; list spec folders (each `<YYMMDD>-<slug>/design.md` [+ plan.md]; also top-level `.md` design docs); dispatch one `sw-goldfish` per spec (`docs:` its design.md + plan.md, `lenses: drift`) — all in ONE message, batches of ≤ 8; failed → retry once → `not run`; write `.sw/drift/<YYYY-MM-DD>.md` with `## <spec>` + divergence bullets or `No drift detected`, plus a reviewer-status table; report-only — no code or doc edits; end with a ≤ 10-line chat summary and suggest `/sw:ship` for real gaps or updating the doc for `stale-doc`. Note that specs are point-in-time: a later spec superseding an earlier one is `stale-doc`, not a bug.
- TDD: none — T1 test
- Done when: `npm test` fully green
- [ ] write · [ ] run · [ ] commit

### T5: Docs + version 0.5.0
- Files: `README.md`, `site/guide.html`, `site/index.html`, `docs/specs/design.md`, `CHANGELOG.md`, `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
- Depends: T1
- Interface: version 0.4.0 → 0.5.0 in the three json files; CHANGELOG `## 0.5.0 — 2026-11-10` "Fresh-eyes doc review (from google/elephant-goldfish-model)" with bullets for sw-goldfish, plan red-team → goldfish lenses, resolve.md, failed-reviewer rule, /sw:drift, agents test. README: flow lines 2/3 mention goldfish, commands table add `/sw:drift`, plan row "goldfish-reviewed" instead of red-team, agents line add `sw-goldfish` (Sonnet), layout line skill/agent counts, credit EGM in the "merges" paragraph. site/guide.html: plan paragraph (line ~159) describes goldfish lenses instead of in-thread red-team; size table large row; agents table add sw-goldfish; commands list add drift if there is one. site/index.html line 83 "Reviewed by a fresh-context goldfish." docs/specs/design.md: add a short "v0.5 addendum" section rather than rewriting history.
- TDD: none
- Done when: `grep -rn "red-team" README.md site` hits only README:26 (historical ClaudeKit credit, keep) and mentions of the red-team *lens*; README:71, README:100, site/index.html:83, site/guide.html:121 and :159 are rewritten; `npm test` green
- [ ] write · [ ] commit

## Waves
- W1 (serial): T1 — tests first
- W2 (parallel): T2 ‖ T3 ‖ T4 ‖ T5 — disjoint files

## Verify
`npm test` (only check this repo has: no lint/typecheck/build/dev server) · `git diff --stat` sanity · dogfood: `sw-goldfish` run on this design+plan (done before Gate 2) · skill/agent line limits via tests

## Rulings
- Ruling: skip /sw:init — kit repo has no dev/prod domain or server — cost if wrong: none, nothing in the flow reads it here.
- Ruling: size small despite 4 skill edits — prose only, no runtime code, mirrors the precedent `docs/specs/261029-threat-model` (sized small) — cost if wrong: one review cycle on Sonnet instead of Opus.
- Ruling: drift as its own skill, not inside llms-txt — different audience (specs vs client docs) — cost: ~200 chars always-loaded.
- Ruling: goldfish dogfood on this plan — 8 Major / 3 Nit, all FIX (scoped test commands, concrete source path, architect insertion point, EGM terms defined, drift verdict in contract, ship:22 + grep allow-list) — 0 contested — cost: none.
- Ruling: review (Sonnet) — 0 Critical, 3 Important, 6 Minor; all FIX: absolute doc paths for goldfish, design re-approval note at Gate 2, drift moved out of the packs table into its own guide section, `**/research.md` exclusion, draft agent copy removed, drift scope/output path spelled out, user feedback ≠ reviewer finding, zoom-out in guide size row, description total measured (4,959 chars → "~5.0 K") — cost: none.

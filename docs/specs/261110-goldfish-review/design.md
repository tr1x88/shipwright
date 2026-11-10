# Design: Goldfish review of design and plan (from the Elephant-Goldfish Model)
**Terms:** *Elephant* = the main session that wrote the docs, with full chat context. *Goldfish* = a fresh subagent that sees only the docs, the files they link and the repo. Source: [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model) (EGM).

**Decision:** Add one read-only, fresh-context reviewer agent, `sw-goldfish` (Sonnet). It reviews `design.md` and `plan.md` before the gates using four lenses: comprehension, zoom-out, readiness and red-team. It sees only the documents, the files they link and the repo, never the conversation. Its paraphrase ("a fresh reader understood this as…") goes into the gate summary. The in-thread plan red-team becomes a goldfish lens. One shared rule set, `resolve.md`, governs how the author handles any reviewer's findings (goldfish, sw-reviewer, PR comments). A reviewer that fails is retried once, then reported as `not run`, never as clean. A new `/sw:drift` skill reuses the same agent to compare shipped specs with the current code.

## Decisions
- Scope: goldfish design/plan review + resolve discipline + failed-reviewer rule + drift audit (all four, per user).
- Small tasks: one goldfish (`lenses: comprehension, readiness`) on design.md + plan.md together, just before Gate 2 (user: "One Sonnet pass").
- Large tasks: before Gate 1, `comprehension` ‖ `zoom-out` on design.md. Before Gate 2, `readiness` ‖ `red-team` on plan.md. Each pair is dispatched in one message.
- Paraphrase is shown at the gate in 2–4 lines (user).
- Goldfish context = the target docs, the files they link, and read access to the repo. **Not** research.md or chat: they are the Elephant's notes, and the point is to test what the docs say on their own.
- Re-audit cap: re-run a goldfish at most once per gate, and only when a Blocker was fixed.
- Drift is a new skill `/sw:drift` (not inside llms-txt). llms-txt is about client-facing API docs, while drift compares design specs with code. Cost: one more always-loaded description (~200 chars).
- Model: `sw-goldfish` is pinned to Sonnet with medium effort. Doc review needs judgment, but not Opus.

## Contracts
**`agents/sw-goldfish.md`** with tools Read, Grep, Glob, Bash (no Edit/Write), `model: sonnet`, `effort: medium`.
Input: `docs:` paths · `lenses:` subset of {comprehension, zoom-out, readiness, red-team, drift} · optional `context:` extra file paths.
Reply (≤ 40 lines):
```
Paraphrase
- Proposes: <2–4 sentences>
- System today (per the doc): <1–3 sentences>
Findings
- [Blocker|Major|Nit] <lens> <doc>:<section|line> — <gap> — <recommendation>
Verdict: ready | fix Blockers first      (drift lens: N divergences | No drift detected; no Paraphrase)
```
Lens checks: *comprehension* (paraphrase first, so an unparaphrasable section is a Blocker; undefined project terms; assumed prerequisites; vague "handles it automatically" claims), *zoom-out* (YAGNI; reuse verified by grep with the hit cited; symptom vs root problem; premature optimisation), *readiness* (could a stranger implement each task from the plan alone: files exist or are clearly new, interfaces exact, tests named, Done-when command real, Depends/waves consistent, no same-wave file overlap, every design contract covered by a task), *red-team* (Breaker / Operator / Skeptic from the old in-thread red-team), *drift* (doc vs code divergences only: missing, diverged, stale doc).

**`skills/review/references/resolve.md`** (shared). Classify each finding:
- FIX: valid, so apply it.
- CONTEST: cite evidence the reviewer could read (file:symbol or a decision recorded in the doc).
- ESCALATE: evidence lives outside the docs (convention, verbal decision), so ask the user at the next gate, or record it as a Ruling after Gate 2.
- DECLINE: a Nit, recorded.

Rules: a wish to contest is not evidence. Never contest a comprehension gap. Don't add context only to satisfy a zero-context reviewer. Don't change severity. A failed reviewer is retried once and then counts as `not run`.

**Gate summary additions:** `Fresh reader: <paraphrase>` · `Goldfish: N fixed · N contested · N escalated (questions below) · N declined · lenses not run: …`.

**`/sw:drift [dir=docs/specs]`**: one `sw-goldfish` (lens drift) per spec folder (`<YYMMDD>-<slug>/`) and per top-level design `.md` in that dir, dispatched in batches in one message. It writes `.sw/drift/<YYYY-MM-DD>.md` with `## <spec>` followed by divergences or "No drift detected". It is report-only.

## Test strategy
- `tests/agents.test.cjs` (new): every `agents/*.md` has name = filename, description ≤ 220, model and tools. `sw-goldfish` exists and has no Edit/Write tool.
- `tests/skills.test.cjs`: `drift` skill present. Existing limits (≤ 120 lines, ≤ 220-char description, references resolve) keep the edited skills honest.
- `npm test` green. Then dogfood: run `sw-goldfish` on this design + plan before Gate 2.

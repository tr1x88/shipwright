# Research: apply Elephant-Goldfish Model (EGM) ideas to Shipwright

Source: google/elephant-goldfish-model (Apache-2.0), cloned and read: README, skills/egm-review, egm-resolve, egm-drift-report, agents/{comprehension,zoom_out,synthesizer,implementation_readiness}.

## EGM in one paragraph
The **Elephant** (main session) holds the project context and writes the spec. **Goldfish** reviewers are fresh subagents that get only the document and the files it links to, never the conversation. Because of that they expose assumptions the author never wrote down. The user resolves the trade-offs. If the harness can't spawn a fresh context, the review stops: "a review in the same context is not a Goldfish review".

## Ideas worth adopting
1. **Fresh-context doc review.** Shipwright reviews design and plan *in-thread* (the plan's red-team is the author re-reading its own plan, which is exactly what EGM argues against). Code review (`sw-reviewer`) is already fresh-context.
2. **Paraphrase first (comprehension lens).** The reviewer first states in its own words what the doc proposes and how the system works today. A wrong paraphrase is itself a finding, and it is a cheap alignment check to show the user at the gate.
3. **Zoom-out lens.** YAGNI, reuse verified by **actual code search**, root problem vs symptom, altitude drops.
4. **Implementation-readiness lens.** Could a stranger build the plan from the plan alone (exact files, interfaces, tests, ordering)?
5. **Resolve discipline.** The author classifies each finding as PROPOSE FIX, CONTEST, ESCALATE or DECLINE. A contest must cite evidence the reviewer could read. "A wish to contest is not evidence." Never contest a comprehension gap. Don't add context only to satisfy a zero-context reviewer. Don't change severity. ESCALATE when the evidence is outside the reviewer's reach (team convention, verbal decision), and that goes to the user.
6. **A failed reviewer ≠ zero findings.** Retry once, then mark it `not run`. Never count a missing report as clean.
7. **1 re-audit cap** per stage (Shipwright already caps review cycles).
8. **Drift report.** Compare checked-in design docs with the current code and report only divergences.

## Not adopting
One-question-at-a-time gates (Shipwright deliberately batches ≤4), 5-stage interactive review with checkpoints (conflicts with the "2 gates, then run" principle), synthesizer-of-synthesizers nesting (Claude Code can't nest subagents; the main thread merges), and multi-harness distribution.

## Code map (Shipwright)
- `skills/architect/SKILL.md` §5: design.md → Gate 1 (no review today)
- `skills/plan/SKILL.md` §3: in-thread red-team (large only) → Gate 2
- `skills/review/SKILL.md`: parallel lens reviewers + "Receiving feedback"
- `agents/sw-*.md`: pinned model/effort frontmatter pattern
- `tests/skills.test.cjs`: skill limits (≤120 lines, desc ≤220 chars)
- Docs to sync: README.md, site/guide.html, site/index.html, docs/specs/design.md, CHANGELOG.md, version files (0.4.0 → 0.5.0)

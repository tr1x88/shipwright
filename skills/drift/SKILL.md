---
name: drift
description: Use to check shipped specs and design docs against the current code. Finds missing, diverged and stale-doc gaps with fresh-context reviewers. Report-only.
argument-hint: "[dir]"
---

# Drift

Specs are point-in-time. Report where docs and code disagree; never edit code or docs.

1. **List specs** in `[dir]` (default `docs/specs`): each `<YYMMDD>-<slug>/` folder (`design.md` + `plan.md` if present) and each top-level `.md` in `[dir]` whose title starts with `# Design` or that has a `## Decisions` section. None found → say so and stop.
2. **Dispatch** one `sw-goldfish` per spec: `docs:` its design.md (+ plan.md), `lenses: drift`. Send each batch of ≤ 8 in ONE message, parallel, and wait for all of them.
3. **Failures:** a reviewer that errors or returns no `Verdict:` line → retry once, then mark `not run`, never clean. See `${CLAUDE_PLUGIN_ROOT}/skills/review/references/resolve.md` §3.
4. **Classify** each divergence:
   - `missing`: the doc promises something the code lacks.
   - `diverged`: the code does it differently.
   - `stale-doc`: a later spec superseded this one, or the code legitimately moved on. This is not a bug.
5. **Write** `<repo root>/.sw/drift/<YYYY-MM-DD>.md` (the checkout you ran it in; `.sw/` is git-excluded) (append if it exists for that day):
   - a reviewer-status table: `| spec | status |` with `ran` or `not run`;
   - one `## <spec>` section each: divergence bullets (`[kind] doc:section — gap — evidence file:line`) or `No drift detected`.
6. **Summarise in chat** in ≤ 10 lines: counts per spec and per kind, specs `not run`, and the report path. Suggest `/sw:ship` for `missing` or `diverged` gaps, and updating the doc for `stale-doc`.

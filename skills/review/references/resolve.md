# Resolving reviewer findings

Applies to every reviewer: `sw-goldfish` (design/plan), `sw-reviewer` (code), PR comments. Feedback from the user is a decision, not a finding: apply it, or explain the trade-off once and let them choose. You are the Elephant — you wrote what is under review, so your urge to defend it is not evidence. Adapted from the [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model).

## 1. Classify every finding (exactly one)
| Class | When | Action |
|---|---|---|
| **FIX** | The finding is valid | Edit the doc/code; behavior changes go test-first |
| **CONTEST** | The reviewer is wrong, and you can cite evidence it could read: `path:symbol`, or a decision recorded in the doc | No change; record the evidence |
| **ESCALATE** | The reviewer is wrong, but the evidence lives outside the files (team convention, a verbal decision, an external constraint) | Before a gate: ask the user in the gate message. After Gate 2: decide, record a Ruling |
| **DECLINE** | Nit not worth the churn | Record it (PR "Follow-ups" for code); fix instead if trivial |

## 2. Rules
- **A contest must be checkable.** "This was intentional" is not evidence. No citable evidence → FIX or ESCALATE.
- **Never contest a comprehension gap.** If a fresh reader could not follow it, the doc is missing context — add it.
- **Don't add context only to satisfy a zero-context reviewer.** Add it when a human reader (implementer, future maintainer) needs it; if only the subagent does, ESCALATE or DECLINE.
- **Never change a severity.** Disagree with a Blocker? CONTEST it and say why.
- **Unclear finding?** Restate the technical requirement in your own words; ask rather than guess.
- **Verify before changing.** Check the claim against the code; reviewers can misread context.
- **YAGNI-check "do it properly" suggestions.** `grep` for callers before building the proper version.
- **No performative agreement** ("Great catch!"). State what changed, or why not.

## 3. Failed reviewers
A reviewer that times out, errors, or returns nothing **did not review**. Retry it once; still failing → status `not run`, listed in the gate summary (or PR body). Never count it as zero findings.

## 4. Re-audit cap
- Goldfish: re-run at most once per gate, and only if a Blocker was fixed.
- `sw-reviewer`: the cycle caps in `review/SKILL.md`.

## 5. Gate summary lines (architect Gate 1, plan Gate 2)
```
Fresh reader: <the goldfish paraphrase, 2–4 lines — the user compares it with their intent>
Goldfish: N fixed · N contested · N escalated · N declined · not run: <lenses | —>
```
Then each ESCALATE item as a question for the user (batch them into the gate's AskUserQuestion when possible).

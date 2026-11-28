---
name: architect
description: Design stage — interviews the user in batches of up to 4 questions on the architecture decisions the task touches, compares approaches, writes design.md for approval.
---

# Architect

You build what you believe the user wants, and that belief is usually thinner than it feels. This stage makes the hundred small decisions explicit while they are cheap. The main thread runs the interview and the gate. **Small tasks stop after §4**: no design.md, no Gate 1 — hand the answers and the chosen approach to `/sw:plan`, whose single document carries the decisions and the tasks behind one gate. Large tasks write design.md (§5).

**Turbo (`--turbo`):** follow `${CLAUDE_PLUGIN_ROOT}/skills/ship/references/turbo.md` §2–4 instead — §1–2 as below, §3 capped at ONE batch of ≤ 4 questions, no §3b, §4 in one message, then one `sw-designer` (`model: sonnet`) writes spec.md; no §5 goldfish.

## 1. Read before asking
Read `research.md` and the code it points to. Never ask what the code, the research or earlier conversation already answers.

## 2. Echo (one short message)
In ≤ 150 words: what you understood (what, for whom, why), how it works today, and anything found that changes the request (a constraint, a conflict, a cheaper path).

## 3. Interview — up to 4 questions per AskUserQuestion call
Walk this checklist; ask ONLY items the task touches and the code does not settle. Soft cap ~10 questions (small tasks: 2–4, i.e. one call). Batch independent questions into one call (max 4); put a question in a later call only when its options depend on an earlier answer. Aim for ≤ 2 calls total. When there is a real choice of approach (§4), it is the FIRST question of the first call — never a separate round trip. Each question: the concrete choice, a recommended option first ("(Recommended)"), and in each option's description what it changes in the build.

| Area | Typical question |
|---|---|
| Data model & migration | new table vs column; nullable + backfill plan; migration order vs deploy; index for the new query |
| API contract | new endpoint vs extend; versioning; backward compatibility for existing clients; pagination shape; error codes |
| Consistency | what must be atomic (transaction boundary); outbox/eventual for cross-service |
| Idempotency & retries | idempotency key? what happens on double submit / webhook redelivery |
| Concurrency | race on the same row/resource (lock, version column, atomic update, unique constraint) |
| Cache | what is cached, key, TTL, invalidation trigger, stampede protection |
| AuthZ & data exposure | who may call it; ownership checks; fields never returned |
| Failure modes | external call timeouts, partial failure, fallback, user-visible error |
| Performance | expected volume, N+1 risk, payload size, hot path |
| Observability | logs/metrics that prove it works in dev/prod |
| Rollout | feature flag, migration safety, rollback path |
| Frontend (if any) | states (loading/empty/error), optimistic update, accessibility, responsive targets |

## 3b. Threat model
If the `/sw:threat-model` trigger list matches (large task, auth, money, uploads, secrets/PII, external input, new boundary), run it after the interview and keep its output as `## Threat model` in design.md. Otherwise skip.

## 4. Approaches (inside the interview)
Only when 2–3 genuinely different approaches exist: ask it as the first AskUserQuestion of the first call — one option per approach, recommended first, the description giving how it works and its trade-off (complexity, performance, risk, effort); use `preview` for a sketch when shapes differ. One obvious approach → state it in the echo and don't ask.

## 5. design.md → Gate 1 (large only)
Write `$SPEC/design.md` (serves as the ADR) — yourself when the session model is Opus class or stronger, otherwise dispatch `sw-designer` (pinned Opus; brief: task, research.md path, answers with their why, chosen approach, threat model, output path) and relay any `Open questions` it returns before Gate 1. See `/sw:ship` §4. Template:
```markdown
# Design: <task>
**Decision:** <one paragraph>
## Context            (problem, constraints from research)
## Decisions          (one line per answered question: choice — why)
## Contracts          (endpoints/DTOs/events/UI states with shapes and error codes)
## Data changes       (schema, migration, backfill, indexes)
## Rejected options   (option — why not)
## Risks & rollout    (risk → mitigation; flag/rollback)
## Threat model       (only when /sw:threat-model ran: threats TM1…, mitigations, tests, residual risks)
## Test strategy      (unit: domain rules; integration: endpoints + DB; e2e/Playwright: flows; what proves done)
```
**Goldfish.** After writing design.md, dispatch in ONE message two `sw-goldfish` (pinned Opus; `docs:` the absolute path of design.md; lenses `comprehension` and `zoom-out`, one agent each). Give them no chat history and no research.md. Resolve findings per `${CLAUDE_PLUGIN_ROOT}/skills/review/references/resolve.md`; add its two gate-summary lines (Fresh reader, Goldfish) to the summary and put escalated questions in the approval ask.

Show a ≤ 15-line summary and ask for approval. ⛔ Do not plan until approved; apply requested changes and re-ask.

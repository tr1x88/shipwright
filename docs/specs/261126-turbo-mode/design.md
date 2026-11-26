# Design: turbo mode (speed up /sw:ship)

**Decision:** Add an opt-in `--turbo` flag to `/sw:ship` that applies to every size with no exceptions. Turbo replaces architect + plan with one `spec` stage: architect §1–4 (read, echo, a capped interview, approaches), then ONE `sw-designer` call (`model: sonnet`, with a medium-effort note in the brief) that writes `spec.md` (design + file map + tasks + waves + verify). That is one gate, which plays the role of Gate 2. Turbo skips goldfish and the threat model. Only the non-size threat-model triggers produce a one-line notice. Each task declares `Needs: db | none`, and the orchestrator reads the approved spec to call the existing `wt.cjs create … [--no-db]`. `wt.cjs` itself does not change. A new dependency-free `bin/scope.cjs` selects verify steps and related tests from changed paths. It shares one classifier, `bin/lib/changed.cjs`, with `coverage-changed.cjs`, and becomes the single step-selection rule for tiny and small tasks in every mode and for every size under turbo. Turbo review is the existing small review path (Sonnet, at most one re-review cycle) at any size, capped to one lens. Every mode records per-stage timestamps, and `/sw:ship` prints a timings table at the finish. Turbo detail lives in `skills/ship/references/turbo.md`. Each stage skill gets a one-line pointer to it.

## Context
- Today's flow is discover → architect ⛔ → plan ⛔ → worktree → build → verify → review → llms-txt → pr (`skills/ship/SKILL.md` §2).
  - Large tasks add 2 Opus goldfish on the design (`skills/architect/SKILL.md` §5), the threat model (§3b), 2 Opus goldfish on the plan (`skills/plan/SKILL.md` §3), an Opus multi-lens review (`skills/review/SKILL.md`) and the full verify pipeline (`skills/verify/SKILL.md`).
  - Small tasks still get a Sonnet goldfish and two gates.
- `bin/wt.cjs`:
  - `cmdCreate` (l.249) runs `setupDb` (l.148, a pg_dump|psql clone) unless `--no-db`, and always runs `setupRedis` (l.200: a `dbsize` loop plus an env rewrite, milliseconds).
  - `cloneDeps` (l.89) does an APFS clone. A measured `cp -cR` of a 2.1GB node_modules with 41,622 files took 7.6s.
  - With `--no-db`, the worktree env files keep the main checkout's DB URLs, because nothing is rewritten.
- `bin/coverage-changed.cjs:19-25` defines `SOURCE`, `TEST`, the merge-base and the `git diff --name-only --diff-filter=AM <mergeBase>` change list. `scope.cjs` needs the same facts, so they move to a shared lib.
- State:
  - `bin/lib/state.cjs` `write(dir, patch)` shallow-merges the patch and stamps `updatedAt`.
  - `bin/state.cjs set` coerces only digits and `null`.
  - State lives in the main checkout until the worktree exists. `wt.cjs create` then writes `{…, stage:'worktree', mainRoot}` to a fresh worktree state file, and `/sw:worktree` §3 runs `state.cjs clear` in main.
- Constraints:
  - SKILL.md ≤120 lines and description ≤220 chars (`tests/skills.test.cjs`). Line counts today: ship 69, plan 69, architect 58, verify 57, build 55, worktree 39, review 34.
  - `bin/` is copied wholesale to `~/.claude/shipwright/bin` (`bin/session-start.cjs:21`).
  - Dependency-free CJS, Node ≥20.
  - `tests/agents.test.cjs` asserts that designer and planner stay `model: opus`.
- Timings ship in the same release as turbo because they are additive. Turbo's skips (goldfish, threat model, the second gate) remove known work that needs no measurement to justify.

## Decisions
1. **Turbo scope: any size, no exceptions.** The user chose this explicitly over the recommended small-only option. Turbo skips goldfish (design and plan) and `/sw:threat-model` on every size. Accepted risk: auth, payment and upload tasks lose their design-time threat review.
   - Mitigation (a notice, not an exception): when a non-size trigger from `/sw:threat-model` §1 matches, turbo prints `turbo: threat-model trigger matched (<trigger>) — skipped by --turbo` at the gate, records the same line as a Ruling in spec.md (which carries it into the PR body), and selects the security review lens.
   - Non-size triggers: authn/authz/tenancy, money, files/URLs/untrusted input, secrets/PII, new trust boundary. "Size is large" on its own does not fire the notice.
2. **Trigger: only when the user types `--turbo`.** No default changes. It combines with `--tiny|--small|--large|--resume`.
3. **Worktree DB from `Needs:`.** The interview answer was "lazy DB/Redis via `wt.cjs create --lazy` + `wt.cjs provision`". The goldfish revision simplified it, pending user confirmation (Q-C).
   - Each turbo task declares `Needs: db | none`.
   - The spec is approved before `wt create` runs, so the orchestrator decides at create time: no task declares `Needs: db` and the spec has no `## Data changes` → `wt.cjs create … --no-db` (existing flag). Otherwise create as today.
   - Redis stays eager. `wt.cjs` is unchanged, and `--no-db`, `--no-deps` and `remove` keep their current semantics.
4. **Scoped verify.** Steps are chosen from changed-file paths, with the full suite when the repo can't be mapped. A new `bin/scope.cjs` prints `{steps, relatedTests}`:
   - Unit runs related tests only (jest `--findRelatedTests`, `vitest related`, `go test` per changed package).
   - Integration runs only when endpoints, DB, migrations or handlers changed.
   - Build runs only when config, deps or entry files changed.
   - Playwright runs only when frontend files changed.
   - The dev server runs only when endpoint, build or frontend files changed.
   - Skipped steps are listed as `skipped — <reason>` and carried into the PR body.
   - Under Q-A (recommended default), `scope.cjs` is the single step-selection implementation for tiny and small tasks in every mode and for every size under turbo. Large non-turbo keeps the full pipeline. For tiny tasks, verify's tiny rule (steps 1–3 on the touched area, plus 8 if an endpoint changed) wins, and `scope.cjs` only supplies the related-test command.
5. **Shared classifier.** New `bin/lib/changed.cjs` owns the merge-base, the changed-file list, and the `SOURCE` and test patterns. Both `coverage-changed.cjs` and `scope.cjs` use it, and `scope.cjs` adds only the areas endpoint, db, build and frontend.
6. **One planning document.** The turbo `spec` stage is architect §1–4, then ONE `sw-designer` Agent call with `model: sonnet` writing `spec.md`.
   - The brief carries `Effort: medium`, because the Agent tool has no effort override. Agent files keep `opus`/`high`.
   - `sw-designer` rather than `sw-planner`, because only the designer is briefed with the interview answers.
   - The spec gate plays Gate 2: "run continuously" (ship §3) starts after it.
   - Under Q-B (recommended default), the interview is capped at ONE AskUserQuestion batch of ≤4 questions, and discover is code-only (no `sw-researcher`) at every size.
7. **Turbo review.** The existing small review path (`review/SKILL.md`: `sw-reviewer` with `model: sonnet`, at most one re-review cycle) at any size, capped to one lens. The lens is security if a non-size threat-model trigger matched, else performance if `scope.cjs` areas `db` or `endpoint` are non-empty, else general (design compliance and correctness only).
8. **Timings in every mode.** `state.cjs set stage=X` appends `{stage, at}` to `stages[]`, `state.cjs timings` prints per-stage durations, and `/sw:ship` §7 sets `stage=done` and then prints the table.
9. **Packaging.** Version 0.6.0 → 0.7.0 in `package.json`, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (`metadata.version`). Add a CHANGELOG entry, a README mention (the `/sw:ship` row, a flow note) and a mention in the `site/guide.html` ship section.

Derived (implementation choices inside the decisions above):
- D-a: The stage-append logic lives in `bin/lib/state.cjs write()`. When a write creates a new state file and the patch carries `mainRoot`, it first seeds `stages` and `turbo` from `read(mainRoot)`. `wt.cjs` already passes `mainRoot`, so the discover and spec timings survive the move with no `wt.cjs` change.
- D-b: `--resume` reads `turbo` from state, and `state.cjs set` gains `true`/`false` coercion.

## Contracts

### `/sw:ship` flags and flow
`argument-hint: "<task> [--tiny|--small|--large] [--turbo] [--resume]"`. The main thread runs `state.cjs set turbo=true` at triage.

| Size | Turbo flow |
|---|---|
| tiny | Unchanged stages (no design, goldfish or threat model today). Verify uses the tiny rule plus the `scope.cjs` related-test command. |
| small / large | discover (code only) → **spec ⛔**: architect §1 read, §2 echo, §3 interview (1 batch, ≤4 questions), §4 approaches, then 1 `sw-designer` call (`model: sonnet`) → spec.md → gate (= Gate 2) → worktree (`--no-db` per §5) → build → verify (scope.cjs) → review (1 Sonnet, 1 lens, ≤1 cycle) ‖ llms-txt → pr → timings |

Stage names written to state in turbo: `discover, spec, worktree, build, verify, review, llms-txt, pr, done`. Non-turbo keeps `architect` and `plan`.

`skills/ship/SKILL.md` gets one line each for the triage flag, a "Turbo: follow [turbo.md](references/turbo.md)" pointer, a §4 model-routing exception, and §7 timings. Stage skills get one pointer line each, to `${CLAUDE_PLUGIN_ROOT}/skills/ship/references/turbo.md`:

| Skill | turbo.md § |
|---|---|
| architect, plan | §2–4 |
| worktree | §5 |
| build | §6 |
| verify | §7 |
| review | §8 |
| pr | §9 |

Ship links §1 directly.

### `skills/ship/references/turbo.md` (new, ≤120 lines)
- §1 **Skips and the notice.** No goldfish and no threat model at any size. The exact notice line fires on non-size triggers only and is recorded as a Ruling.
- §2 **Spec stage.** Architect §1–4 with the caps: discover code-only, one interview batch of ≤4, approaches in one message.
- §3 **`sw-designer` brief.** `model: sonnet`; `Effort: medium — one pass, no exhaustive alternatives`; output `<main>/.sw/specs/<slug>/spec.md`. Template:
  ```markdown
  # Spec: <task>   (turbo)
  **Size:** small|large · **Base:** <branch>
  **Decision:** <one paragraph>
  ## Decisions        (answer — why)
  ## Contracts        (shapes, error codes, limits)
  ## Data changes     (omit when none — its presence forces a worktree DB)
  ## Test strategy
  ## File map
  ## Tasks            (plan template fields + `- Needs: db | none`)
  ## Waves
  ## Verify
  ## Rulings          (threat-model notice line goes here when a non-size trigger matched)
  ```
- §4 **Gate (= Gate 2).** Show the decisions (one line each), the tasks (one line each), the waves, the verify plan, the threat-model notice if any, and `Turbo: no goldfish, no threat model, Sonnet review`. ⛔ Wait for approval, then run continuously.
- §5 **Worktree.** No task has `Needs: db` and there is no `## Data changes` → `wt.cjs create <slug> --prefix <p> --size <s> --no-db`. Otherwise use today's command. Record `Ruling: worktree without DB — no task needs db`.
- §6 **Build.** Briefs come from spec.md, and Rulings are appended to spec.md. With `--no-db`, every brief carries `No worktree DB: do not run integration suites, migrations or seeds; stop with NEEDS_CONTEXT if the task needs them.`
- §7 **Verify.**
  - Run `node $SW/scope.cjs --base <base>` and follow `steps`.
  - **No-DB guard.** If state `db` is null, scope has `integration`, `smoke` or `devServer` with `run: true`, and a worktree env file holds a Postgres URL (`DATABASE_URL|POSTGRES_URL|DB_URL|PG_URL`), STOP before those steps, because they would hit the main checkout's DB. Recovery:
    1. Commit any pending work.
    2. `cp <wt>/.sw-state.json <main>/.sw-state.json`.
    3. `wt.cjs remove <slug> --no-branch`.
    4. `wt.cjs create <slug> --prefix <p> --size <s>` (with DB). The branch exists, so it is checked out, and stages re-seed per D-a.
    5. `state.cjs clear` in main.
    6. Record a Ruling and resume verify from step 1.
  - If related unit tests report "No tests found", run the full unit suite. Never pass `--passWithNoTests`.
- §8 **Review.** Decision 7 lens rule. Pass only that lens's reference path.
- §9 **PR body.** Skipped steps go under Verification. The turbo line goes under Rulings.

### `bin/lib/changed.cjs` (new)
```js
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|go|vue|svelte)$/;                       // moved verbatim
const TEST_FILE = /(\.(spec|test|e2e-spec)\.[jt]sx?$|_test\.go$|\/(__tests__|test|tests|e2e)\/)/;
const NOT_COVERED = /(\.d\.ts$|\.(config|setup)\.[jt]s$|\/migrations?\/|\/dto\/|\.dto\.ts$|\.module\.ts$|main\.ts$)/;
// TEST_FILE ∪ NOT_COVERED === today's coverage-changed TEST regex, alternative for alternative.
mergeBase(top, base) → sha                 // throws when base is unknown
changedFiles(top, base, { diffFilter = null, committed = false }) → string[]
//   committed=false: git diff --name-only [--diff-filter=X] <mergeBase>        (coverage-changed today: diffFilter 'AM')
//   committed=true:  git diff --name-only [--diff-filter=X] <mergeBase> HEAD   (≡ <base>...HEAD; scope.cjs)
isCoverageTarget(f) → SOURCE && !TEST_FILE && !NOT_COVERED
```
`coverage-changed.cjs` replaces l.19-25 with `changedFiles(top, base, {diffFilter:'AM'}).filter(isCoverageTarget)`. Its output and exit codes are unchanged.

### `bin/scope.cjs` (new)
```
scope.cjs --base <branch>      # cwd inside the worktree
```
stdout JSON, exit 0:
```json
{
  "base": "main", "mergeBase": "<sha>", "mapped": true, "runner": "jest|vitest|go|null",
  "changed": ["src/orders/refund.service.ts"],
  "areas": { "source": [], "tests": [], "endpoint": [], "db": [], "build": [], "frontend": [] },
  "relatedTests": ["src/orders/refund.service.ts"],
  "steps": {
    "lint":        { "run": true },
    "typecheck":   { "run": true },
    "unit":        { "run": true, "mode": "related|full", "command": "npx jest --findRelatedTests src/orders/refund.service.ts" },
    "integration": { "run": false, "reason": "no endpoint/DB/migration/handler changes" },
    "coverage":    { "run": true },
    "build":       { "run": false, "reason": "no config/deps/entry changes" },
    "devServer":   { "run": false, "reason": "no endpoint/build/frontend changes" },
    "smoke":       { "run": false, "reason": "no endpoint changes" },
    "playwright":  { "run": false, "reason": "no frontend files changed" }
  }
}
```
Errors: not a git repo, missing `--base`, or an unknown base → exit 1 `{"error":"..."}`. Verify treats any non-zero exit as "run the full pipeline".

`changed = changedFiles(top, base, {committed:true})` minus `docs/specs/**`. Deleted files count toward areas but are dropped from `relatedTests`.

Areas: a file joins every area whose patterns it matches.
| Area | Source of truth |
|---|---|
| source | `changed.SOURCE` and not `changed.TEST_FILE` |
| tests | `changed.TEST_FILE` |
| endpoint | `\.(controller\|resolver\|gateway\|handler\|routes?)\.[jt]s$`, `(^\|/)app/.*route\.[jt]s$`, `/(controllers\|handlers\|routes)/`, `_handler\.go$`, `/(http\|api)/.*\.go$` |
| db | `schema\.prisma$`, `/migrations?/`, `\.sql$`, `\.(repository\|entity\|model)\.[jt]s$`, `/(repository\|store\|db)/.*\.go$` |
| build | `package\.json$`, `package-lock\.json`, `pnpm-lock\.yaml`, `yarn\.lock`, `bun\.lockb`, `tsconfig.*\.json$`, `\.config\.(js\|ts\|mjs\|cjs)$`, `nest-cli\.json`, `Dockerfile`, `go\.(mod\|sum)$`, `(^\|/)main\.(ts\|go)$`, `\.module\.ts$` |
| frontend | `\.(tsx\|jsx\|vue\|svelte\|css\|scss\|sass\|less\|html)$` |

Runner detection happens at the repo root only:
- `go.mod` → `go`.
- A `package.json` naming `vitest` in `scripts.test` or dependencies → `vitest`, else `jest`.
- Unmapped (`mapped:false`; every step `run:true`, unit `mode: full`) when no runner is found, or there are root `workspaces`/`pnpm-workspace.yaml` and no root runner.

Rules when mapped:
| Step | Run iff |
|---|---|
| lint, typecheck | Always. |
| unit | `full` if build is non-empty. `related` if source or tests is non-empty. Otherwise skip. |
| related args | jest: `npx jest --findRelatedTests <files>`. vitest: `npx vitest related --run <files>`. go: `go test ./<dir> …` (unique dirs of changed `.go` files). |
| integration | endpoint ∪ db non-empty |
| coverage | unit runs and source is non-empty |
| build | build non-empty |
| devServer | endpoint ∪ build ∪ frontend non-empty |
| smoke | endpoint non-empty |
| playwright | frontend non-empty |

`skills/verify/SKILL.md` l.27–28 (the tiny and small rules) is replaced by these rules:
- Tiny, small, and any size under turbo: run `scope.cjs` and follow `steps`.
- Tiny: the tiny rule still bounds the steps, and scope only gives the related-test command.
- Large non-turbo: full pipeline.

### `bin/state.cjs` and `bin/lib/state.cjs`
- `write(dir, patch)`:
  - When creating a new file and `patch.mainRoot` is set, first seed `{stages, turbo}` from `read(patch.mainRoot)` (D-a).
  - Then, when `patch.stage` is present and differs from the last `stages[]` entry, append `{stage, at: <ISO now>}`. Consecutive duplicates are skipped, but re-entering a stage later appends.
- `state.cjs set`: `true`/`false` become booleans, and digits and `null` behave as before.
- `state.cjs timings`: rows in order, `duration = next.at − at`. The last stage, if it is not `done`, runs until now and is marked `(running)`. `done` gets no row and ends the total. With no stages it prints `no stage timings recorded` and exits 0.
  ```
  stage      started               duration
  discover   2026-11-26T10:00:03Z  3m12s
  spec       2026-11-26T10:03:15Z  6m40s
  ...
  total                            41m05s
  ```

### PR body (`skills/pr/SKILL.md` §4)
`## Verification` lists each skipped step as `<step>: skipped — <reason>`. In turbo, `## Rulings & follow-ups` opens with `Turbo: no goldfish, no threat model[, trigger matched: <trigger>], single Sonnet review (<lens>)`.

## Data changes
No database. `.sw-state.json` (git-excluded) gains these fields:
| Field | Type | Writer | Reader |
|---|---|---|---|
| `stages` | `[{stage: string, at: ISO string}]` | `lib/state.write` (every `set stage=` and `wt create`) | `state.cjs timings` |
| `turbo` | boolean | `state.cjs set turbo=true` at triage; seeded into the worktree per D-a | `--resume`, stage skills |

Old state files without these fields still work (a missing `stages` is treated as `[]`). No migration.

## Rejected options
- **Turbo for small tasks only** (the recommendation in the interview). The user rejected it: any size, no exceptions.
- **Making turbo the default for some sizes.** The user rejected it: explicit `--turbo` only.
- **Lazy `wt.cjs create --lazy` + `wt.cjs provision` + `pending` state.** The spec with every `Needs:` is approved before `wt create`, so the existing `--no-db` gives the same speed without a new command, new state or new cleanup paths.
- **Making Redis lazy.** `setupRedis` takes milliseconds, so there is nothing to save.
- **`--deps symlink` / `Needs: deps`.** A measured `cp -cR` of a 2.1GB / 41,622-file node_modules takes 7.6s, which is negligible next to the risk of codegen or installs writing into the main checkout's `node_modules`.
- **`state.cjs timings --json`.** It has no consumer.
- **`scope.cjs` running jest/vitest to list related tests.** That needs project deps and is slow, so it emits the command instead.
- **Separate test/source regexes in `scope.cjs`.** Two copies would drift from `coverage-changed.cjs`, so both use `lib/changed.cjs`.
- **Two agents for spec.md (designer, then planner).** That doubles latency, and the one-call requirement rules it out.
- **An effort override in the agent files.** Agent files must stay `opus`/`high`, so medium effort is a brief note instead.

## Risks & rollout
| Risk | Mitigation |
|---|---|
| Auth, payment and upload tasks ship without a threat model or goldfish (accepted by the user). | A non-size trigger prints a notice, records a Ruling, adds a PR-body line and selects the security review lens. "Large" alone does not trigger, so large turbo tasks with no sensitive surface get the general lens. Turbo is never the default. |
| A task under-declares `Needs: db`, so the worktree is created with `--no-db` and its env still points at the main DB. Integration, smoke or dev-server runs would hit the main DB. | `## Data changes` forces a DB. Build briefs forbid integration, migrations and seeds without a DB. The turbo.md §7 no-DB guard stops verify before steps 4, 7 and 8 and recreates the worktree with a DB. |
| Scope picks the wrong steps and misses a regression (for example, a service used by an untouched controller). | Related-tests mode follows the import graph. An unmapped repo → full suite. A config or deps change → full unit. Every skip is listed in the PR. CI on the PR still runs the full suite. |
| Moving the patterns into `lib/changed.cjs` changes coverage behavior. | `TEST_FILE ∪ NOT_COVERED` reproduces today's `TEST` exactly. A test asserts they agree on a fixture list, and `tests/coverage.test.cjs` stays green. |
| Q-A changes non-turbo small verify (integration can now be skipped). | Every skip is listed with its reason in the PR. Large non-turbo is untouched. Q-A is pending user confirmation. |
| A one-pass Sonnet spec on a large task is thinner than an Opus design. | Accepted trade-off of `--turbo`. The gate still shows the decisions and tasks for approval. |

Rollout: plugin version 0.7.0, opt-in flag, no migration. Rollback means not passing `--turbo` (and, for Q-A, reverting verify l.27–28). Timings are additive.

## Test strategy
`npm test` stays green. The 138 baseline tests pass unchanged, including `tests/coverage.test.cjs` and `tests/wt.integration.test.cjs`.
- **`tests/changed.test.cjs` (new):**
  - `TEST_FILE ∪ NOT_COVERED` equals the old `TEST` regex on a fixture of about 25 paths (spec, test, e2e, `_test.go`, `__tests__/`, `.d.ts`, config, migrations, dto, module, main.ts, plain source).
  - `isCoverageTarget` matches `coverage-changed`'s old filter.
  - `changedFiles` in a tmpRepo: `committed:true` excludes uncommitted edits and includes deletions, and `diffFilter:'AM'` excludes deletions.
  - `mergeBase` with an unknown base throws.
- **`tests/state.test.cjs` (new):**
  - `set stage=` appends `{stage, at}` and skips a consecutive duplicate, while re-entering a stage appends.
  - `set turbo=true` stores a boolean.
  - Writing a new worktree state with `mainRoot` seeds `stages` and `turbo` from main.
  - `timings` computes durations from a fixture: the total, the last stage `(running)`, and `done` closing the total.
  - No stages → message, exit 0.
  - An old state file without `stages` still works.
- **`tests/scope.test.cjs` (new; tmpRepo + branch commits):**
  - jest service-only change → unit `related` with the file, and integration, build, devServer, smoke and playwright skipped with reasons.
  - Controller change → integration, devServer and smoke run.
  - `prisma/schema.prisma` → integration runs, devServer skipped.
  - `package.json` → build and devServer run, unit `full`.
  - `.tsx` → playwright and devServer run.
  - vitest → `vitest related --run`.
  - go `internal/orders/x.go` → `go test ./internal/orders`.
  - No runner → `mapped:false`, all steps run.
  - Only `docs/specs/**` changed → unit skipped.
  - Deleted controller → integration runs, and the file is not in `relatedTests`.
  - A `.dto.ts` change → `source` (the classifier is shared, not coverage's exclusion).
  - Bad base → exit 1 `{error}`.
- **`tests/skills.test.cjs` (extend):**
  - `skills/ship/references/turbo.md` exists, is ≤120 lines, and is linked from ship SKILL.md (the existing link test).
  - It names `spec.md`, `model: sonnet`, `scope.cjs`, `Needs: db | none`, the notice text, and `--no-db` in its §5 (documented `--no-db` path).
  - The ship `argument-hint` contains `--turbo`.
  - verify SKILL.md references `scope.cjs`.
- **`tests/manifest.test.cjs` (new):** `package.json`, `plugin.json` and `marketplace.json` versions are equal and `0.7.0`.
- **What proves done:**
  - All of the above are green.
  - A manual `/sw:ship --turbo` run on a small task in a sample repo shows one interview batch, one gate, no goldfish or threat-model dispatch, `wt create --no-db` when no task needs a DB, the `scope.cjs` skip reasons in the PR body, and a printed timings table.

## Open questions
- **Q-A: Reach of `scope.cjs`.** The recommended default, which this design follows: it becomes the single implementation of verify step selection for tiny and small in all modes (replacing the prose small-task rule in `verify/SKILL.md`). Large non-turbo keeps the full pipeline, and turbo uses it at every size. Alternative: turbo only, with two rules to maintain.
- **Q-B: Interview under turbo.** The recommended default, which this design follows: cap it at ONE AskUserQuestion batch of ≤4 questions and skip researchers (code-only discover) and goldfish. Alternative: interview and discover as today.
- **Q-C: Confirm the worktree simplification.** You originally chose "lazy" provisioning. The recommended default, which this design follows, replaces it with a create-time `--no-db` derived from the approved spec's `Needs: db` (no `--lazy`, no `provision`, no `--deps symlink`). Alternative: build the lazy `provision` machinery as originally answered.

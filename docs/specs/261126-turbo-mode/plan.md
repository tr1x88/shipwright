# Plan: turbo mode (speed up /sw:ship)
**Design:** docs/specs/<YYMMDD>-turbo-mode/design.md · **Size:** large · **Base:** main

Repo facts the executor needs: dependency-free Node ≥20 CJS in `bin/` (`'use strict'`, `require` only builtins and `./lib/*`). Tests use `node:test` + `node:assert` and `tests/helpers.cjs` (`runNode(script, {cwd, args, env})` → `{code, stdout, stderr, json()}`, `tmpRepo()` → realpath of a fresh git repo on branch `master` with one commit containing `README.md`). Run everything with `npm test` (= `node --test tests/*.test.cjs`, 138 passing at baseline). No lint, typecheck, build or dev server in this repo. Every `skills/*/SKILL.md` must stay ≤ 120 lines with a frontmatter `description` ≤ 220 chars (`tests/skills.test.cjs`). `tests/agents.test.cjs` requires `agents/sw-designer.md` and `agents/sw-planner.md` to stay `model: opus`, so no agent file is edited.

## File map
- `bin/lib/changed.cjs` — create: shared change classifier (merge-base, changed-file list, `SOURCE` / `TEST_FILE` / `NOT_COVERED` patterns, `isCoverageTarget`)
- `bin/coverage-changed.cjs` — modify: use `lib/changed.cjs` instead of its own l.19-25 (output and exit codes unchanged)
- `tests/changed.test.cjs` — create: regex equivalence with the old `TEST`, `changedFiles` / `mergeBase` behavior
- `bin/lib/state.cjs` — modify: `write()` appends `stages[]` and seeds `{stages, turbo}` from `mainRoot`; new pure `formatTimings()`
- `bin/state.cjs` — modify: `true`/`false` coercion in `set`; new `timings` command
- `tests/state.test.cjs` — create: stage append, seeding, coercion, timings
- `bin/scope.cjs` — create: verify step selection + related-test command from changed paths
- `tests/scope.test.cjs` — create: scope rules on tmp repos
- `tests/skills.test.cjs` — modify: turbo.md, ship hint, verify → scope.cjs, stage-skill pointers, plan `Needs:` line
- `skills/ship/references/turbo.md` — create: all turbo detail (§1–§9)
- `skills/ship/SKILL.md` — modify: `--turbo` hint, triage line, turbo pointer, stage names, §4 routing exception, §7 timings
- `skills/verify/SKILL.md` — modify: replace the tiny/small rules (l.27–28) with scope.cjs selection; turbo pointer
- `skills/review/SKILL.md` — modify: turbo pointer (one Sonnet reviewer, one lens)
- `skills/pr/SKILL.md` — modify: skipped-step lines under Verification, turbo line under Rulings; turbo pointer
- `skills/architect/SKILL.md` — modify: turbo pointer (§2–4)
- `skills/plan/SKILL.md` — modify: turbo pointer (§2–4); `- Needs: db | none` in the task template + one definition line
- `skills/worktree/SKILL.md` — modify: turbo pointer (§5)
- `skills/build/SKILL.md` — modify: turbo pointer (§6)
- `tests/manifest.test.cjs` — create: three manifest versions equal and `0.7.0`
- `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — modify: version 0.6.0 → 0.7.0 (only in T8)
- `CHANGELOG.md`, `README.md`, `site/guide.html` — modify: 0.7.0 entry, `/sw:ship` row + flow note, ship section mention

## Tasks

### T1: Shared change classifier `bin/lib/changed.cjs` (foundation)
- Files: `bin/lib/changed.cjs` (create), `bin/coverage-changed.cjs` (modify), `tests/changed.test.cjs` (create)
- Depends: —
- Needs: none
- Interface (exact):
  ```js
  'use strict';
  // Changed files vs a base branch + the shared source/test classifier (coverage-changed.cjs, scope.cjs).
  const { git } = require('./git.cjs');
  const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|go|vue|svelte)$/;
  const TEST_FILE = /(\.(spec|test|e2e-spec)\.[jt]sx?$|_test\.go$|\/(__tests__|test|tests|e2e)\/)/;
  const NOT_COVERED = /(\.d\.ts$|\.(config|setup)\.[jt]s$|\/migrations?\/|\/dto\/|\.dto\.ts$|\.module\.ts$|main\.ts$)/;
  function mergeBase(top, base) { return git(['merge-base', base, 'HEAD'], top); }   // git() throws on unknown base — let it throw
  function changedFiles(top, base, { diffFilter = null, committed = false } = {}) {
    const args = ['diff', '--name-only'];
    if (diffFilter) args.push(`--diff-filter=${diffFilter}`);
    args.push(mergeBase(top, base));
    if (committed) args.push('HEAD');
    return git(args, top).split('\n').filter(Boolean);
  }
  const isCoverageTarget = (f) => SOURCE.test(f) && !TEST_FILE.test(f) && !NOT_COVERED.test(f);
  module.exports = { SOURCE, TEST_FILE, NOT_COVERED, mergeBase, changedFiles, isCoverageTarget };
  ```
  `bin/coverage-changed.cjs`: change l.8 to `const { toplevel } = require('./lib/git.cjs');`, add `const { changedFiles, isCoverageTarget } = require('./lib/changed.cjs');`, and replace l.19-25 (the `SOURCE`, `TEST`, `mergeBase`, `changed` lines) with exactly `const changed = changedFiles(top, base, { diffFilter: 'AM' }).filter(isCoverageTarget);`. Nothing else in the file changes.
- TDD: test-first
- Tests (`tests/changed.test.cjs`; copy the old regexes verbatim into the test as `OLD_SOURCE` and `OLD_TEST` from the current coverage-changed.cjs l.19-20):
  - `it('TEST_FILE ∪ NOT_COVERED equals the old coverage TEST regex on every fixture path')` — for each path p of the fixture below: `assert.equal(OLD_TEST.test(p), TEST_FILE.test(p) || NOT_COVERED.test(p), p)`
  - `it('isCoverageTarget equals the old SOURCE && !TEST filter')` — same fixture, `OLD_SOURCE.test(p) && !OLD_TEST.test(p)`
  - `it('changedFiles committed:true excludes uncommitted edits and includes deletions')`
  - `it('changedFiles committed:false includes uncommitted edits of tracked files')`
  - `it("changedFiles diffFilter 'AM' excludes deletions")`
  - `it('mergeBase throws for an unknown base')` — `assert.throws(() => mergeBase(dir, 'nope'))`
  - Fixture paths (25): `src/orders/refund.service.ts`, `src/orders/refund.service.spec.ts`, `src/orders/refund.test.tsx`, `test/app.e2e-spec.ts`, `internal/orders/refund.go`, `internal/orders/refund_test.go`, `src/__tests__/refund.ts`, `src/test/helpers.ts`, `apps/api/tests/util.js`, `apps/web/e2e/login.ts`, `types/global.d.ts`, `jest.config.ts`, `vitest.setup.js`, `prisma/migrations/001/migration.ts`, `src/db/migration/002.ts`, `src/orders/dto/create.ts`, `src/orders/create-order.dto.ts`, `src/orders/orders.module.ts`, `src/main.ts`, `apps/web/src/App.tsx`, `web/components/Button.vue`, `lib/index.mjs`, `bin/tool.cjs`, `README.md`, `src/orders/orders.controller.ts`
  - Git fixture for the three `changedFiles` tests: `tmpRepo()`; on `master` write + commit `src/old.controller.ts`; `git switch -qc feat/x`; `git rm -q src/old.controller.ts`; write `src/new.service.ts`; `git add -A && git commit -qm change`; then edit `README.md` without committing. Expected: `committed:true` → contains `src/old.controller.ts` and `src/new.service.ts`, not `README.md`; `committed:false` → contains `README.md`; `{diffFilter:'AM'}` → contains `src/new.service.ts`, not `src/old.controller.ts`. Call with `top = dir`, `base = 'master'`.
- Done when: `node --test tests/changed.test.cjs tests/coverage.test.cjs` passes
- [ ] write failing test · [ ] run (red) · [ ] implement · [ ] run (green) · [ ] commit

### T2: Stage timestamps and timings in state (foundation)
- Files: `bin/lib/state.cjs` (modify), `bin/state.cjs` (modify), `tests/state.test.cjs` (create)
- Depends: —
- Needs: none
- Interface:
  - `write(dir, patch)` in `bin/lib/state.cjs`, in this order:
    1. `const prev = read(dir);` `let cur = prev || {};`
    2. If `!prev && patch.mainRoot`: `const m = read(patch.mainRoot);` if `m`, set `cur = {}` plus `stages: m.stages` when `Array.isArray(m.stages)` and `turbo: m.turbo` when `'turbo' in m` (seed only these two keys — D-a).
    3. `const now = new Date().toISOString();` `const next = { ...cur, ...patch, updatedAt: now };`
    4. `const stages = Array.isArray(next.stages) ? next.stages.slice() : [];` (a `stages` array in the patch therefore replaces the stored one — used by tests and the recovery copy).
    5. If `typeof patch.stage === 'string' && patch.stage` and `stages.length === 0 || stages[stages.length - 1].stage !== patch.stage` → `stages.push({ stage: patch.stage, at: now })`.
    6. If `stages.length` → `next.stages = stages`. Write and return `next` as today.
  - `formatTimings(stages, now = Date.now()) → string` (new export in `bin/lib/state.cjs`; module.exports becomes `{ FILE, file, read, write, formatTimings }`):
    - `!Array.isArray(stages) || !stages.length` → return `'no stage timings recorded'`.
    - `dur(ms)`: `s = Math.max(0, Math.round(ms / 1000))`; `h = Math.floor(s / 3600)`, `m = Math.floor((s % 3600) / 60)`, `sec = s % 60`; `h ? \`${h}h${pad2(m)}m${pad2(sec)}s\` : \`${m}m${pad2(sec)}s\`` (e.g. `3m12s`, `41m05s`, `1h02m03s`).
    - `iso(at)` = `at.replace(/\.\d{3}Z$/, 'Z')`.
    - Header `'stage'.padEnd(11) + 'started'.padEnd(22) + 'duration'`.
    - For each index i with `stages[i].stage !== 'done'`: `next = stages[i + 1]`; `ms = (next ? Date.parse(next.at) : now) - Date.parse(stages[i].at)`; line `stage.padEnd(11) + iso(at).padEnd(22) + dur(ms) + (next ? '' : ' (running)')`.
    - Total line `'total'.padEnd(33) + dur(end - Date.parse(stages[0].at))`, where `end = last.stage === 'done' ? Date.parse(last.at) : now`.
    - Lines joined with `'\n'`.
  - `bin/state.cjs`: `set` value coercion becomes `/^\d+$/ → Number`, `'null' → null`, `'true' → true`, `'false' → false`, else string. New branch `else if (cmd === 'timings') { const s = state.read(top); console.log(state.formatTimings(s && s.stages)); }` (exit 0 always). Header comment gains `//   state.cjs timings`.
- TDD: test-first
- Tests (`tests/state.test.cjs`; use `const state = require('../bin/lib/state.cjs')` for lib tests and `runNode('state.cjs', {cwd: dir, args})` for CLI tests; `dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sw-state-')))` — not a git repo, so the CLI uses cwd):
  - `it('set stage= appends {stage, at} and skips a consecutive duplicate')` — CLI `set stage=discover`, `set stage=discover`, `set stage=spec` → `stages.map(s => s.stage)` deep-equals `['discover','spec']`, each `at` parses as a date
  - `it('re-entering an earlier stage appends a new entry')` — `discover, spec, discover` → three entries
  - `it('set coerces true/false to booleans; digits and null unchanged')` — CLI `set turbo=true flag=false round=2 db=null name=x` → `turbo === true`, `flag === false`, `round === 2`, `db === null`, `name === 'x'`
  - `it('a new state written with mainRoot seeds stages and turbo from main')` — `state.write(main, {stages:[{stage:'discover',at:'2026-11-26T10:00:03.000Z'},{stage:'spec',at:'2026-11-26T10:03:15.000Z'}], turbo:true})`; `state.write(wt, {stage:'worktree', mainRoot: main, slug:'x'})` → stages `['discover','spec','worktree']`, `turbo === true`, and `slug === 'x'`; main's other keys (e.g. a `size` written to main) are NOT copied
  - `it('an existing state is not re-seeded from mainRoot')` — `state.write(wt, {stage:'build'})` then `state.write(wt, {mainRoot: main})` → stages `['build']`
  - `it('timings: per-stage durations, last stage running, total')` — `formatTimings([{discover,'2026-11-26T10:00:03.000Z'},{spec,'2026-11-26T10:03:15.000Z'},{build,'2026-11-26T10:09:55.000Z'}], Date.parse('2026-11-26T10:41:08.000Z'))` → first line matches `/^stage\s+started\s+duration$/`, contains lines matching `/^discover\s+2026-11-26T10:00:03Z\s+3m12s$/m`, `/^spec\s+2026-11-26T10:03:15Z\s+6m40s$/m`, `/^build\s+2026-11-26T10:09:55Z\s+31m13s \(running\)$/m`, `/^total\s+41m05s$/m`
  - `it('timings: done gets no row and closes the total')` — same stages plus `{done,'2026-11-26T10:41:08.000Z'}`, `now = Date.parse('2026-11-26T12:00:00.000Z')` → no line starting `done`, build line is `31m13s` without `(running)`, total `41m05s`
  - `it('timings CLI: no stages prints the message and exits 0')` — empty dir → `code === 0`, stdout trimmed `=== 'no stage timings recorded'`
  - `it('old state without stages still works')` — write `{"slug":"x","stage":"build"}` raw to `.sw-state.json`; CLI `timings` → message, exit 0; CLI `get` → `slug === 'x'`; CLI `set stage=verify` → stages `['verify']`
- Done when: `node --test tests/state.test.cjs tests/statusline.test.cjs` passes
- [ ] write failing test · [ ] run (red) · [ ] implement · [ ] run (green) · [ ] commit

### T3: Skill contract tests (red until W2)
- Files: `tests/skills.test.cjs` (modify)
- Depends: —
- Needs: none
- Interface: append these tests at the end of the file (reuse the file's `read(name)`, `frontmatter()` and `SKILLS`). `const TURBO = path.join(SKILLS, 'ship', 'references', 'turbo.md');`
- TDD: test-first
- Tests (exact names):
  - `test('turbo.md exists and is ≤ 120 lines')` — `fs.existsSync(TURBO)` and `trimEnd().split('\n').length <= 120`
  - `test('ship links references/turbo.md')` — `read('ship').includes('](references/turbo.md)')`
  - `test('ship argument-hint offers --turbo')` — `frontmatter(read('ship'))['argument-hint'].includes('--turbo')`
  - `test('turbo.md names the spec, model, scope, Needs field and the notice')` — turbo.md contains each of: `spec.md`, `model: sonnet`, `scope.cjs`, `Needs: db | none`, `turbo: threat-model trigger matched (<trigger>) — skipped by --turbo` (em dash U+2014)
  - `test('turbo.md §5 documents the --no-db path')` — `const m = text.match(/^## 5\. Worktree\n([\s\S]*?)(?=^## )/m)`; `assert.ok(m)`; `m[1].includes('--no-db')`
  - `test('verify SKILL.md selects steps with scope.cjs')` — `read('verify').includes('scope.cjs')`
  - `test('plan template declares Needs: db | none')` — `read('plan').includes('- Needs: db | none')`
  - `for (const s of ['architect','plan','worktree','build','verify','review','pr']) test(\`${s}: points to turbo.md\`, …)` — `read(s).includes('skills/ship/references/turbo.md')`
- Done when: `node --test tests/skills.test.cjs` runs with every pre-existing test passing and exactly these new tests failing: `turbo.md exists and is ≤ 120 lines`, `ship links references/turbo.md`, `ship argument-hint offers --turbo`, `turbo.md names the spec, model, scope, Needs field and the notice`, `turbo.md §5 documents the --no-db path`, `verify SKILL.md selects steps with scope.cjs`, `plan template declares Needs: db | none`, and the 7 `<skill>: points to turbo.md` tests (14 red). They turn green when W2 lands.
- [ ] write failing tests · [ ] run (red, exactly 14) · [ ] commit

### T4: `bin/scope.cjs` — verify step selection
- Files: `bin/scope.cjs` (create), `tests/scope.test.cjs` (create)
- Depends: T1
- Needs: none
- Interface:
  - CLI `node scope.cjs --base <branch>` (cwd inside the worktree). Success: `console.log(JSON.stringify(result, null, 2))`, exit 0, shape exactly as design.md `### bin/scope.cjs` (`base, mergeBase, mapped, runner, changed, areas{source,tests,endpoint,db,build,frontend}, relatedTests, steps{lint,typecheck,unit,integration,coverage,build,devServer,smoke,playwright}`).
  - Errors → `console.log(JSON.stringify({ error }))`, `process.exit(1)`: `toplevel(cwd)` null → `'not a git repository'`; no `--base` value → `'missing --base'`; `mergeBase` throws → `` `unknown base: ${base}` ``.
  - Exports (file ends with `if (require.main === module) main(); module.exports = { ENDPOINT, DB, BUILD, FRONTEND, classify, detectRunner, relatedCommand, selectSteps };`):
    - Patterns (arrays of RegExp; a file joins an area when any pattern matches):
      `ENDPOINT = [/\.(controller|resolver|gateway|handler|routes?)\.[jt]s$/, /(^|\/)app\/.*route\.[jt]s$/, /\/(controllers|handlers|routes)\//, /_handler\.go$/, /\/(http|api)\/.*\.go$/]`
      `DB = [/schema\.prisma$/, /\/migrations?\//, /\.sql$/, /\.(repository|entity|model)\.[jt]s$/, /\/(repository|store|db)\/.*\.go$/]`
      `BUILD = [/package\.json$/, /package-lock\.json/, /pnpm-lock\.yaml/, /yarn\.lock/, /bun\.lockb/, /tsconfig.*\.json$/, /\.config\.(js|ts|mjs|cjs)$/, /nest-cli\.json/, /Dockerfile/, /go\.(mod|sum)$/, /(^|\/)main\.(ts|go)$/, /\.module\.ts$/]`
      `FRONTEND = [/\.(tsx|jsx|vue|svelte|css|scss|sass|less|html)$/]`
    - `classify(files: string[]) → { source, tests, endpoint, db, build, frontend }` — `source`: `changed.SOURCE.test(f) && !changed.TEST_FILE.test(f)` (NOT `isCoverageTarget`: `.dto.ts` is source); `tests`: `changed.TEST_FILE.test(f)`; others from the arrays above. Keep input order.
    - `detectRunner(top) → { runner: 'go'|'vitest'|'jest'|null, mapped: boolean }`, root only: `go.mod` exists → `go`. Else root `package.json` (JSON.parse in try; parse error → `{runner:null, mapped:false}`): `names(x) = /vitest/.test(pkg.scripts?.test || '') || x in {...pkg.dependencies, ...pkg.devDependencies}`; vitest named → `vitest`; jest named (`/jest/` in scripts.test, `jest` in deps/devDeps, a `pkg.jest` key, or a root `jest.config.*` file) → `jest`; else if `pkg.workspaces` or root `pnpm-workspace.yaml` exists → `null`; else → `jest`. No `go.mod` and no `package.json` → `null`. `mapped = runner !== null`.
    - `relatedCommand(runner, files) → string|null` — jest `npx jest --findRelatedTests ${files.join(' ')}`; vitest `npx vitest related --run ${files.join(' ')}`; go: unique `path.posix.dirname` of files ending `.go`, each rendered `d === '.' ? '.' : './' + d`, → `go test ${dirs.join(' ')}`; no usable files (empty list, or go with no `.go` file) → `null`.
    - `selectSteps({ areas, runner, mapped, relatedTests }) → steps`:
      - `!mapped` → every step `{ run: true }`, `unit = { run: true, mode: 'full' }`.
      - lint, typecheck → `{ run: true }`.
      - unit: `areas.build.length` → `{ run: true, mode: 'full' }`; else if `areas.source.length || areas.tests.length` → `cmd = relatedCommand(runner, relatedTests)`; `cmd` → `{ run: true, mode: 'related', command: cmd }`, `null` → `{ run: true, mode: 'full' }`; else `{ run: false, reason: 'no source or test changes' }`.
      - integration: endpoint ∪ db non-empty, else reason `'no endpoint/DB/migration/handler changes'`.
      - coverage: `unit.run && areas.source.length`, else reason `'no changed source files'`.
      - build: build non-empty, else `'no config/deps/entry changes'`.
      - devServer: endpoint ∪ build ∪ frontend non-empty, else `'no endpoint/build/frontend changes'`.
      - smoke: endpoint non-empty, else `'no endpoint changes'`.
      - playwright: frontend non-empty, else `'no frontend files changed'`.
      - A running step is `{ run: true }` (unit adds `mode`/`command`); a skipped step is `{ run: false, reason }`.
  - `main()`: `top = toplevel(process.cwd())`; base from `--base`; `mb = changed.mergeBase(top, base)`; `files = changed.changedFiles(top, base, { committed: true }).filter((f) => !f.startsWith('docs/specs/'))`; `deleted = new Set(changed.changedFiles(top, base, { committed: true, diffFilter: 'D' }))`; `areas = classify(files)`; `relatedTests = files.filter((f) => !deleted.has(f) && (areas.source.includes(f) || areas.tests.includes(f)))`; `{runner, mapped} = detectRunner(top)`; output `{ base, mergeBase: mb, mapped, runner, changed: files, areas, relatedTests, steps: selectSteps(...) }`.
- TDD: test-first
- Tests (`tests/scope.test.cjs`). Helper:
  ```js
  function repo({ base = {}, branch = {}, remove = [] } = {}) {
    const dir = tmpRepo();
    const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
    const put = (files) => { for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c); } };
    put(base); g('add', '-A'); g('commit', '-qm', 'base', '--allow-empty');
    g('switch', '-qc', 'feat/x');
    put(branch); for (const f of remove) g('rm', '-q', f);
    g('add', '-A'); g('commit', '-qm', 'change', '--allow-empty');
    return dir;
  }
  const JEST = { 'package.json': '{"scripts":{"test":"jest"}}\n' };
  const scope = (dir, base = 'master') => runNode('scope.cjs', { cwd: dir, args: ['--base', base] });
  ```
  Every repo below uses `base: JEST` (merged with any extra base files listed) unless the test names a different `package.json`/`go.mod` or says "no package.json".
  - `it('jest service-only change runs related unit and skips integration, build, devServer, smoke, playwright with reasons')` — base JEST, branch `src/orders/refund.service.ts` → `runner 'jest'`, `mapped true`, unit `{run:true, mode:'related', command:'npx jest --findRelatedTests src/orders/refund.service.ts'}`, `relatedTests` deep-equals `['src/orders/refund.service.ts']`, coverage runs, and each of integration/build/devServer/smoke/playwright has `run === false` and a non-empty `reason`
  - `it('controller change runs integration, devServer and smoke')` — branch `src/orders/orders.controller.ts`
  - `it('prisma schema change runs integration and skips devServer')` — branch `prisma/schema.prisma` → integration run, devServer skipped, unit skipped
  - `it('package.json change runs build and devServer with full unit')` — base JEST, branch `package.json` = `'{"scripts":{"test":"jest","build":"tsc"}}\n'` → build run, devServer run, unit `mode 'full'` with no `command`
  - `it('tsx change runs playwright and devServer')` — branch `src/App.tsx`
  - `it('vitest repo uses vitest related --run')` — base `package.json` = `'{"devDependencies":{"vitest":"^1.0.0"}}\n'`, branch `src/a.ts` → command `'npx vitest related --run src/a.ts'`
  - `it('go change runs go test on the changed package')` — base `go.mod` = `'module example.com/x\n\ngo 1.22\n'`, branch `internal/orders/x.go` → `runner 'go'`, command `'go test ./internal/orders'`
  - `it('repo without a runner is unmapped and runs every step')` — no package.json/go.mod, branch `src/a.ts` → `mapped false`, `runner null`, every step `run === true`, unit `mode 'full'`
  - `it('workspaces without a root runner is unmapped')` — base `package.json` = `'{"workspaces":["packages/*"]}\n'`, branch `packages/a/src/x.ts` → `mapped false`
  - `it('only docs/specs changes skip unit')` — base JEST, branch `docs/specs/261126-x/design.md` → `changed` deep-equals `[]`, unit `run === false`
  - `it('deleted controller still runs integration and is not in relatedTests')` — base JEST + `src/orders/orders.controller.ts`, `remove: ['src/orders/orders.controller.ts']` → `areas.endpoint` includes it, integration run, `relatedTests` deep-equals `[]`, unit `mode 'full'`
  - `it('a .dto.ts change counts as source')` — branch `src/orders/create-order.dto.ts` → `areas.source` includes it
  - `it('unknown base exits 1 with an error')` — `scope(dir, 'nope')` → `code 1`, `json().error` matches `/unknown base/`
  - `it('missing --base exits 1 with an error')` — `runNode('scope.cjs', {cwd: dir})` → `code 1`, error `'missing --base'`
  - `it('classify puts a file in every matching area')` — in-process: `classify(['src/main.ts'])` → in `source` and `build`; `classify(['src/users/user.repository.ts'])` → in `source` and `db`
- Done when: `node --test tests/scope.test.cjs tests/changed.test.cjs` passes
- [ ] write failing test · [ ] run (red) · [ ] implement · [ ] run (green) · [ ] commit

### T5: `turbo.md` reference + ship wiring
- Files: `skills/ship/references/turbo.md` (create), `skills/ship/SKILL.md` (modify)
- Depends: T3
- Needs: none
- Interface:
  - `turbo.md` (≤ 120 lines). Title `# Turbo (\`/sw:ship --turbo\`)`, one intro line ("Opt-in; any size, no exceptions; combines with `--tiny|--small|--large|--resume`; state `turbo: true`"). Then exactly these headings, with the content from design.md `### skills/ship/references/turbo.md` and Decisions 1, 3, 6, 7:
    - `## 1. Skips and the notice` — no goldfish (design or plan) and no `/sw:threat-model` at any size. Non-size triggers from `/sw:threat-model` §1 (authn/authz/tenancy, money, files/URLs/untrusted input, secrets/PII, new trust boundary; "size is large" alone does NOT fire). On a match print at the gate exactly `turbo: threat-model trigger matched (<trigger>) — skipped by --turbo`, record the same line under spec.md `## Rulings`, select the security review lens (§8). Tiny: stages unchanged; verify = tiny rule + `scope.cjs` related-test command.
    - `## 2. Spec stage` — stage names written to state: `discover, spec, worktree, build, verify, review, llms-txt, pr, done`. Discover is code-only (no `sw-researcher`) at every size. Architect §1 read, §2 echo, §3 interview capped at ONE AskUserQuestion batch of ≤ 4 questions, §4 approaches in one message. No §3b, no §5 goldfish, no `/sw:plan`.
    - `## 3. sw-designer brief` — one `sw-designer` Agent call with `model: sonnet`; brief line `Effort: medium — one pass, no exhaustive alternatives`; brief also carries task, interview answers with their why, chosen approach, size, base, output path `<main>/.sw/specs/<slug>/spec.md`, and "§1–2 of `${CLAUDE_PLUGIN_ROOT}/skills/plan/SKILL.md` for the File map/Tasks/Waves/Verify sections". Then the spec.md template from design.md verbatim (fenced markdown), with the Tasks line reading `## Tasks            (plan template fields + \`- Needs: db | none\`)`.
    - `## 4. Gate (= Gate 2)` — show decisions (one line each), tasks (one line each), waves (`W2: T2‖T3`), verify plan, the threat-model notice if any, and the line `Turbo: no goldfish, no threat model, Sonnet review`. ⛔ Wait for approval, then run continuously (ship §3); Rulings go to spec.md `## Rulings`.
    - `## 5. Worktree` — no task has `Needs: db` and spec.md has no `## Data changes` → `node $SW/wt.cjs create <slug> --prefix <p> --size <s> --no-db` and record `Ruling: worktree without DB — no task needs db`. Otherwise the normal `/sw:worktree` command. Redis, deps and port are unchanged. With `--no-db`, the worktree env files keep the main checkout's DB URLs.
    - `## 6. Build` — briefs come from spec.md (tasks, contracts, waves); Rulings are appended to spec.md. With `--no-db` every brief carries the exact line `No worktree DB: do not run integration suites, migrations or seeds; stop with NEEDS_CONTEXT if the task needs them.`
    - `## 7. Verify` — run `node $SW/scope.cjs --base <base>` and follow `steps`; non-zero exit → full pipeline. **No-DB guard** (state `db` is null, scope has `integration`, `smoke` or `devServer` with `run: true`, and a worktree env file holds `DATABASE_URL|POSTGRES_URL|DB_URL|PG_URL` with a Postgres URL) → STOP before those steps; recovery steps 1–6 from design.md verbatim (commit pending work; `cp <wt>/.sw-state.json <main>/.sw-state.json`; `node $SW/wt.cjs remove <slug> --no-branch`; `node $SW/wt.cjs create <slug> --prefix <p> --size <s>`; `node $SW/state.cjs clear` in main; record a Ruling and resume verify from step 1). Related unit run reports "No tests found" → run the full unit suite; never pass `--passWithNoTests`.
    - `## 8. Review` — one `sw-reviewer` with `model: sonnet`, at most one re-review cycle, at any size; one lens: security if a non-size trigger matched (§1), else performance if scope `areas.db` or `areas.endpoint` is non-empty, else general (design compliance and correctness only). Pass only that lens's reference path. `sw-docs-writer` for llms-txt runs in the same message as today.
    - `## 9. PR body` — `## Verification` lists each skipped step as `<step>: skipped — <reason>`; `## Rulings & follow-ups` opens with `Turbo: no goldfish, no threat model[, trigger matched: <trigger>], single Sonnet review (<lens>)`. Link spec.md instead of design.md.
  - `skills/ship/SKILL.md` edits (stay ≤ 120 lines; do NOT change `description` — it is 209 chars):
    - frontmatter `argument-hint: "<task> [--tiny|--small|--large] [--turbo] [--resume]"`
    - §0, `--resume` bullet: append `; state \`turbo: true\` → stay in the turbo flow.`
    - §1, after "User flags override…": new line `\`--turbo\` (only when the user types it; any size): \`node $SW/state.cjs set turbo=true\`, then follow [turbo.md](references/turbo.md) — code-only discover, one \`spec\` stage + gate instead of architect and plan, no goldfish, no threat model (§1 notice), scoped verify, one Sonnet review.`
    - §2, under the stage table: `Turbo: stages 2–3 become one \`spec\` stage (⛔ = Gate 2), see [turbo.md](references/turbo.md) §2–4; artifacts: \`spec.md\` instead of design.md + plan.md.`
    - §3 last paragraph: `plan.md` → `plan.md (turbo: spec.md)`.
    - §4, append sentence: `Turbo exception: \`sw-designer\` runs once with \`model: sonnet\` (brief says \`Effort: medium\`), no \`sw-goldfish\`, and \`sw-reviewer\` runs with \`model: sonnet\` at any size — recorded in the PR body, not as a Ruling.`
    - §7: replace "then `node $SW/state.cjs set stage=done` and stop." with "then `node $SW/state.cjs set stage=done`, run `node $SW/state.cjs timings` in the worktree and print its table, and stop." (every mode).
- TDD: none (docs) — T3 tests cover it
- Done when: `node --test tests/skills.test.cjs` passes every test except the 7 `<skill>: points to turbo.md`, `verify SKILL.md selects steps with scope.cjs` and `plan template declares Needs: db | none` (those belong to T6/T7 in the same wave)
- [ ] write · [ ] run · [ ] commit

### T6: verify, review, pr skill wiring
- Files: `skills/verify/SKILL.md` (modify), `skills/review/SKILL.md` (modify), `skills/pr/SKILL.md` (modify)
- Depends: T3
- Needs: none
- Interface:
  - verify: delete l.27 (`Tiny tasks: …`) and l.28 (`Small tasks: skip step 6 …`) and put in their place:
    - `Step selection — tiny, small, and every size under turbo: run \`node $SW/scope.cjs --base <base>\` and follow \`steps\` (lint→1, typecheck→2, unit→3, integration→4, coverage→5, build→6, devServer→7, smoke→8, playwright→9). Unit \`mode: related\` → run its \`command\`; \`mode: full\` → the repo's unit command. Related run reports "No tests found" → full unit suite; never \`--passWithNoTests\`. scope.cjs exits non-zero → full pipeline.`
    - `Tiny: steps 1–3 for the touched area + 8 if an endpoint changed — scope only supplies the related-test command. Large non-turbo: full pipeline. Note every \`run: false\` step as \`<step>: skipped — <reason>\` (it goes into the PR body).`
    - `Turbo: also apply the no-DB guard in \`${CLAUDE_PLUGIN_ROOT}/skills/ship/references/turbo.md\` §7 before steps 4, 7 and 8.`
  - review: after the model-by-size bullets add `- **turbo** (any size) → one \`sw-reviewer\`, \`model: sonnet\`, one lens, max 1 re-review cycle — lens rule in \`${CLAUDE_PLUGIN_ROOT}/skills/ship/references/turbo.md\` §8.`
  - pr §4 body template: `## Verification` gets the line `<skipped steps: \`<step>: skipped — <reason>\` (from scope.cjs)>`; `## Rulings & follow-ups` gets `<turbo: first line per \`${CLAUDE_PLUGIN_ROOT}/skills/ship/references/turbo.md\` §9>`. Also the Summary link line: `design.md` → `design.md (turbo: spec.md)`.
  - Each file stays ≤ 120 lines; descriptions unchanged.
- TDD: none (docs) — T3 tests cover it
- Done when: `node --test tests/skills.test.cjs` — `verify SKILL.md selects steps with scope.cjs`, `verify: points to turbo.md`, `review: points to turbo.md`, `pr: points to turbo.md` and every pre-existing test pass
- [ ] write · [ ] run · [ ] commit

### T7: architect, plan, worktree, build skill wiring + `Needs:` field
- Files: `skills/architect/SKILL.md` (modify), `skills/plan/SKILL.md` (modify), `skills/worktree/SKILL.md` (modify), `skills/build/SKILL.md` (modify)
- Depends: T3
- Needs: none
- Interface:
  - architect: line after the intro paragraph: `**Turbo (\`--turbo\`):** follow \`${CLAUDE_PLUGIN_ROOT}/skills/ship/references/turbo.md\` §2–4 instead — §1–2 as below, §3 capped at ONE batch of ≤ 4 questions, no §3b, §4 in one message, then one \`sw-designer\` (\`model: sonnet\`) writes spec.md; no §5 goldfish.`
  - plan: line after the "Output:" paragraph: `**Turbo:** no separate plan stage — spec.md carries the file map, tasks, waves and verify (\`${CLAUDE_PLUGIN_ROOT}/skills/ship/references/turbo.md\` §2–4).` In the task template code block insert `- Needs: db | none` directly after the `- Depends: — | T1, T2` line. Under the "Design for parallelism" bullets add `- \`Needs: db\` when the task runs migrations, seeds or integration suites or otherwise needs the worktree DB; else \`none\` (turbo uses it to create the worktree with \`--no-db\`).`
  - worktree: line after `SW=…`: `Turbo: decide \`--no-db\` from the approved spec.md per \`${CLAUDE_PLUGIN_ROOT}/skills/ship/references/turbo.md\` §5.`
  - build: line after "Run continuously…": `Turbo: briefs come from spec.md and Rulings go there; no-DB brief line per \`${CLAUDE_PLUGIN_ROOT}/skills/ship/references/turbo.md\` §6.`
  - Each file stays ≤ 120 lines; descriptions unchanged.
- TDD: none (docs) — T3 tests cover it
- Done when: `node --test tests/skills.test.cjs` — `plan template declares Needs: db | none`, `architect|plan|worktree|build: points to turbo.md` and every pre-existing test pass
- [ ] write · [ ] run · [ ] commit

### T8: Version 0.7.0 + CHANGELOG / README / site
- Files: `tests/manifest.test.cjs` (create), `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `CHANGELOG.md`, `README.md`, `site/guide.html` (modify)
- Depends: T4, T5, T6, T7
- Needs: none
- Interface:
  - `tests/manifest.test.cjs`: `test('package.json, plugin.json and marketplace.json versions are equal and 0.7.0')` — read `package.json` `.version`, `.claude-plugin/plugin.json` `.version`, `.claude-plugin/marketplace.json` `.metadata.version`; all `=== '0.7.0'`.
  - Versions `0.6.0` → `0.7.0` in the three JSON files (keep the existing formatting and `→` escapes).
  - CHANGELOG: new top entry `## 0.7.0 — 2026-11-26` "Turbo mode and stage timings." Bullets: `/sw:ship --turbo` (opt-in, any size: one Sonnet `sw-designer` spec.md + one gate, no goldfish, no threat model with a trigger notice, one Sonnet review lens); worktree `--no-db` when no task `Needs: db`; new `bin/scope.cjs` picks verify steps and related tests from changed paths, now also for tiny/small in every mode (skips listed in the PR); shared `bin/lib/changed.cjs` classifier (coverage-changed unchanged in behavior); `state.cjs timings` + per-stage timestamps printed at the end of every `/sw:ship`; plan tasks declare `Needs: db | none`.
  - README: `/sw:ship` commands row → append `, \`--turbo\` for the fast path (one spec gate, no goldfish/threat model, scoped verify, one Sonnet review)`; under the flow code block add a short paragraph `**Turbo** (\`/sw:ship <task> --turbo\`, any size): …` naming discover (code) → spec ⛔ → worktree (`--no-db` when no task needs a DB) → build → scoped verify → one Sonnet review → llms-txt → pr, the skipped goldfish/threat model, and that `/sw:ship` ends with a timings table.
  - site/guide.html `#ship` section: add `/sw:ship "add a CSV export" --turbo     # fast path: one spec gate, scoped verify` to the `<pre>` and one `<p>` after the `<pre>` describing turbo (same facts as README; plain HTML, existing classes only).
- TDD: test-first (manifest test red before the bump)
- Done when: `npm test` passes (full suite: 138 baseline + all new tests)
- [ ] write failing test · [ ] run (red) · [ ] bump + docs · [ ] run (green) · [ ] commit

## Waves
- W1 (parallel): T1 ‖ T2 ‖ T3 — foundation: shared classifier, state, skill contract tests (T3 is red by design until W2)
- W2 (parallel): T4 ‖ T5 ‖ T6 ‖ T7 — disjoint files; T4 depends on T1, T5–T7 on T3
- W3 (serial): T8 — version bump and docs, the only task touching version files

No task runs a DB-resetting suite (`tests/wt.integration.test.cjs` is unchanged and only runs inside `npm test` at verify).

## Verify
- lint / typecheck / build / dev server / smoke / playwright: skipped — this repo has none (CLAUDE.local.md Commands: n/a)
- unit + integration: `npm test` — 0 failures; the 138 baseline tests pass unchanged (incl. `tests/coverage.test.cjs`, `tests/statusline.test.cjs`, `tests/wt.integration.test.cjs`)
- coverage (best effort, no repo tooling): `node --test --experimental-test-coverage tests/changed.test.cjs tests/state.test.cjs tests/scope.test.cjs tests/coverage.test.cjs` — `bin/lib/changed.cjs`, `bin/lib/state.cjs`, `bin/scope.cjs` ≥ 80% lines where reported
- limits: `npm test` covers SKILL.md ≤ 120 lines / description ≤ 220 chars and turbo.md ≤ 120 lines
- self-check: `cd <wt> && node bin/scope.cjs --base main` prints valid JSON with `mapped: false` (no root runner here) and exit 0; `node bin/state.cjs timings` prints a table or the no-stages message
- manual (post-merge, outside this plan): `/sw:ship --turbo` on a small task in a sample repo shows one interview batch, one gate, no goldfish/threat-model dispatch, `wt create --no-db` when no task needs a DB, scope skip reasons in the PR body, and the timings table

## Rulings
- Ruling: split the foundation into T1 (changed.cjs) and T2 (state) in the same wave — disjoint files, no shared edits, both land before anything that uses them — cost if wrong: none; they could be merged into one serial task.
- Ruling: skill contract tests (T3) are written first in W1 and stay red until W2 — keeps tests/skills.test.cjs in one lane and makes W2 doc tasks test-driven — cost if wrong: W1's wave-end test run shows 14 expected failures.
- Ruling: a `stages` array in a `write()` patch replaces the stored list — gives tests and the no-DB recovery copy a direct way to set stages; `set stage=` never sends `stages` — cost if wrong: a caller passing `stages` by accident would overwrite history (no such caller exists).
- Ruling: timings formatting lives in `lib/state.cjs` as pure `formatTimings(stages, now)` — deterministic tests with a fixed `now` — cost if wrong: none.
- Ruling: scope unit `mode: full` carries no `command`; verify uses the repo's unit command from CLAUDE.local.md — scope.cjs cannot know project scripts reliably — cost if wrong: one extra lookup in verify.
- Ruling: `mode: related` with no usable files (only deleted sources, or a go repo with no `.go` change) falls back to `mode: full` — `--findRelatedTests` with no files is undefined — cost if wrong: a slower unit run.
- Ruling: runner detection — vitest beats jest; a root `package.json` with workspaces and no named jest/vitest is unmapped; any other root `package.json` defaults to jest (design text); unparseable `package.json` → unmapped — cost if wrong: a wrong related command, caught by the "No tests found → full suite" rule or a jest error → full pipeline.
- Ruling: scope.cjs errors print `{"error": …}` to stdout with exit 1 (design says exit 1 `{"error":...}`; matches wt.cjs JSON output style) — cost if wrong: none, verify treats any non-zero exit as "full pipeline".
- Ruling: scope.cjs exports its pure functions behind `require.main === module` — allows in-process tests and coverage — cost if wrong: none.
- Ruling: `bin/coverage-changed.cjs` imports only `toplevel` from `lib/git.cjs` after the change — `git` is no longer used there — cost if wrong: none.
- Ruling: no pointer line in `skills/discover/SKILL.md` — design's pointer table omits it; ship's `--turbo` triage line and turbo.md §2 carry "code-only discover" — cost if wrong: an orchestrator that reads only discover could dispatch researchers on a large turbo task (slower, not unsafe).
- Ruling: `- Needs: db | none` is added to the general plan template (design Decision 3 + user instruction), so non-turbo plans carry it too — harmless for non-turbo, which ignores it — cost if wrong: one extra line per task.
- Ruling: no edits to `agents/*.md`, `bin/wt.cjs`, `bin/session-start.cjs`, `bin/install-lib.cjs` or `site/index.html` — design keeps agent files Opus (tests/agents.test.cjs) and wt.cjs unchanged; the bootstrap/managed blocks don't list flags — cost if wrong: turbo is less discoverable from the session-start hint.
- Ruling: T8 runs alone in W3 (Depends T4–T7) — user asked for a late version task and README/CHANGELOG must describe the final names — cost if wrong: one extra wave of docs-only work.
- Ruling: verify plan has no lint/typecheck/build steps and coverage is best effort via `--experimental-test-coverage` — the repo has no such tooling; child-process (`runNode`) coverage may not be attributed — cost if wrong: coverage under-reported, not a correctness gap.
- Ruling: plan goldfish (readiness + red-team) skipped — user asked to go faster ("làm nhanh lên") after design goldfish already found no Blockers — cost if wrong: a plan gap (e.g. same-wave file overlap) surfaces during build instead of before it
- Ruling: package.json naming neither jest nor vitest is unmapped (full suite) instead of the design's "else jest" — a guessed `npx jest` is wrong for node:test/mocha repos like this one and plan self-check expected mapped:false — cost if wrong: such repos run the full unit suite (slower, never skips a regression)

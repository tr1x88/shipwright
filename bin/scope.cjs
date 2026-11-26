#!/usr/bin/env node
'use strict';
// Verify step selection from changed paths.
//   scope.cjs --base <branch>     (cwd inside the worktree)
// Prints JSON { base, mergeBase, mapped, runner, changed, areas, relatedTests, steps }. Errors: { error }, exit 1.
const fs = require('fs');
const path = require('path');
const { toplevel } = require('./lib/git.cjs');
const changed = require('./lib/changed.cjs');

const ENDPOINT = [/\.(controller|resolver|gateway|handler|routes?)\.[jt]s$/, /(^|\/)app\/.*route\.[jt]s$/, /\/(controllers|handlers|routes)\//, /_handler\.go$/, /\/(http|api)\/.*\.go$/];
const DB = [/schema\.prisma$/, /\/migrations?\//, /\.sql$/, /\.(repository|entity|model)\.[jt]s$/, /\/(repository|store|db)\/.*\.go$/];
const BUILD = [/package\.json$/, /package-lock\.json/, /pnpm-lock\.yaml/, /yarn\.lock/, /bun\.lockb/, /tsconfig.*\.json$/, /\.config\.(js|ts|mjs|cjs)$/, /nest-cli\.json/, /Dockerfile/, /go\.(mod|sum)$/, /(^|\/)main\.(ts|go)$/, /\.module\.ts$/];
const FRONTEND = [/\.(tsx|jsx|vue|svelte|css|scss|sass|less|html)$/];

const matches = (patterns, f) => patterns.some((p) => p.test(f));

function classify(files) {
  return {
    source: files.filter((f) => changed.SOURCE.test(f) && !changed.TEST_FILE.test(f)),
    tests: files.filter((f) => changed.TEST_FILE.test(f)),
    endpoint: files.filter((f) => matches(ENDPOINT, f)),
    db: files.filter((f) => matches(DB, f)),
    build: files.filter((f) => matches(BUILD, f)),
    frontend: files.filter((f) => matches(FRONTEND, f)),
  };
}

function detectRunner(top) {
  const has = (f) => fs.existsSync(path.join(top, f));
  if (has('go.mod')) return { runner: 'go', mapped: true };
  if (!has('package.json')) return { runner: null, mapped: false };
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(top, 'package.json'), 'utf8'));
  } catch {
    return { runner: null, mapped: false };
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const script = (pkg.scripts && pkg.scripts.test) || '';
  const names = (x) => new RegExp(x).test(script) || x in deps;
  let runner;
  if (names('vitest')) runner = 'vitest';
  else if (names('jest') || pkg.jest !== undefined || fs.readdirSync(top).some((f) => /^jest\.config\./.test(f))) runner = 'jest';
  else runner = null; // node:test, mocha, workspaces without a root runner, … → unmapped, verify runs the full suite
  return { runner, mapped: runner !== null };
}

const quote = (f) => `'${(f.startsWith('-') ? './' + f : f).replace(/'/g, "'\\''")}'`;

function relatedCommand(runner, files) {
  if (!files.length) return null;
  const q = files.map(quote).join(' ');
  if (runner === 'jest') return `npx jest --findRelatedTests ${q}`;
  if (runner === 'vitest') return `npx vitest related --run ${q}`;
  if (runner === 'go') {
    const dirs = [...new Set(files.filter((f) => f.endsWith('.go')).map((f) => path.posix.dirname(f)))].map((d) => (d === '.' ? '.' : './' + d));
    return dirs.length ? `go test ${dirs.map(quote).join(' ')}` : null;
  }
  return null;
}

const DOCS = /(\.(md|mdx|txt|rst)$|^docs\/)/i;

function selectSteps({ areas, runner, mapped, relatedTests, files = [] }) {
  if (!mapped) {
    const all = { run: true };
    return { lint: { ...all }, typecheck: { ...all }, unit: { run: true, mode: 'full' }, integration: { ...all }, coverage: { ...all }, build: { ...all }, devServer: { ...all }, smoke: { ...all }, playwright: { ...all } };
  }
  const gate = (cond, reason) => (cond ? { run: true } : { run: false, reason });
  let unit;
  const handled = new Set(Object.values(areas).flat());
  const unclassified = files.some((f) => !handled.has(f) && !DOCS.test(f));
  const mixedGo = runner === 'go' && [...areas.source, ...areas.tests].some((f) => !f.endsWith('.go'));
  if (areas.build.length || unclassified || mixedGo) unit = { run: true, mode: 'full' };
  else if (areas.source.length || areas.tests.length) {
    const cmd = relatedCommand(runner, relatedTests);
    unit = cmd ? { run: true, mode: 'related', command: cmd } : { run: true, mode: 'full' };
  } else unit = { run: false, reason: 'no source or test changes' };
  const { endpoint, db, build, frontend, source } = areas;
  return {
    lint: { run: true },
    typecheck: { run: true },
    unit,
    integration: gate(endpoint.length || db.length, 'no endpoint/DB/migration/handler changes'),
    coverage: gate(unit.run && source.length, 'no changed source files'),
    build: gate(build.length, 'no config/deps/entry changes'),
    devServer: gate(endpoint.length || build.length || frontend.length, 'no endpoint/build/frontend changes'),
    smoke: gate(endpoint.length, 'no endpoint changes'),
    playwright: gate(frontend.length, 'no frontend files changed'),
  };
}

function fail(error) {
  console.log(JSON.stringify({ error }));
  process.exit(1);
}

function parseBase(argv) {
  const eq = argv.find((a) => a.startsWith('--base='));
  if (eq) return eq.slice('--base='.length);
  const i = argv.indexOf('--base');
  return i >= 0 ? argv[i + 1] : undefined;
}

function main() {
  const top = toplevel(process.cwd());
  if (!top) return fail('not a git repository');
  const base = parseBase(process.argv);
  if (!base) return fail('missing --base');
  if (base.startsWith('-')) return fail(`invalid --base: ${base}`);
  let mb;
  try {
    mb = changed.mergeBase(top, base);
  } catch {
    return fail(`unknown base: ${base}`);
  }
  try {
    const files = changed.changedFiles(top, base, { committed: true, from: mb }).filter((f) => !f.startsWith('docs/specs/'));
    const deleted = new Set(changed.changedFiles(top, base, { committed: true, diffFilter: 'D', from: mb }));
    const areas = classify(files);
    const relatedTests = files.filter((f) => !deleted.has(f) && (areas.source.includes(f) || areas.tests.includes(f)));
    const { runner, mapped } = detectRunner(top);
    console.log(JSON.stringify({ base, mergeBase: mb, mapped, runner, changed: files, areas, relatedTests, steps: selectSteps({ areas, runner, mapped, relatedTests, files }) }, null, 2));
  } catch (e) {
    fail(`git failed for base ${base}: ${String(e.message || e).split('\n')[0]}`);
  }
}

if (require.main === module) main();

module.exports = { ENDPOINT, DB, BUILD, FRONTEND, classify, detectRunner, relatedCommand, selectSteps };

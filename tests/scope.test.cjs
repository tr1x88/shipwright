'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { tmpRepo, runNode } = require('./helpers.cjs');
const { classify, relatedCommand } = require('../bin/scope.cjs');
const { spawnSync } = require('child_process');

function repo({ base = {}, branch = {}, remove = [] } = {}) {
  const dir = tmpRepo();
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  const put = (files) => {
    for (const [f, c] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), c);
    }
  };
  put(base);
  g('add', '-A');
  g('commit', '-qm', 'base', '--allow-empty');
  g('switch', '-qc', 'feat/x');
  put(branch);
  for (const f of remove) g('rm', '-q', f);
  g('add', '-A');
  g('commit', '-qm', 'change', '--allow-empty');
  return dir;
}

const JEST = { 'package.json': '{"scripts":{"test":"jest"}}\n' };
const scope = (dir, base = 'master') => runNode('scope.cjs', { cwd: dir, args: ['--base', base] });
const out = (dir) => {
  const r = scope(dir);
  assert.strictEqual(r.code, 0, r.stdout + r.stderr);
  return r.json();
};

describe('scope', () => {
  it('a change touching no area (yaml config) runs full unit', () => {
    const r = out(repo({ base: JEST, branch: { 'config/app.yaml': 'a: 1\n' } }));
    assert.deepStrictEqual(r.steps.unit, { run: true, mode: 'full' });
  });

  it('docs-only change still skips unit', () => {
    const r = out(repo({ base: JEST, branch: { 'README.md': '# x\n' } }));
    assert.strictEqual(r.steps.unit.run, false);
  });

  it('go repo with mixed .go and .tsx changes runs full unit', () => {
    const r = out(repo({ base: { 'go.mod': 'module x\n' }, branch: { 'svc/a.go': 'package svc\n', 'web/App.tsx': 'export {};\n' } }));
    assert.deepStrictEqual(r.steps.unit, { run: true, mode: 'full' });
  });

  it('jest service-only change runs related unit and skips integration, build, devServer, smoke, playwright with reasons', () => {
    const r = out(repo({ base: JEST, branch: { 'src/orders/refund.service.ts': 'export const a = 1;\n' } }));
    assert.strictEqual(r.runner, 'jest');
    assert.strictEqual(r.mapped, true);
    assert.deepStrictEqual(r.steps.unit, { run: true, mode: 'related', command: "npx jest --findRelatedTests 'src/orders/refund.service.ts'" });
    assert.deepStrictEqual(r.relatedTests, ['src/orders/refund.service.ts']);
    assert.strictEqual(r.steps.coverage.run, true);
    for (const s of ['integration', 'build', 'devServer', 'smoke', 'playwright']) {
      assert.strictEqual(r.steps[s].run, false, s);
      assert.ok(r.steps[s].reason, s);
    }
  });

  it('controller change runs integration, devServer and smoke', () => {
    const r = out(repo({ base: JEST, branch: { 'src/orders/orders.controller.ts': 'export {};\n' } }));
    assert.strictEqual(r.steps.integration.run, true);
    assert.strictEqual(r.steps.devServer.run, true);
    assert.strictEqual(r.steps.smoke.run, true);
  });

  it('prisma schema change runs integration and skips devServer', () => {
    const r = out(repo({ base: JEST, branch: { 'prisma/schema.prisma': 'model A {}\n' } }));
    assert.strictEqual(r.steps.integration.run, true);
    assert.strictEqual(r.steps.devServer.run, false);
    assert.strictEqual(r.steps.unit.run, false);
  });

  it('package.json change runs build and devServer with full unit', () => {
    const r = out(repo({ base: JEST, branch: { 'package.json': '{"scripts":{"test":"jest","build":"tsc"}}\n' } }));
    assert.strictEqual(r.steps.build.run, true);
    assert.strictEqual(r.steps.devServer.run, true);
    assert.strictEqual(r.steps.unit.mode, 'full');
    assert.strictEqual(r.steps.unit.command, undefined);
  });

  it('tsx change runs playwright and devServer', () => {
    const r = out(repo({ base: JEST, branch: { 'src/App.tsx': 'export {};\n' } }));
    assert.strictEqual(r.steps.playwright.run, true);
    assert.strictEqual(r.steps.devServer.run, true);
  });

  it('vitest repo uses vitest related --run', () => {
    const r = out(repo({ base: { 'package.json': '{"devDependencies":{"vitest":"^1.0.0"}}\n' }, branch: { 'src/a.ts': 'export {};\n' } }));
    assert.strictEqual(r.steps.unit.command, "npx vitest related --run 'src/a.ts'");
  });

  it('go change runs go test on the changed package', () => {
    const r = out(repo({ base: { 'go.mod': 'module example.com/x\n\ngo 1.22\n' }, branch: { 'internal/orders/x.go': 'package orders\n' } }));
    assert.strictEqual(r.runner, 'go');
    assert.strictEqual(r.steps.unit.command, "go test './internal/orders'");
  });

  it('repo without a runner is unmapped and runs every step', () => {
    const r = out(repo({ branch: { 'src/a.ts': 'export {};\n' } }));
    assert.strictEqual(r.mapped, false);
    assert.strictEqual(r.runner, null);
    for (const s of Object.values(r.steps)) assert.strictEqual(s.run, true);
    assert.strictEqual(r.steps.unit.mode, 'full');
  });

  it('package.json naming neither jest nor vitest (node --test) is unmapped, never a guessed jest command', () => {
    const r = out(repo({ base: { 'package.json': '{"scripts":{"test":"node --test tests/*.test.cjs"}}\n' }, branch: { 'bin/a.cjs': 'module.exports = 1;\n' } }));
    assert.strictEqual(r.mapped, false);
    assert.strictEqual(r.runner, null);
    assert.strictEqual(r.steps.unit.mode, 'full');
  });

  it('workspaces without a root runner is unmapped', () => {
    const r = out(repo({ base: { 'package.json': '{"workspaces":["packages/*"]}\n' }, branch: { 'packages/a/src/x.ts': 'export {};\n' } }));
    assert.strictEqual(r.mapped, false);
  });

  it('only docs/specs changes skip unit', () => {
    const r = out(repo({ base: JEST, branch: { 'docs/specs/261126-x/design.md': '# d\n' } }));
    assert.deepStrictEqual(r.changed, []);
    assert.strictEqual(r.steps.unit.run, false);
  });

  it('deleted controller still runs integration and is not in relatedTests', () => {
    const f = 'src/orders/orders.controller.ts';
    const r = out(repo({ base: { ...JEST, [f]: 'export {};\n' }, remove: [f] }));
    assert.ok(r.areas.endpoint.includes(f));
    assert.strictEqual(r.steps.integration.run, true);
    assert.deepStrictEqual(r.relatedTests, []);
    assert.strictEqual(r.steps.unit.mode, 'full');
  });

  it('a .dto.ts change counts as source', () => {
    const r = out(repo({ base: JEST, branch: { 'src/orders/create-order.dto.ts': 'export {};\n' } }));
    assert.ok(r.areas.source.includes('src/orders/create-order.dto.ts'));
  });

  it('unknown base exits 1 with an error', () => {
    const r = scope(repo({ base: JEST }), 'nope');
    assert.strictEqual(r.code, 1);
    assert.match(r.json().error, /unknown base/);
  });

  it('missing --base exits 1 with an error', () => {
    const r = runNode('scope.cjs', { cwd: repo({ base: JEST }) });
    assert.strictEqual(r.code, 1);
    assert.strictEqual(r.json().error, 'missing --base');
  });

  it('classify puts a file in every matching area', () => {
    const a = classify(['src/main.ts']);
    assert.ok(a.source.includes('src/main.ts') && a.build.includes('src/main.ts'));
    const b = classify(['src/users/user.repository.ts']);
    assert.ok(b.source.includes('src/users/user.repository.ts') && b.db.includes('src/users/user.repository.ts'));
  });

  it('quotes hostile file names so the shell neither executes nor splits them', () => {
    const marker = path.join(fs.realpathSync(require('os').tmpdir()), `sw-inject-${process.pid}`);
    const names = ['a b.ts', `$(touch ${marker}).ts`, 'x`y`.ts', '-rf.ts', "it's.ts"];
    const cmd = relatedCommand('jest', names);
    const args = cmd.replace('npx jest --findRelatedTests ', '');
    const r = spawnSync('sh', ['-c', `printf '%s\\n' ${args}`], { encoding: 'utf8' });
    assert.deepStrictEqual(r.stdout.split('\n').slice(0, -1), ['a b.ts', `$(touch ${marker}).ts`, 'x`y`.ts', './-rf.ts', "it's.ts"]);
    assert.ok(!fs.existsSync(marker));
    assert.strictEqual(cmd, `npx jest --findRelatedTests 'a b.ts' '$(touch ${marker}).ts' 'x\`y\`.ts' './-rf.ts' 'it'\\''s.ts'`);
  });

  it('quotes go package dirs', () => {
    const cmd = relatedCommand('go', ["pkg/it's here/a.go"]);
    assert.strictEqual(cmd, "go test './pkg/it'\\''s here'");
  });

  it('non-ASCII controller path and a path with a space are classified', () => {
    const r = out(repo({ base: JEST, branch: { 'src/api/đơn.controller.ts': 'export {};\n', 'src/my file.service.ts': 'export {};\n' } }));
    assert.deepStrictEqual(r.changed.sort(), ['src/api/đơn.controller.ts', 'src/my file.service.ts']);
    assert.strictEqual(r.steps.integration.run, true);
    assert.strictEqual(r.steps.smoke.run, true);
  });

  it('rejects a --base starting with a dash, accepts --base=<x>', () => {
    const dir = repo({ base: JEST, branch: { 'src/a.service.ts': 'export {};\n' } });
    const bad = runNode('scope.cjs', { cwd: dir, args: ['--base', '--output=x'] });
    assert.strictEqual(bad.code, 1);
    assert.ok(bad.json().error);
    const eq = runNode('scope.cjs', { cwd: dir, args: ['--base=master'] });
    assert.strictEqual(eq.code, 0, eq.stdout + eq.stderr);
    assert.strictEqual(eq.json().base, 'master');
  });
});

'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { tmpRepo } = require('./helpers.cjs');
const { TEST_FILE, NOT_COVERED, mergeBase, changedFiles, isCoverageTarget } = require('../bin/lib/changed.cjs');

const OLD_SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|go|vue|svelte)$/;
const OLD_TEST = /(\.(spec|test|e2e-spec)\.[jt]sx?$|_test\.go$|\/(__tests__|test|tests|e2e)\/|\.d\.ts$|\.(config|setup)\.[jt]s$|\/migrations?\/|\/dto\/|\.dto\.ts$|\.module\.ts$|main\.ts$)/;

const FIXTURE = [
  'src/orders/refund.service.ts', 'src/orders/refund.service.spec.ts', 'src/orders/refund.test.tsx',
  'test/app.e2e-spec.ts', 'internal/orders/refund.go', 'internal/orders/refund_test.go',
  'src/__tests__/refund.ts', 'src/test/helpers.ts', 'apps/api/tests/util.js', 'apps/web/e2e/login.ts',
  'types/global.d.ts', 'jest.config.ts', 'vitest.setup.js', 'prisma/migrations/001/migration.ts',
  'src/db/migration/002.ts', 'src/orders/dto/create.ts', 'src/orders/create-order.dto.ts',
  'src/orders/orders.module.ts', 'src/main.ts', 'apps/web/src/App.tsx', 'web/components/Button.vue',
  'lib/index.mjs', 'bin/tool.cjs', 'README.md', 'src/orders/orders.controller.ts',
];

function gitRepo() {
  const dir = tmpRepo();
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/old.controller.ts'), 'export const old = 1;\n');
  g('add', '-A');
  g('commit', '-qm', 'old');
  g('switch', '-qc', 'feat/x');
  g('rm', '-q', 'src/old.controller.ts');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/new.service.ts'), 'completely different content\n'); // distinct content: avoids rename detection
  g('add', '-A');
  g('commit', '-qm', 'change');
  fs.writeFileSync(path.join(dir, 'README.md'), '# edited\n');
  return dir;
}

describe('changed classifier', () => {
  it('TEST_FILE ∪ NOT_COVERED equals the old coverage TEST regex on every fixture path', () => {
    for (const p of FIXTURE) assert.equal(OLD_TEST.test(p), TEST_FILE.test(p) || NOT_COVERED.test(p), p);
  });

  it('isCoverageTarget equals the old SOURCE && !TEST filter', () => {
    for (const p of FIXTURE) assert.equal(isCoverageTarget(p), OLD_SOURCE.test(p) && !OLD_TEST.test(p), p);
  });

  it('changedFiles committed:true excludes uncommitted edits and includes deletions', () => {
    const dir = gitRepo();
    const files = changedFiles(dir, 'master', { committed: true });
    assert.ok(files.includes('src/old.controller.ts'));
    assert.ok(files.includes('src/new.service.ts'));
    assert.ok(!files.includes('README.md'));
  });

  it('changedFiles committed:false includes uncommitted edits of tracked files', () => {
    const dir = gitRepo();
    assert.ok(changedFiles(dir, 'master').includes('README.md'));
  });

  it("changedFiles diffFilter 'AM' excludes deletions", () => {
    const dir = gitRepo();
    const files = changedFiles(dir, 'master', { diffFilter: 'AM' });
    assert.ok(files.includes('src/new.service.ts'));
    assert.ok(!files.includes('src/old.controller.ts'));
  });

  it('mergeBase throws for an unknown base', () => {
    const dir = gitRepo();
    assert.throws(() => mergeBase(dir, 'nope'));
  });
});

describe('changedFiles paths', () => {
  it('returns non-ASCII and spaced paths verbatim', () => {
    const dir = tmpRepo();
    const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
    g('switch', '-qc', 'feat/y');
    fs.mkdirSync(path.join(dir, 'src/api'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/api/đơn.controller.ts'), 'x\n');
    fs.writeFileSync(path.join(dir, 'src/a b.ts'), 'y\n');
    g('add', '-A');
    g('commit', '-qm', 'c');
    assert.deepStrictEqual(changedFiles(dir, 'master', { committed: true }).sort(), ['src/a b.ts', 'src/api/đơn.controller.ts']);
  });
});

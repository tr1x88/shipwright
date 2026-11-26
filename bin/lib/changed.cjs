'use strict';
// Changed files vs a base branch + the shared source/test classifier (coverage-changed.cjs, scope.cjs).
const { git } = require('./git.cjs');

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|go|vue|svelte)$/;
const TEST_FILE = /(\.(spec|test|e2e-spec)\.[jt]sx?$|_test\.go$|\/(__tests__|test|tests|e2e)\/)/;
const NOT_COVERED = /(\.d\.ts$|\.(config|setup)\.[jt]s$|\/migrations?\/|\/dto\/|\.dto\.ts$|\.module\.ts$|main\.ts$)/;

function mergeBase(top, base) {
  return git(['merge-base', base, 'HEAD'], top);
}

function changedFiles(top, base, { diffFilter = null, committed = false, from = null } = {}) {
  const args = ['-c', 'core.quotePath=false', 'diff', '-z', '--name-only'];
  if (diffFilter) args.push(`--diff-filter=${diffFilter}`);
  args.push(from || mergeBase(top, base));
  if (committed) args.push('HEAD');
  return git(args, top).split('\0').filter(Boolean);
}

const isCoverageTarget = (f) => SOURCE.test(f) && !TEST_FILE.test(f) && !NOT_COVERED.test(f);

module.exports = { SOURCE, TEST_FILE, NOT_COVERED, mergeBase, changedFiles, isCoverageTarget };

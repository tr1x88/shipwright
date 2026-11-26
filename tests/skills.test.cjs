'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILLS = path.join(__dirname, '..', 'skills');
const skills = fs.readdirSync(SKILLS).filter((d) => fs.existsSync(path.join(SKILLS, d, 'SKILL.md')));

function read(name) {
  return fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8');
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const out = {};
  if (m) for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

test('threat-model skill is present', () => {
  assert.ok(skills.includes('threat-model'));
});

test('drift skill is present', () => {
  assert.ok(skills.includes('drift'));
});

for (const name of skills) {
  test(`${name}: name matches directory and description exists`, () => {
    const fm = frontmatter(read(name));
    assert.strictEqual(fm.name, name);
    assert.ok(fm.description, 'description missing');
  });

  test(`${name}: description ≤ 220 chars`, () => {
    assert.ok(frontmatter(read(name)).description.length <= 220);
  });

  test(`${name}: SKILL.md ≤ 120 lines`, () => {
    assert.ok(read(name).trimEnd().split('\n').length <= 120);
  });

  test(`${name}: reference links resolve`, () => {
    for (const m of read(name).matchAll(/\]\((references\/[^)#\s]+)\)/g)) {
      assert.ok(fs.existsSync(path.join(SKILLS, name, m[1])), `${name}: missing ${m[1]}`);
    }
  });
}

const TURBO = path.join(SKILLS, 'ship', 'references', 'turbo.md');
const turboText = () => fs.readFileSync(TURBO, 'utf8');

test('turbo.md exists and is ≤ 120 lines', () => {
  assert.ok(fs.existsSync(TURBO), 'turbo.md missing');
  assert.ok(turboText().trimEnd().split('\n').length <= 120);
});

test('ship links references/turbo.md', () => {
  assert.ok(read('ship').includes('](references/turbo.md)'));
});

test('ship argument-hint offers --turbo', () => {
  assert.ok((frontmatter(read('ship'))['argument-hint'] || '').includes('--turbo'));
});

test('turbo.md names the spec, model, scope, Needs field and the notice', () => {
  const text = turboText();
  for (const s of [
    'spec.md',
    'model: sonnet',
    'scope.cjs',
    'Needs: db | none',
    'turbo: threat-model trigger matched (<trigger>) — skipped by --turbo',
  ]) assert.ok(text.includes(s), `missing: ${s}`);
});

test('turbo.md §5 documents the --no-db path', () => {
  const m = turboText().match(/^## 5\. Worktree\n([\s\S]*?)(?=^## )/m);
  assert.ok(m, '§5 Worktree section missing');
  assert.ok(m[1].includes('--no-db'));
});

test('verify SKILL.md selects steps with scope.cjs', () => {
  assert.ok(read('verify').includes('scope.cjs'));
});

test('plan template declares Needs: db | none', () => {
  assert.ok(read('plan').includes('- Needs: db | none'));
});

for (const s of ['architect', 'plan', 'worktree', 'build', 'verify', 'review', 'pr']) {
  test(`${s}: points to turbo.md`, () => {
    assert.ok(read(s).includes('skills/ship/references/turbo.md'));
  });
}

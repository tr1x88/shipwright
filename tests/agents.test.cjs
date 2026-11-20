'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const AGENTS = path.join(__dirname, '..', 'agents');
const agents = fs.readdirSync(AGENTS).filter((f) => f.endsWith('.md'));

function frontmatter(file) {
  const text = fs.readFileSync(path.join(AGENTS, file), 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const out = {};
  if (m) for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

for (const file of agents) {
  const fm = frontmatter(file);
  test(`${file}: name matches file`, () => {
    assert.strictEqual(fm.name, path.basename(file, '.md'));
  });
  test(`${file}: description ≤ 220 chars`, () => {
    assert.ok(fm.description, 'description missing');
    assert.ok(fm.description.length <= 220, `${fm.description.length} chars`);
  });
  test(`${file}: model and tools pinned`, () => {
    assert.ok(['haiku', 'sonnet', 'opus'].includes(fm.model), `model: ${fm.model}`);
    assert.ok(fm.tools, 'tools missing');
  });
}

test('sw-goldfish is present and read-only', () => {
  assert.ok(agents.includes('sw-goldfish.md'), 'agents/sw-goldfish.md missing');
  const tools = frontmatter('sw-goldfish.md').tools.split(',').map((t) => t.trim());
  for (const t of ['Edit', 'Write', 'NotebookEdit']) assert.ok(!tools.includes(t), `has ${t}`);
});

test('planning agents are pinned to opus and cannot edit code', () => {
  for (const f of ['sw-designer.md', 'sw-planner.md']) {
    assert.ok(agents.includes(f), `${f} missing`);
    const fm = frontmatter(f);
    assert.strictEqual(fm.model, 'opus');
    const tools = fm.tools.split(',').map((t) => t.trim());
    assert.ok(!tools.includes('Edit'), `${f} has Edit`);
  }
  assert.strictEqual(frontmatter('sw-goldfish.md').model, 'opus');
});

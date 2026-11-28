'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { BIN, runNode, tmpRepo } = require('./helpers.cjs');
const state = require('../bin/lib/state.cjs');
const db = require('../bin/lib/db.cjs');

const PLAN = `# Plan: demo
## Tasks
### T1: foundation types
- Files: a.ts
### T2: refund endpoint
- Depends: T1
### T3: list endpoint
## Waves
- W1 (serial): T1 — foundation, T2 and T3 depend on it
- W2 (parallel): T2, T3 — disjoint files
## Verify
`;

test('parsePlan: ids, titles and waves (ids after the dash are not wave members)', () => {
  assert.deepEqual(db.parsePlan(PLAN), [
    { id: 'T1', title: 'foundation types', wave: 1 },
    { id: 'T2', title: 'refund endpoint', wave: 2 },
    { id: 'T3', title: 'list endpoint', wave: 2 },
  ]);
});

test('state writes log stage changes once; tickets sync, move and report', () => {
  const dir = tmpRepo();
  fs.writeFileSync(path.join(dir, 'plan.md'), PLAN);
  state.write(dir, { slug: 'demo', size: 'small', stage: 'plan' });
  state.write(dir, { round: 1 });
  state.write(dir, { stage: 'build' });
  const t = (...args) => runNode('ticket.cjs', { cwd: dir, args });

  assert.equal(t('sync', 'plan.md').json().synced, 3);
  assert.equal(t('set', 'T1', 'status=done').code, 0);
  assert.notEqual(t('set', 'T9', 'status=done').code, 0, 'unknown id fails');
  assert.notEqual(t('set', 'T2', 'status=nope').code, 0, 'bad status fails');
  t('sync', 'plan.md'); // re-sync keeps status
  assert.deepEqual(t('list').json().map((k) => [k.id, k.status]), [['T1', 'done'], ['T2', 'todo'], ['T3', 'todo']]);

  const task = db.snapshot().tasks.find((x) => x.repo === dir && x.slug === 'demo');
  assert.deepEqual(task.stages.map((s) => s.stage), ['plan', 'build']);
  assert.match(t('report').stdout, /\| plan \|[\s\S]*\| T1 foundation types \| 1 \| done \|/);
});

test('ticket-hook: an implementer dispatch marks its Ticket: line as doing, nothing else', () => {
  const root = tmpRepo();
  const wt = path.join(root, '.worktree', 'feat-hook');
  fs.mkdirSync(wt, { recursive: true });
  state.write(wt, { slug: 'hook', stage: 'build', mainRoot: root });
  for (const id of ['T1', 'T2']) db.addTicket(root, 'hook', { id, title: id });
  const fire = (subagent_type) => runNode('ticket-hook.cjs', { input: JSON.stringify({ tool_name: 'Agent',
    tool_input: { subagent_type, prompt: `Worktree: ${wt}\nTicket: T2\nPlan: ${wt}/plan.md (T2 depends on T1)` } }) });
  const statuses = () => Object.fromEntries(db.snapshot().tasks.find((x) => x.slug === 'hook').tickets.map((k) => [k.id, k.status]));

  assert.equal(fire('sw:sw-reviewer').code, 0);
  assert.deepEqual(statuses(), { T1: 'todo', T2: 'todo' });
  assert.equal(fire('sw:sw-implementer').code, 0);
  assert.deepEqual(statuses(), { T1: 'todo', T2: 'doing' });
  assert.equal(runNode('ticket-hook.cjs', { input: 'garbage' }).code, 0);
});

test('ui server: serves the page, the state and a ticket\'s plan section', async () => {
  const dir = tmpRepo();
  fs.writeFileSync(path.join(dir, 'plan.md'), PLAN);
  state.write(dir, { slug: 'ui', stage: 'build' });
  db.syncPlan(dir, 'ui', path.join(dir, 'plan.md'));
  const port = 20000 + (process.pid % 20000);
  const srv = spawn('node', [path.join(BIN, 'ui.cjs'), '--port', String(port)], { env: process.env });
  try {
    await new Promise((ok, bad) => { srv.stdout.once('data', ok); srv.once('exit', bad); });
    const base = `http://127.0.0.1:${port}`;
    assert.match(await (await fetch(base)).text(), /Shipwright Board/);
    const s = await (await fetch(`${base}/api/state`)).json();
    assert.equal(s.tasks.find((x) => x.slug === 'ui').tickets.length, 3);
    const q = new URLSearchParams({ repo: dir, slug: 'ui', id: 'T2' });
    assert.equal((await (await fetch(`${base}/api/ticket?${q}`)).json()).body, '### T2: refund endpoint\n- Depends: T1');
    assert.equal((await fetch(`${base}/api/ticket?repo=x&slug=y&id=T1`)).status, 404);
  } finally {
    srv.kill();
  }
});

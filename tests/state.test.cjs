'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runNode } = require('./helpers.cjs');
const state = require('../bin/lib/state.cjs');

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sw-state-')));
const set = (dir, ...args) => runNode('state.cjs', { cwd: dir, args: ['set', ...args] });
const names = (s) => s.stages.map((x) => x.stage);

const STAGES = [
  { stage: 'discover', at: '2026-11-26T10:00:03.000Z' },
  { stage: 'spec', at: '2026-11-26T10:03:15.000Z' },
  { stage: 'build', at: '2026-11-26T10:09:55.000Z' },
];

describe('state stages', () => {
  it('set stage= appends {stage, at} and skips a consecutive duplicate', () => {
    const dir = tmp();
    set(dir, 'stage=discover');
    set(dir, 'stage=discover');
    const s = set(dir, 'stage=spec').json();
    assert.deepEqual(names(s), ['discover', 'spec']);
    for (const x of s.stages) assert.ok(!Number.isNaN(Date.parse(x.at)));
  });

  it('re-entering an earlier stage appends a new entry', () => {
    const dir = tmp();
    set(dir, 'stage=discover');
    set(dir, 'stage=spec');
    const s = set(dir, 'stage=discover').json();
    assert.deepEqual(names(s), ['discover', 'spec', 'discover']);
  });

  it('set coerces true/false to booleans; digits and null unchanged', () => {
    const dir = tmp();
    const s = set(dir, 'turbo=true', 'flag=false', 'round=2', 'db=null', 'name=x').json();
    assert.strictEqual(s.turbo, true);
    assert.strictEqual(s.flag, false);
    assert.strictEqual(s.round, 2);
    assert.strictEqual(s.db, null);
    assert.strictEqual(s.name, 'x');
  });

  it('a new state written with mainRoot seeds stages and turbo from main', () => {
    const main = tmp();
    const wt = tmp();
    state.write(main, { slug: 'x', stages: STAGES.slice(0, 2), turbo: true });
    state.write(main, { size: 'large' });
    const s = state.write(wt, { stage: 'worktree', mainRoot: main, slug: 'x' });
    assert.deepEqual(names(s), ['discover', 'spec', 'worktree']);
    assert.strictEqual(s.turbo, true);
    assert.strictEqual(s.slug, 'x');
    assert.ok(!('size' in s));
  });

  it('does not seed from mainRoot when its slug differs', () => {
    const main = tmp();
    const wt = tmp();
    state.write(main, { slug: 'old', stages: STAGES, turbo: true });
    const s = state.write(wt, { stage: 'worktree', mainRoot: main, slug: 'new' });
    assert.deepEqual(names(s), ['worktree']);
    assert.ok(!('turbo' in s));
  });

  it('a different slug drops prior stages and turbo', () => {
    const dir = tmp();
    state.write(dir, { slug: 'old', turbo: true, stages: STAGES });
    const s = state.write(dir, { slug: 'new', stage: 'discover' });
    assert.deepEqual(names(s), ['discover']);
    assert.ok(!('turbo' in s));
    const same = state.write(dir, { slug: 'new', stage: 'spec' });
    assert.deepEqual(names(same), ['discover', 'spec']);
  });

  it('set turbo=false overrides a stale turbo=true', () => {
    const dir = tmp();
    set(dir, 'turbo=true');
    assert.strictEqual(set(dir, 'turbo=false').json().turbo, false);
  });

  it('an existing state is not re-seeded from mainRoot', () => {
    const main = tmp();
    const wt = tmp();
    state.write(main, { stages: STAGES.slice(0, 2), turbo: true });
    state.write(wt, { stage: 'build' });
    const s = state.write(wt, { mainRoot: main });
    assert.deepEqual(names(s), ['build']);
  });

  it('old state without stages still works', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, '.sw-state.json'), '{"slug":"x","stage":"build"}');
    const t = runNode('state.cjs', { cwd: dir, args: ['timings'] });
    assert.equal(t.code, 0);
    assert.equal(t.stdout.trim(), 'no stage timings recorded');
    assert.equal(runNode('state.cjs', { cwd: dir, args: ['get'] }).json().slug, 'x');
    assert.deepEqual(names(set(dir, 'stage=verify').json()), ['verify']);
  });
});

describe('state timings', () => {
  it('timings: per-stage durations, last stage running, total', () => {
    const out = state.formatTimings(STAGES, Date.parse('2026-11-26T10:41:08.000Z'));
    assert.match(out.split('\n')[0], /^stage\s+started\s+duration$/);
    assert.match(out, /^discover\s+2026-11-26T10:00:03Z\s+3m12s$/m);
    assert.match(out, /^spec\s+2026-11-26T10:03:15Z\s+6m40s$/m);
    assert.match(out, /^build\s+2026-11-26T10:09:55Z\s+31m13s \(running\)$/m);
    assert.match(out, /^total\s+41m05s$/m);
  });

  it('timings: done gets no row and closes the total', () => {
    const stages = [...STAGES, { stage: 'done', at: '2026-11-26T10:41:08.000Z' }];
    const out = state.formatTimings(stages, Date.parse('2026-11-26T12:00:00.000Z'));
    assert.ok(!/^done/m.test(out));
    assert.match(out, /^build\s+2026-11-26T10:09:55Z\s+31m13s$/m);
    assert.match(out, /^total\s+41m05s$/m);
  });

  it('timings CLI: no stages prints the message and exits 0', () => {
    const r = runNode('state.cjs', { cwd: tmp(), args: ['timings'] });
    assert.equal(r.code, 0);
    assert.equal(r.stdout.trim(), 'no stage timings recorded');
  });
});

describe('state malformed stages', () => {
  it('drops malformed entries from the file and from mainRoot without throwing', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, '.sw-state.json'), JSON.stringify({ stages: [null, 5, { stage: 'x' }, { stage: 'spec', at: '2026-11-26T10:03:15.000Z' }] }));
    const s = state.write(dir, { stage: 'build' });
    assert.deepEqual(s.stages.map((x) => x.stage), ['spec', 'build']);
    const main = tmp();
    fs.writeFileSync(path.join(main, '.sw-state.json'), JSON.stringify({ slug: 'x', stages: [null, { at: 'z' }, ...STAGES] }));
    const wt = tmp();
    const s2 = state.write(wt, { mainRoot: main, stage: 'verify', slug: 'x' });
    assert.deepEqual(s2.stages.map((x) => x.stage), ['discover', 'spec', 'build', 'verify']);
  });

  it('formatTimings ignores malformed entries', () => {
    assert.doesNotThrow(() => state.formatTimings([null, { stage: 'a' }, ...STAGES]));
  });
});

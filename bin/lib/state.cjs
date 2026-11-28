'use strict';
// Per-task state at <worktree>/.sw-state.json — written by stages, read by the statusline.
const fs = require('fs');
const path = require('path');

const FILE = '.sw-state.json';

const validStages = (a) => (Array.isArray(a) ? a.filter((s) => typeof s?.stage === 'string' && typeof s.at === 'string') : []);

function file(dir) {
  return path.join(dir, FILE);
}

function read(dir) {
  try {
    return JSON.parse(fs.readFileSync(file(dir), 'utf8'));
  } catch {
    return null;
  }
}

function write(dir, patch) {
  const prev = read(dir);
  let cur = prev || {};
  if (prev && patch.slug && prev.slug !== patch.slug) {
    const { stages: _s, turbo: _t, ...rest } = prev;
    cur = rest;
  }
  if (!prev && patch.mainRoot) {
    const m = read(patch.mainRoot);
    if (m && m.slug === patch.slug) {
      cur = {};
      if (Array.isArray(m.stages)) cur.stages = validStages(m.stages);
      if ('turbo' in m) cur.turbo = m.turbo;
    }
  }
  const now = new Date().toISOString();
  const next = { ...cur, ...patch, updatedAt: now };
  const stages = validStages(next.stages);
  if (typeof patch.stage === 'string' && patch.stage
    && (stages.length === 0 || stages[stages.length - 1].stage !== patch.stage)) {
    stages.push({ stage: patch.stage, at: now });
  }
  if (stages.length) next.stages = stages;
  fs.writeFileSync(file(dir), JSON.stringify(next, null, 2) + '\n');
  if (next.slug && next.stage) {
    try {
      require('./db.cjs').trackStage(next.mainRoot || dir, next.slug, next.size, next.stage); // stage timings + board
    } catch {
      /* Node < 22.5 or a locked DB: the state file is still the source for statusline/resume */
    }
  }
  return next;
}

const pad2 = (n) => String(n).padStart(2, '0');

function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h${pad2(m)}m${pad2(sec)}s` : `${m}m${pad2(sec)}s`;
}

function formatTimings(raw, now = Date.now()) {
  const stages = validStages(raw);
  if (!stages.length) return 'no stage timings recorded';
  const iso = (at) => at.replace(/\.\d{3}Z$/, 'Z');
  const lines = ['stage'.padEnd(11) + 'started'.padEnd(22) + 'duration'];
  stages.forEach((st, i) => {
    if (st.stage === 'done') return;
    const next = stages[i + 1];
    const ms = (next ? Date.parse(next.at) : now) - Date.parse(st.at);
    lines.push(st.stage.padEnd(11) + iso(st.at).padEnd(22) + dur(ms) + (next ? '' : ' (running)'));
  });
  const last = stages[stages.length - 1];
  const end = last.stage === 'done' ? Date.parse(last.at) : now;
  lines.push('total'.padEnd(33) + dur(end - Date.parse(stages[0].at)));
  return lines.join('\n');
}

module.exports = { FILE, file, read, write, formatTimings };

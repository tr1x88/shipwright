#!/usr/bin/env node
'use strict';
// Tickets of the current task (status in the shared SQLite DB, text in plan.md). Run inside the task's worktree.
//   ticket.cjs sync <plan.md>                 create/refresh tickets from the plan's `### T<n>:` tasks and `## Waves`
//   ticket.cjs add T1 <title> [wave=1]        a ticket without a plan (quick tasks)
//   ticket.cjs set T2 T3 status=done          todo | doing | done | blocked   [agent=<name>]
//   ticket.cjs list                           JSON
//   ticket.cjs report                         stage + ticket durations (markdown)
const { toplevel, mainRoot } = require('./lib/git.cjs');
const state = require('./lib/state.cjs');
const db = require('./lib/db.cjs');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function dur(from, to) {
  if (!from) return '—';
  const s = Math.max(0, Math.round((new Date(to || Date.now()) - new Date(from)) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

function report(task) {
  const lines = ['| Stage | Time |', '|---|---|'];
  task.stages.forEach((s, i) => {
    const next = task.stages[i + 1];
    if (s.stage !== 'done') lines.push(`| ${s.stage} | ${dur(s.at, next && next.at)} |`);
  });
  if (task.stages.length) lines.push(`| **total** | ${dur(task.stages[0].at, task.stage === 'done' ? task.stages.at(-1).at : null)} |`);
  if (task.tickets.length) {
    lines.push('', '| Ticket | Wave | Status | Time |', '|---|---|---|---|');
    for (const t of task.tickets) lines.push(`| ${t.id} ${t.title} | ${t.wave ?? '—'} | ${t.status} | ${dur(t.started_at, t.ended_at)} |`);
  }
  return lines.join('\n');
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const top = toplevel(process.cwd()) || process.cwd();
  const s = state.read(top);
  if (!s || !s.slug) fail('No active task here (.sw-state.json has no slug). Run inside the task worktree.');
  const repo = s.mainRoot || mainRoot(top) || top;
  const opts = Object.fromEntries(rest.filter((a) => /^\w+=/.test(a)).map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]));
  const words = rest.filter((a) => !/^\w+=/.test(a));

  if (cmd === 'sync') {
    if (!words[0]) fail('Usage: ticket.cjs sync <plan.md>');
    const tickets = db.syncPlan(repo, s.slug, words[0]);
    if (!tickets.length) fail(`No "### T<n>: <name>" tasks found in ${words[0]}`);
    console.log(JSON.stringify({ synced: tickets.length, tickets }));
  } else if (cmd === 'add') {
    if (!/^T\d+$/.test(words[0] || '') || words.length < 2) fail('Usage: ticket.cjs add T<n> <title> [wave=<n>]');
    db.addTicket(repo, s.slug, { id: words[0], title: words.slice(1).join(' '), wave: opts.wave ? Number(opts.wave) : null });
    console.log(`added ${words[0]}`);
  } else if (cmd === 'set') {
    if (!words.length || !opts.status) fail('Usage: ticket.cjs set T<n>... status=todo|doing|done|blocked [agent=<name>]');
    const changed = db.setTickets(repo, s.slug, words, opts);
    if (changed !== words.length) fail(`updated ${changed}/${words.length} — unknown ticket id? (ticket.cjs list)`);
    console.log(`${words.join(' ')} → ${opts.status}`);
  } else {
    const task = db.snapshot().tasks.find((t) => t.repo === repo && t.slug === s.slug) || { stages: [], tickets: [] };
    console.log(cmd === 'report' ? report(task) : JSON.stringify(task.tickets));
  }
}

try {
  main();
} catch (e) {
  fail(e.code === 'ERR_UNKNOWN_BUILTIN_MODULE' ? 'Tickets need Node >= 22.5 (node:sqlite).' : e.message);
}

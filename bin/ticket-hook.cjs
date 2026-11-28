#!/usr/bin/env node
'use strict';
// PreToolUse(Agent): when an sw-implementer is dispatched with a `Ticket: T3` (or `Tickets: T1, T2`) line and its
// worktree path in the prompt, mark those tickets `doing` — the board stays live without relying on the model.
const { readInput, safe } = require('./lib/hook.cjs');
const cfg = require('./lib/config.cjs');
const state = require('./lib/state.cjs');

safe(() => {
  const { tool_input: input = {} } = readInput();
  if (!/sw-implementer$/.test(input.subagent_type || '')) return;
  const prompt = String(input.prompt || '');
  const line = prompt.match(/^\s*Tickets?:\s*(.+)$/m);
  const ids = line ? line[1].match(/\bT\d+\b/g) : null;
  const dir = cfg.load().worktreeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wt = prompt.match(new RegExp(`(/[^\\s\`'"]*/${dir}/[^/\\s\`'"]+)`));
  const s = wt && state.read(wt[1]);
  if (!ids || !s || !s.slug) return;
  require('./lib/db.cjs').setTickets(s.mainRoot || wt[1], s.slug, ids, { status: 'doing', agent: 'sw-implementer' }, ['todo', 'blocked']);
});

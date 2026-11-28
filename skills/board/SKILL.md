---
name: board
description: Opens the Shipwright board — a local web UI showing every task's stage timeline and its tickets (todo / in progress / done / blocked) live from the shared SQLite DB. Use to watch progress.
---

# Board

`SW=~/.claude/shipwright/bin` (fallback: `${CLAUDE_PLUGIN_ROOT}/bin`). Needs Node ≥ 22.5 (`node:sqlite`).

1. Start it in the background (`run_in_background`): `node $SW/ui.cjs` (`--port <n>` to change the default 4477). It binds to 127.0.0.1 only and is read-only.
2. "Port in use" → it is already running; just give the URL.
3. Tell the user: `http://127.0.0.1:4477`.

What it shows, for every repo and worktree on this machine:
- each task (`slug`, size, current stage) with time spent per stage — written by `state.cjs set stage=…`;
- its tickets by status, with wave, agent and elapsed time — created by `ticket.cjs sync <plan.md>` (or `ticket.cjs add` on quick tasks), moved to *in progress* by the dispatch hook and to *done/blocked* by `ticket.cjs set`;
- a ticket's text (its `### T<n>` section of plan.md) on click.

Ticket text lives only in plan.md; the DB (`~/.claude/shipwright/sw.db`) holds status and timing. Same numbers in the terminal: `node $SW/ticket.cjs report` inside a task worktree.

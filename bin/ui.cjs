#!/usr/bin/env node
'use strict';
// Shipwright board: local web UI over the shared ticket DB.
//   ui.cjs [--port 4477]      → http://127.0.0.1:4477  (live via SSE; read-only)
const fs = require('fs');
const http = require('http');
const path = require('path');
const dbLib = require('./lib/db.cjs');

const i = process.argv.indexOf('--port');
const PORT = Number(i > 0 ? process.argv[i + 1] : process.env.SW_UI_PORT) || 4477;

let db;
try {
  db = dbLib.open();
} catch (e) {
  console.error(e.code === 'ERR_UNKNOWN_BUILTIN_MODULE' ? 'The board needs Node >= 22.5 (node:sqlite).' : e.message);
  process.exit(1);
}

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

// The `### T<n>:` section of the task's plan.md. Only paths recorded by `ticket.cjs sync` are ever read.
function ticketBody(q) {
  const task = db.prepare('SELECT plan FROM tasks WHERE repo = ? AND slug = ?').get(q.get('repo'), q.get('slug'));
  if (!task || !task.plan || !/^T\d+$/.test(q.get('id') || '')) return null;
  let text;
  try {
    text = fs.readFileSync(task.plan, 'utf8');
  } catch {
    return null;
  }
  const start = text.search(new RegExp(`^### ${q.get('id')}:`, 'm'));
  if (start < 0) return null;
  const end = text.slice(start + 4).search(/^##{1,2} /m);
  return text.slice(start, end < 0 ? undefined : start + 4 + end).trim();
}

const clients = new Set();
let version = -1;
setInterval(() => {
  if (!clients.size) return;
  const v = db.prepare('PRAGMA data_version').get().data_version; // bumps when another process commits
  if (v === version) return;
  version = v;
  for (const res of clients) res.write('data: change\n\n');
}, 1000).unref();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(fs.readFileSync(path.join(__dirname, 'ui.html')));
  } else if (url.pathname === '/api/state') {
    json(res, 200, dbLib.snapshot(db));
  } else if (url.pathname === '/api/ticket') {
    const body = ticketBody(url.searchParams);
    json(res, body ? 200 : 404, { body });
  } else if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  } else {
    json(res, 404, { error: 'not found' });
  }
});

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is in use — the board may already be running: http://127.0.0.1:${PORT}` : e.message);
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => console.log(`Shipwright board: http://127.0.0.1:${PORT}`));

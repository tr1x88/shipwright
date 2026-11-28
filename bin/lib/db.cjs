'use strict';
// Shared stage/ticket store for every repo and worktree: $SW_HOME/sw.db (node:sqlite, Node >= 22.5).
// Ticket text lives in plan.md; this DB only holds status and timing.
const fs = require('fs');
const path = require('path');
const { HOME } = require('./config.cjs');

const STATUSES = ['todo', 'doing', 'done', 'blocked'];
const now = () => new Date().toISOString();

function open() {
  const warn = process.emitWarning;
  process.emitWarning = () => {}; // node:sqlite prints an ExperimentalWarning on Node 22
  let sqlite;
  try {
    sqlite = require('node:sqlite');
  } finally {
    process.emitWarning = warn;
  }
  fs.mkdirSync(HOME, { recursive: true });
  const db = new sqlite.DatabaseSync(path.join(HOME, 'sw.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS tasks (repo TEXT, slug TEXT, size TEXT, stage TEXT, plan TEXT, updated_at TEXT, PRIMARY KEY (repo, slug));
    CREATE TABLE IF NOT EXISTS stages (repo TEXT, slug TEXT, stage TEXT, at TEXT);
    CREATE TABLE IF NOT EXISTS tickets (repo TEXT, slug TEXT, id TEXT, title TEXT, wave INTEGER, status TEXT DEFAULT 'todo',
      agent TEXT, started_at TEXT, ended_at TEXT, PRIMARY KEY (repo, slug, id));
  `);
  return db;
}

function touchTask(db, repo, slug, fields = {}) {
  db.prepare(`INSERT INTO tasks (repo, slug, size, stage, plan, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (repo, slug) DO UPDATE SET size = COALESCE(excluded.size, size), stage = COALESCE(excluded.stage, stage),
      plan = COALESCE(excluded.plan, plan), updated_at = excluded.updated_at`)
    .run(repo, slug, fields.size || null, fields.stage || null, fields.plan || null, now());
}

// Called on every state write; logs a row only when the stage actually changes.
function trackStage(repo, slug, size, stage) {
  const db = open();
  try {
    const last = db.prepare('SELECT stage FROM stages WHERE repo = ? AND slug = ? ORDER BY rowid DESC LIMIT 1').get(repo, slug);
    if (!last || last.stage !== stage) db.prepare('INSERT INTO stages VALUES (?, ?, ?, ?)').run(repo, slug, stage, now());
    touchTask(db, repo, slug, { size, stage });
  } finally {
    db.close();
  }
}

// plan.md → [{ id, title, wave }] from `### T1: name` headings and `- W2 (parallel): T2, T3 — why` lines.
function parsePlan(text) {
  const waves = {};
  for (const m of text.matchAll(/^- W(\d+)[^:\n]*:([^\n]*)$/gm)) {
    for (const id of m[2].split(/\s[—-]\s/)[0].match(/\bT\d+\b/g) || []) waves[id] = Number(m[1]);
  }
  return [...text.matchAll(/^### (T\d+): *(.+)$/gm)].map((m) => ({ id: m[1], title: m[2].trim(), wave: waves[m[1]] ?? null }));
}

function upsertTicket(db, repo, slug, t) {
  db.prepare(`INSERT INTO tickets (repo, slug, id, title, wave) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (repo, slug, id) DO UPDATE SET title = excluded.title, wave = excluded.wave`)
    .run(repo, slug, t.id, t.title, t.wave ?? null);
}

function syncPlan(repo, slug, planPath) {
  const tickets = parsePlan(fs.readFileSync(planPath, 'utf8'));
  const db = open();
  try {
    for (const t of tickets) upsertTicket(db, repo, slug, t);
    touchTask(db, repo, slug, { plan: path.resolve(planPath) });
  } finally {
    db.close();
  }
  return tickets;
}

function addTicket(repo, slug, t) {
  const db = open();
  try {
    upsertTicket(db, repo, slug, t);
    touchTask(db, repo, slug);
  } finally {
    db.close();
  }
}

// Returns how many tickets changed. `onlyFrom` limits the update to tickets currently in those statuses.
function setTickets(repo, slug, ids, { status, agent }, onlyFrom = STATUSES) {
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join('|')}`);
  const t = now();
  const db = open();
  try {
    const stmt = db.prepare(`UPDATE tickets SET status = ?, agent = COALESCE(?, agent),
        started_at = CASE WHEN ? = 'todo' THEN NULL WHEN ? = 'doing' THEN ? ELSE COALESCE(started_at, ?) END,
        ended_at = CASE WHEN ? IN ('done', 'blocked') THEN ? ELSE NULL END
      WHERE repo = ? AND slug = ? AND id = ? AND status IN (${onlyFrom.map(() => '?').join(',')})`);
    let changed = 0;
    for (const id of ids) changed += Number(stmt.run(status, agent || null, status, status, t, t, status, t, repo, slug, id, ...onlyFrom).changes);
    if (changed) touchTask(db, repo, slug);
    return changed;
  } finally {
    db.close();
  }
}

function snapshot(db) {
  const own = db ? null : (db = open());
  try {
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC').all();
    const stages = db.prepare('SELECT * FROM stages ORDER BY rowid').all();
    const tickets = db.prepare('SELECT * FROM tickets ORDER BY wave IS NULL, wave, CAST(substr(id, 2) AS INTEGER)').all();
    const mine = (rows, t) => rows.filter((r) => r.repo === t.repo && r.slug === t.slug);
    return { now: now(), tasks: tasks.map((t) => ({ ...t, stages: mine(stages, t), tickets: mine(tickets, t) })) };
  } finally {
    if (own) own.close();
  }
}

module.exports = { STATUSES, open, trackStage, parsePlan, syncPlan, addTicket, setTickets, snapshot };

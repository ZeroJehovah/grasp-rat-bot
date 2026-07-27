'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const CHAT_HISTORY_SCHEMA_VERSION = 1;

function finiteInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function timestampMs(value, fallback = 0) {
  const direct = finiteInteger(value);
  if (direct !== null && direct >= 0) return direct;
  const parsed = Date.parse(String(value || ''));
  if (Number.isFinite(parsed)) return Math.round(parsed);
  return Math.max(0, finiteInteger(fallback) || 0);
}

function initializeChatHistoryDatabase(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_players (
      user_id INTEGER PRIMARY KEY,
      latest_name TEXT NOT NULL DEFAULT '',
      name_observed_at_ms INTEGER NOT NULL DEFAULT 0,
      first_observed_at_ms INTEGER NOT NULL,
      last_observed_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      event_key TEXT PRIMARY KEY,
      message_id INTEGER,
      server_tick INTEGER,
      kind TEXT NOT NULL,
      author_user_id INTEGER,
      target_user_id INTEGER,
      text TEXT NOT NULL,
      occurred_at_ms INTEGER NOT NULL,
      first_observed_at_ms INTEGER NOT NULL,
      last_observed_at_ms INTEGER NOT NULL,
      first_source TEXT NOT NULL DEFAULT '',
      last_source TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (author_user_id) REFERENCES chat_players(user_id),
      FOREIGN KEY (target_user_id) REFERENCES chat_players(user_id)
    );

    CREATE INDEX IF NOT EXISTS chat_messages_occurred_at_idx
      ON chat_messages(occurred_at_ms);
    CREATE INDEX IF NOT EXISTS chat_messages_kind_occurred_at_idx
      ON chat_messages(kind, occurred_at_ms);
    CREATE INDEX IF NOT EXISTS chat_messages_author_kind_idx
      ON chat_messages(author_user_id, kind, occurred_at_ms);
    CREATE INDEX IF NOT EXISTS chat_messages_target_kind_idx
      ON chat_messages(target_user_id, kind, occurred_at_ms);

    CREATE VIEW IF NOT EXISTS chat_message_details AS
      SELECT
        message.event_key,
        message.message_id,
        message.server_tick,
        message.kind,
        message.author_user_id,
        author.latest_name AS author_name,
        message.target_user_id,
        target.latest_name AS target_name,
        message.text,
        message.occurred_at_ms,
        datetime(message.occurred_at_ms / 1000, 'unixepoch') AS occurred_at_utc,
        message.first_observed_at_ms,
        message.last_observed_at_ms,
        message.first_source,
        message.last_source
      FROM chat_messages AS message
      LEFT JOIN chat_players AS author ON author.user_id = message.author_user_id
      LEFT JOIN chat_players AS target ON target.user_id = message.target_user_id;

    CREATE VIEW IF NOT EXISTS player_kill_stats AS
      WITH player_events AS (
        SELECT author_user_id AS user_id, 1 AS kills, 0 AS deaths
        FROM chat_messages
        WHERE kind = 'kill' AND author_user_id IS NOT NULL
        UNION ALL
        SELECT target_user_id AS user_id, 0 AS kills, 1 AS deaths
        FROM chat_messages
        WHERE kind = 'kill' AND target_user_id IS NOT NULL
      )
      SELECT
        event.user_id,
        player.latest_name,
        SUM(event.kills) AS kills,
        SUM(event.deaths) AS deaths,
        SUM(event.kills) - SUM(event.deaths) AS kill_death_difference
      FROM player_events AS event
      LEFT JOIN chat_players AS player ON player.user_id = event.user_id
      GROUP BY event.user_id;

    CREATE VIEW IF NOT EXISTS kill_pair_stats AS
      WITH pair_events AS (
        SELECT
          CASE WHEN author_user_id < target_user_id THEN author_user_id ELSE target_user_id END AS lower_user_id,
          CASE WHEN author_user_id < target_user_id THEN target_user_id ELSE author_user_id END AS higher_user_id,
          author_user_id,
          occurred_at_ms
        FROM chat_messages
        WHERE kind = 'kill'
          AND author_user_id IS NOT NULL
          AND target_user_id IS NOT NULL
          AND author_user_id != target_user_id
      ), pair_totals AS (
        SELECT
          lower_user_id,
          higher_user_id,
          SUM(CASE WHEN author_user_id = lower_user_id THEN 1 ELSE 0 END) AS lower_killed_higher,
          SUM(CASE WHEN author_user_id = higher_user_id THEN 1 ELSE 0 END) AS higher_killed_lower,
          COUNT(*) AS total_kills,
          MIN(occurred_at_ms) AS first_kill_at_ms,
          MAX(occurred_at_ms) AS last_kill_at_ms
        FROM pair_events
        GROUP BY lower_user_id, higher_user_id
      )
      SELECT
        pair.lower_user_id,
        lower_player.latest_name AS lower_name,
        pair.higher_user_id,
        higher_player.latest_name AS higher_name,
        pair.lower_killed_higher,
        pair.higher_killed_lower,
        pair.total_kills,
        ABS(pair.lower_killed_higher - pair.higher_killed_lower) AS kill_imbalance,
        CASE
          WHEN pair.lower_killed_higher > 0 AND pair.higher_killed_lower > 0 THEN 1
          ELSE 0
        END AS mutual_kills,
        pair.first_kill_at_ms,
        pair.last_kill_at_ms
      FROM pair_totals AS pair
      LEFT JOIN chat_players AS lower_player ON lower_player.user_id = pair.lower_user_id
      LEFT JOIN chat_players AS higher_player ON higher_player.user_id = pair.higher_user_id;
  `);
  db.prepare(`
    INSERT INTO chat_history_meta(key, value) VALUES('schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(CHAT_HISTORY_SCHEMA_VERSION));
}

function openChatHistoryDatabase(file, options = {}) {
  const input = String(file || '').trim();
  if (!input) throw new Error('chat history database file is required');
  const resolved = path.resolve(input);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved, options);
  initializeChatHistoryDatabase(db);
  return db;
}

function createChatHistoryWriter(file) {
  const db = openChatHistoryDatabase(file);
  const upsertPlayer = db.prepare(`
    INSERT INTO chat_players(
      user_id, latest_name, name_observed_at_ms, first_observed_at_ms, last_observed_at_ms
    ) VALUES (
      @userId, @name, @nameObservedAtMs, @firstObservedAtMs, @lastObservedAtMs
    )
    ON CONFLICT(user_id) DO UPDATE SET
      latest_name = CASE
        WHEN excluded.latest_name != ''
          AND excluded.name_observed_at_ms >= chat_players.name_observed_at_ms
        THEN excluded.latest_name
        ELSE chat_players.latest_name
      END,
      name_observed_at_ms = CASE
        WHEN excluded.latest_name != ''
        THEN MAX(chat_players.name_observed_at_ms, excluded.name_observed_at_ms)
        ELSE chat_players.name_observed_at_ms
      END,
      first_observed_at_ms = MIN(chat_players.first_observed_at_ms, excluded.first_observed_at_ms),
      last_observed_at_ms = MAX(chat_players.last_observed_at_ms, excluded.last_observed_at_ms)
  `);
  const upsertMessage = db.prepare(`
    INSERT INTO chat_messages(
      event_key, message_id, server_tick, kind, author_user_id, target_user_id,
      text, occurred_at_ms, first_observed_at_ms, last_observed_at_ms,
      first_source, last_source
    ) VALUES (
      @eventKey, @messageId, @serverTick, @kind, @authorUserId, @targetUserId,
      @text, @occurredAtMs, @firstObservedAtMs, @lastObservedAtMs,
      @source, @source
    )
    ON CONFLICT(event_key) DO UPDATE SET
      message_id = COALESCE(excluded.message_id, chat_messages.message_id),
      server_tick = COALESCE(excluded.server_tick, chat_messages.server_tick),
      kind = excluded.kind,
      author_user_id = COALESCE(excluded.author_user_id, chat_messages.author_user_id),
      target_user_id = COALESCE(excluded.target_user_id, chat_messages.target_user_id),
      text = excluded.text,
      occurred_at_ms = MIN(chat_messages.occurred_at_ms, excluded.occurred_at_ms),
      first_observed_at_ms = MIN(chat_messages.first_observed_at_ms, excluded.first_observed_at_ms),
      last_observed_at_ms = MAX(chat_messages.last_observed_at_ms, excluded.last_observed_at_ms),
      last_source = excluded.last_source
  `);

  function normalizedPlayer(record = {}) {
    const userId = finiteInteger(record.userId ?? record.user_id);
    if (userId === null) return null;
    const observedAtMs = timestampMs(
      record.observedAtMs ?? record.lastObservedAtMs ?? record.lastObservedAt,
      Date.now()
    );
    const firstObservedAtMs = timestampMs(
      record.firstObservedAtMs ?? record.firstObservedAt,
      observedAtMs
    );
    const name = String(record.name || '').trim();
    return {
      userId,
      name,
      nameObservedAtMs: name ? observedAtMs : 0,
      firstObservedAtMs,
      lastObservedAtMs: observedAtMs
    };
  }

  function normalizedMessage(record = {}) {
    const eventKey = String(record.eventKey ?? record.key ?? '').trim();
    if (!eventKey) return null;
    const observedAtMs = timestampMs(record.lastObservedAtMs ?? record.lastObservedAt, Date.now());
    return {
      eventKey,
      messageId: finiteInteger(record.id ?? record.messageId),
      serverTick: finiteInteger(record.tick ?? record.serverTick),
      kind: String(record.kind || 'chat'),
      authorUserId: finiteInteger(record.userId ?? record.authorUserId),
      targetUserId: finiteInteger(record.targetUserId),
      text: String(record.text || ''),
      occurredAtMs: timestampMs(record.occurredAtMs ?? record.occurredAt, observedAtMs),
      firstObservedAtMs: timestampMs(record.firstObservedAtMs ?? record.firstObservedAt, observedAtMs),
      lastObservedAtMs: observedAtMs,
      source: String(record.source || '')
    };
  }

  const writeBatch = db.transaction(batch => {
    const players = new Map();
    for (const record of batch.players || []) {
      const player = normalizedPlayer(record);
      if (player) players.set(player.userId, player);
    }
    const messages = [];
    for (const record of batch.messages || []) {
      const message = normalizedMessage(record);
      if (!message) continue;
      messages.push(message);
      for (const userId of [message.authorUserId, message.targetUserId]) {
        if (userId === null || players.has(userId)) continue;
        players.set(userId, normalizedPlayer({ userId, observedAtMs: message.lastObservedAtMs }));
      }
    }
    for (const player of players.values()) upsertPlayer.run(player);
    for (const message of messages) upsertMessage.run(message);
    return { players: players.size, messages: messages.length };
  });

  return {
    close: () => db.close(),
    database: db,
    writeBatch: batch => writeBatch(batch || {})
  };
}

function inspectChatHistoryDatabase(file) {
  const db = openChatHistoryDatabase(file, { fileMustExist: true });
  try {
    return {
      schemaVersion: Number(db.prepare("SELECT value FROM chat_history_meta WHERE key = 'schema_version'").pluck().get() || 0),
      messages: Number(db.prepare('SELECT COUNT(*) FROM chat_messages').pluck().get() || 0),
      players: Number(db.prepare('SELECT COUNT(*) FROM chat_players').pluck().get() || 0),
      killStats: db.prepare('SELECT * FROM player_kill_stats ORDER BY user_id').all(),
      pairStats: db.prepare('SELECT * FROM kill_pair_stats ORDER BY lower_user_id, higher_user_id').all()
    };
  } finally {
    db.close();
  }
}

function runChatHistoryStoreSelfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-chat-history-'));
  const file = path.join(root, 'chat-history.sqlite3');
  const writer = createChatHistoryWriter(file);
  let nullSystemAuthor = false;
  try {
    writer.writeBatch({
      players: [
        { userId: 7, name: 'Alice', observedAtMs: 1000 },
        { userId: 8, name: 'Bob', observedAtMs: 1000 }
      ],
      messages: [
        { key: 'id:1', id: 1, tick: 10, kind: 'kill', userId: 7, targetUserId: 8, text: 'Alice killed Bob', occurredAtMs: 900, firstObservedAtMs: 1000, lastObservedAtMs: 1000, source: 'ws' },
        { key: 'id:1', id: 1, tick: 10, kind: 'kill', userId: 7, targetUserId: 8, text: 'Alice killed Bob', occurredAtMs: 900, firstObservedAtMs: 1000, lastObservedAtMs: 2000, source: 'http' },
        { key: 'id:2', id: 2, tick: 20, kind: 'kill', userId: 8, targetUserId: 7, text: 'Bob killed Alice', occurredAtMs: 1900, firstObservedAtMs: 2000, lastObservedAtMs: 2000, source: 'http' },
        { key: 'fallback:30:chat:7:0:hello', tick: 30, kind: 'chat', userId: 7, targetUserId: 0, text: 'hello', occurredAtMs: 2900, firstObservedAtMs: 3000, lastObservedAtMs: 3000, source: 'ws' },
        { key: 'id:3', id: 3, tick: 31, kind: 'system', userId: null, targetUserId: null, text: 'maintenance', occurredAtMs: 2950, firstObservedAtMs: 3000, lastObservedAtMs: 3000, source: 'ws' }
      ]
    });
    writer.writeBatch({
      players: [{ userId: 7, name: 'Alice Renamed', observedAtMs: 4000 }],
      messages: [{ key: 'id:1', id: 1, tick: 10, kind: 'kill', userId: 7, targetUserId: 8, text: 'Alice killed Bob', occurredAtMs: 900, firstObservedAtMs: 1000, lastObservedAtMs: 4000, source: 'ws' }]
    });
    nullSystemAuthor = writer.database.prepare(`
      SELECT author_user_id IS NULL AND target_user_id IS NULL
      FROM chat_messages WHERE event_key = 'id:3'
    `).pluck().get() === 1;
  } finally {
    writer.close();
  }
  const summary = inspectChatHistoryDatabase(file);
  const alice = summary.killStats.find(record => record.user_id === 7);
  const pair = summary.pairStats[0];
  const result = {
    ok: Boolean(
      summary.schemaVersion === CHAT_HISTORY_SCHEMA_VERSION
      && summary.messages === 4
      && summary.players === 3
      && nullSystemAuthor
      && alice?.latest_name === 'Alice Renamed'
      && alice?.kills === 1
      && alice?.deaths === 1
      && pair?.total_kills === 2
      && pair?.kill_imbalance === 0
      && pair?.mutual_kills === 1
    ),
    ...summary,
    nullSystemAuthor
  };
  fs.rmSync(root, { recursive: true, force: true });
  return result;
}

module.exports = {
  CHAT_HISTORY_SCHEMA_VERSION,
  createChatHistoryWriter,
  inspectChatHistoryDatabase,
  openChatHistoryDatabase,
  runChatHistoryStoreSelfTest
};

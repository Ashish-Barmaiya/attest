import { withDb } from "./database.js";

withDb((db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      sequence INTEGER PRIMARY KEY,
      payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      prev_chain_hash TEXT NOT NULL,
      chain_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chain_head (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_sequence INTEGER NOT NULL,
      last_chain_hash TEXT NOT NULL
    );

    INSERT OR IGNORE INTO chain_head (id, last_sequence, last_chain_hash)
    VALUES (1, 0, 'GENESIS');
  `);
});

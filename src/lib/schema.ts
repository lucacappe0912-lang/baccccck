// Kept dependency-free so scripts/ can import it directly.
export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS transactions (
  id            TEXT PRIMARY KEY,
  date          TEXT NOT NULL,              -- YYYY-MM-DD
  amount_cents  INTEGER NOT NULL,           -- signed: >0 entrata, <0 uscita
  description   TEXT NOT NULL DEFAULT '',
  counterparty  TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'Altro',
  source        TEXT NOT NULL,              -- bank | cash | import
  account_id    TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);

CREATE TABLE IF NOT EXISTS leads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  instagram     TEXT NOT NULL DEFAULT '',
  genre         TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'manuale', -- drive | manuale | sito
  status        TEXT NOT NULL DEFAULT 'nuovo',
  external_ref  TEXT UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS artists (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  instagram     TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  lead_id       INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS packages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id     INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  price_cents   INTEGER NOT NULL DEFAULT 0,
  purchased_at  TEXT NOT NULL,
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS package_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id    INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  service       TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  done_at       TEXT,
  done_by       TEXT
);

CREATE TABLE IF NOT EXISTS metrics (
  date          TEXT NOT NULL,
  source        TEXT NOT NULL,              -- instagram | tiktok | web
  key           TEXT NOT NULL,
  value         REAL NOT NULL,
  PRIMARY KEY (date, source, key)
);

CREATE TABLE IF NOT EXISTS applications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'candidatura', -- candidatura | prenotazione
  message       TEXT NOT NULL DEFAULT '',
  received_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS insights (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'Strategia',
  pinned        INTEGER NOT NULL DEFAULT 0,
  done          INTEGER NOT NULL DEFAULT 0,
  due_date      TEXT,
  author        TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kv (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job           TEXT NOT NULL,
  ok            INTEGER NOT NULL,
  message       TEXT NOT NULL DEFAULT '',
  at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL,              -- YYYY-MM-DD
  start_time    TEXT NOT NULL,              -- HH:MM
  end_time      TEXT NOT NULL,
  room          TEXT NOT NULL,
  engineer      TEXT NOT NULL DEFAULT '',
  artist_id     INTEGER REFERENCES artists(id) ON DELETE SET NULL,
  item_id       INTEGER REFERENCES package_items(id) ON DELETE SET NULL,
  title         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'prenotata', -- prenotata | completata | annullata
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);

CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id    INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  method        TEXT NOT NULL DEFAULT 'bonifico', -- bonifico | contanti | pos
  tx_id         TEXT,                        -- linked cash transaction, if any
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS partner_moves (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL,
  partner       TEXT NOT NULL,
  kind          TEXT NOT NULL,              -- prelievo | versamento
  amount_cents  INTEGER NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tracks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id     INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  stage         INTEGER NOT NULL DEFAULT 0, -- index in TRACK_STAGES
  mix_revisions INTEGER NOT NULL DEFAULT 0,
  due_date      TEXT,
  drive_url     TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS equipment (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'Altro',
  purchase_date   TEXT NOT NULL,
  cost_cents      INTEGER NOT NULL DEFAULT 0,
  life_years      INTEGER NOT NULL DEFAULT 5,
  warranty_until  TEXT,
  service_months  INTEGER,                  -- maintenance interval, null = none
  last_service    TEXT,
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/** Columns added after the first release: applied to existing databases on startup. */
export const COLUMN_MIGRATIONS: [table: string, column: string, definition: string][] = [
  ["packages", "due_date", "TEXT"],
  ["leads", "channel", "TEXT NOT NULL DEFAULT ''"],
  ["leads", "referred_by", "TEXT NOT NULL DEFAULT ''"],
  ["leads", "next_action", "TEXT NOT NULL DEFAULT ''"],
  ["leads", "next_action_date", "TEXT"],
  ["leads", "last_contact", "TEXT"],
  ["artists", "channel", "TEXT NOT NULL DEFAULT ''"],
  ["artists", "referred_by", "TEXT NOT NULL DEFAULT ''"],
];

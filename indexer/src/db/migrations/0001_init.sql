-- Axie Community Treasury indexer, schema v1.
-- Wei exceeds int64, so exact amounts are decimal TEXT; REAL columns hold token units for aggregation.
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
-- keys: cursor_treasury, cursor_bridge, rollups_dirty, total_{axs,weth}_{in,out}_wei, rates_json, rates_fetched_at, first_tx_block, first_tx_ts
CREATE TABLE blocks (
  number INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'rpc' CHECK (source IN ('rpc','interp'))
);
CREATE INDEX blocks_ts ON blocks(ts);
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  block INTEGER NOT NULL REFERENCES blocks(number),
  tx_index INTEGER,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sale','rc-mint','ascension','breeding','evolution','atiablessing','outflow','unknown')),
  nft_type TEXT NOT NULL,            -- Axie|Land|Land Item|Rune|Charm|Material|Accessory|Consumable Item|Mixed|None
  nft_count INTEGER NOT NULL DEFAULT 0,
  from_address TEXT,
  to_address TEXT,
  axs_in_wei TEXT NOT NULL DEFAULT '0',
  weth_in_wei TEXT NOT NULL DEFAULT '0',
  axs_out_wei TEXT NOT NULL DEFAULT '0',
  weth_out_wei TEXT NOT NULL DEFAULT '0',
  axs_in REAL NOT NULL DEFAULT 0,
  weth_in REAL NOT NULL DEFAULT 0,
  axs_out REAL NOT NULL DEFAULT 0,
  weth_out REAL NOT NULL DEFAULT 0
);
CREATE INDEX transactions_block ON transactions(block);
CREATE INDEX transactions_ts ON transactions(ts);
CREATE INDEX transactions_type_ts ON transactions(type, ts);
CREATE TABLE token_transfers (
  tx_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  log_index INTEGER NOT NULL,
  token TEXT NOT NULL CHECK (token IN ('AXS','WETH')),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount_wei TEXT NOT NULL,
  amount REAL NOT NULL,
  PRIMARY KEY (tx_id, log_index)
) WITHOUT ROWID;
CREATE TABLE nft_transfers (
  tx_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  log_index INTEGER NOT NULL,
  sub_index INTEGER NOT NULL DEFAULT 0,
  contract TEXT NOT NULL,
  nft_type TEXT NOT NULL,
  token_id TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '1',
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  PRIMARY KEY (tx_id, log_index, sub_index)
) WITHOUT ROWID;
CREATE TABLE bridge_events (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit','withdrawal')),
  token TEXT NOT NULL,
  amount_wei TEXT NOT NULL,
  amount REAL NOT NULL,
  address TEXT NOT NULL,
  receipt_id TEXT,
  PRIMARY KEY (tx_hash, log_index)
) WITHOUT ROWID;
CREATE INDEX bridge_events_token_block ON bridge_events(token, block);
CREATE TABLE rollups_hourly (
  hour INTEGER NOT NULL,
  type TEXT NOT NULL,
  nft_type TEXT NOT NULL,
  axs_in REAL NOT NULL DEFAULT 0,
  weth_in REAL NOT NULL DEFAULT 0,
  axs_out REAL NOT NULL DEFAULT 0,
  weth_out REAL NOT NULL DEFAULT 0,
  tx_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, type, nft_type)
) WITHOUT ROWID;
PRAGMA user_version = 1;

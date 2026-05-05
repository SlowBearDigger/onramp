import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db')

// ensure the parent dir exists — covers Passenger setups where the app is
// deployed into a subfolder with restrictive permissions.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// schema — single migration for fresh installs, kept idempotent so restarts
// are safe. existing installs get the new columns via the migration below.
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,                      -- provider order id (UUID-ish)
    provider TEXT NOT NULL DEFAULT 'transak', -- 'transak' | 'mtpelerin' | 'topper'
    unverified INTEGER NOT NULL DEFAULT 0,    -- 1 = frontend-reported only (mtpelerin), 0 = webhook-verified
    partner_order_id TEXT,                    -- UUID we generated and passed to the widget
    customer_id TEXT,                         -- wallet address (anonymous user model)
    status TEXT NOT NULL,                     -- AWAITING_PAYMENT_FROM_USER | PROCESSING | COMPLETED | FAILED | CANCELLED | EXPIRED | REFUNDED
    event_id TEXT,                            -- last webhook/event that touched this row
    product TEXT,                             -- BUY | SELL
    fiat_currency TEXT,
    fiat_amount REAL,
    crypto_currency TEXT,
    crypto_amount REAL,
    wallet_address TEXT,
    network TEXT,
    tx_hash TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    raw_payload TEXT                          -- JSON of decoded payload for audit
  );

  CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
  CREATE INDEX IF NOT EXISTS idx_orders_updated ON orders(updated_at);
  CREATE INDEX IF NOT EXISTS idx_orders_partner ON orders(partner_order_id);
  CREATE INDEX IF NOT EXISTS idx_orders_provider ON orders(provider, updated_at);
`)

// idempotent in-place migration for installs that pre-date the multi-provider
// schema. ALTER TABLE ADD COLUMN throws on existing column — caught and
// ignored so reboots are safe.
function addColumnIfMissing(sql) {
  try {
    db.exec(sql)
  } catch (err) {
    const msg = String(err?.message || '')
    if (!/duplicate column/i.test(msg)) throw err
  }
}
addColumnIfMissing(`ALTER TABLE orders ADD COLUMN provider TEXT NOT NULL DEFAULT 'transak'`)
addColumnIfMissing(`ALTER TABLE orders ADD COLUMN unverified INTEGER NOT NULL DEFAULT 0`)

const upsertStmt = db.prepare(`
  INSERT INTO orders (
    id, provider, unverified, partner_order_id, customer_id, status, event_id, product,
    fiat_currency, fiat_amount, crypto_currency, crypto_amount,
    wallet_address, network, tx_hash, created_at, updated_at, raw_payload
  ) VALUES (
    @id, @provider, @unverified, @partner_order_id, @customer_id, @status, @event_id, @product,
    @fiat_currency, @fiat_amount, @crypto_currency, @crypto_amount,
    @wallet_address, @network, @tx_hash, @created_at, @updated_at, @raw_payload
  )
  ON CONFLICT(id) DO UPDATE SET
    status = excluded.status,
    event_id = excluded.event_id,
    tx_hash = COALESCE(excluded.tx_hash, orders.tx_hash),
    updated_at = excluded.updated_at,
    raw_payload = excluded.raw_payload,
    -- once an order has been confirmed by a webhook, never downgrade it back
    -- to unverified just because a stray frontend event arrived.
    unverified = CASE WHEN orders.unverified = 0 THEN 0 ELSE excluded.unverified END
`)

export function upsertOrder(row) {
  upsertStmt.run({
    id: row.id,
    provider: row.provider || 'transak',
    unverified: row.unverified ? 1 : 0,
    partner_order_id: row.partner_order_id ?? null,
    customer_id: row.customer_id ?? null,
    status: row.status,
    event_id: row.event_id ?? null,
    product: row.product ?? null,
    fiat_currency: row.fiat_currency ?? null,
    fiat_amount: row.fiat_amount ?? null,
    crypto_currency: row.crypto_currency ?? null,
    crypto_amount: row.crypto_amount ?? null,
    wallet_address: row.wallet_address ?? null,
    network: row.network ?? null,
    tx_hash: row.tx_hash ?? null,
    created_at: row.created_at ?? Date.now(),
    updated_at: row.updated_at ?? Date.now(),
    raw_payload: row.raw_payload ?? null,
  })
}

const listByCustomerStmt = db.prepare(`
  SELECT * FROM orders
  WHERE customer_id = ?
  ORDER BY updated_at DESC
  LIMIT 100
`)

const listByCustomerAndProviderStmt = db.prepare(`
  SELECT * FROM orders
  WHERE customer_id = ? AND provider = ?
  ORDER BY updated_at DESC
  LIMIT 100
`)

const getByIdStmt = db.prepare(`SELECT * FROM orders WHERE id = ?`)

// customerId is required by the API layer; this function intentionally has
// no "list all orders" fallback to prevent accidental global enumeration.
// optional provider filter for analytics / per-provider history views.
export function listOrders({ customerId, provider } = {}) {
  if (!customerId) return []
  if (provider) return listByCustomerAndProviderStmt.all(customerId, provider)
  return listByCustomerStmt.all(customerId)
}

export function getOrderById(id) {
  return getByIdStmt.get(id)
}

export { db }

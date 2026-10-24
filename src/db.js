'use strict';
const { DatabaseSync } = require('node:sqlite');
const isVercel = !!process.env.VERCEL;
const defaultDir = isVercel
  ? path.join(os.tmpdir(), 'VinchurkarBilling')
  : path.join(process.env.APPDATA || path.join(os.homedir(), '.vinchurkar'), 'VinchurkarBilling');
const dir = process.env.VJ_DATA_DIR || defaultDir;
fs.mkdirSync(path.join(dir, 'backups'), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(path.join(dir, 'billing.db'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
db.exec(`
CREATE TABLE IF NOT EXISTS owner(id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, mobile TEXT NOT NULL,
  email TEXT, gstin TEXT, notes TEXT, created_at TEXT NOT NULL, UNIQUE(mobile,name));
CREATE TABLE IF NOT EXISTS invoice_counters(year INTEGER PRIMARY KEY, last INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invoices(id INTEGER PRIMARY KEY, invoice_no TEXT NOT NULL UNIQUE, invoice_date TEXT NOT NULL,
  created_at TEXT NOT NULL, customer_id INTEGER NOT NULL REFERENCES customers(id), payment_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'FINAL' CHECK(status IN('FINAL','CANCELLED')), cancel_reason TEXT,
  subtotal_paise INTEGER NOT NULL, discount_paise INTEGER NOT NULL, taxable_paise INTEGER NOT NULL, tax_paise INTEGER NOT NULL,
  round_paise INTEGER NOT NULL, total_paise INTEGER NOT NULL, snapshot TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invoice_items(id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  name TEXT NOT NULL, category TEXT, gross_mg INTEGER, stone_mg INTEGER, net_mg INTEGER, rate_paise INTEGER, making_paise INTEGER,
  stone_paise INTEGER, other_paise INTEGER, discount_paise INTEGER, taxable_paise INTEGER, tax_bps INTEGER, final_paise INTEGER);
CREATE TABLE IF NOT EXISTS assets(hash TEXT PRIMARY KEY, data BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS secrets(name TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS otp(id INTEGER PRIMARY KEY, code_hmac TEXT NOT NULL, expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts(id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, ok INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY, ts TEXT NOT NULL, event TEXT NOT NULL, detail TEXT);
CREATE INDEX IF NOT EXISTS ix_inv_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS ix_inv_cust ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS ix_cust_mobile ON customers(mobile);
CREATE TRIGGER IF NOT EXISTS inv_immutable BEFORE UPDATE OF invoice_no,invoice_date,customer_id,payment_mode,total_paise,taxable_paise,
  tax_paise,subtotal_paise,snapshot ON invoices BEGIN SELECT RAISE(ABORT,'Finalised invoices are immutable'); END;
CREATE TRIGGER IF NOT EXISTS inv_nodelete BEFORE DELETE ON invoices BEGIN SELECT RAISE(ABORT,'Invoices cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS items_noupdate BEFORE UPDATE ON invoice_items BEGIN SELECT RAISE(ABORT,'Immutable'); END;
CREATE TRIGGER IF NOT EXISTS items_nodelete BEFORE DELETE ON invoice_items BEGIN SELECT RAISE(ABORT,'Immutable'); END;
`);
// Server secret for OTP HMAC; stored beside (not inside) the database, never in source code.
const keyFile = path.join(dir, 'server.key');
if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const secret = fs.readFileSync(keyFile, 'utf8');
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
function audit(event, detail = '') { db.prepare('INSERT INTO audit_logs(ts,event,detail) VALUES(?,?,?)').run(new Date().toISOString(), event, detail); }
const getSettings = () => Object.fromEntries(db.prepare("SELECT key,value FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'").all().map(r => [r.key, r.value]));
module.exports = { db, tx, audit, secret, dir, getSettings };

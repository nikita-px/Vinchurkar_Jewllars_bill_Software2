'use strict';
const express = require('express'), crypto = require('crypto'), path = require('path'), fs = require('fs'), nodemailer = require('nodemailer');
const { db, tx, audit, secret, dir, getSettings } = require('./src/db');
const { calcBill } = require('./src/billing');
const { renderInvoice } = require('./src/pdf');

const app = express();
const IDLE_MS = 5 * 60 * 1000, now = () => Date.now();
const today = () => new Date().toLocaleDateString('en-CA');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const fail = (res, code, msg) => res.status(code).json({ error: msg });
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src 'self' blob:; object-src 'self' blob:; frame-ancestors 'self'", 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
  if (req.method !== 'GET' && req.get('X-VJ') !== '1') return fail(res, 403, 'Forbidden'); // CSRF guard (plus SameSite=Strict)
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- password + validation ----------
const hashPw = pw => { const s = crypto.randomBytes(16); return 's1$' + s.toString('hex') + '$' + crypto.scryptSync(pw, s, 64, SCRYPT).toString('hex'); };
const checkPw = (pw, st) => { const [, s, h] = st.split('$'); return crypto.timingSafeEqual(crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64, SCRYPT), Buffer.from(h, 'hex')); };
const DUMMY = hashPw('dummy-password-for-timing');
const strongPw = p => typeof p === 'string' && p.length >= 12 && p.length <= 128 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
const PW_MSG = 'Password must be 12+ characters with upper, lower, digit and symbol';
const emailOk = e => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const mobileOf = m => { const x = String(m || '').replace(/[\s-]/g, '').replace(/^(\+91|91|0)/, ''); return /^[6-9]\d{9}$/.test(x) ? x : null; };
const gstinOk = g => !g || /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(g);
const clean = (v, max) => String(v ?? '').trim().slice(0, max);

// ---------- sessions (HttpOnly cookie; server-side 5-minute idle expiry) ----------
const cookieOf = req => (req.get('cookie') || '').split(';').map(c => c.trim().split('=')).find(([k]) => k === 'vj_s')?.[1];
function requireAuth(req, res, next) {
  const t = cookieOf(req); if (!t) return fail(res, 401, 'Please sign in');
  const h = sha(t), s = db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(h);
  if (!s) return fail(res, 401, 'Please sign in');
  if (now() - s.last_seen > IDLE_MS) { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(h); return fail(res, 401, 'Locked after 5 minutes of inactivity'); }
  db.prepare('UPDATE sessions SET last_seen=? WHERE token_hash=?').run(now(), h); next();
}
function startSession(res) {
  const t = crypto.randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE ?-last_seen>?').run(now(), IDLE_MS);
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(t), now(), now());
  res.set('Set-Cookie', `vj_s=${t}; HttpOnly; SameSite=Strict; Path=/`);
}

// ---------- fixed owner credentials / security ----------
const FIXED_NAME = process.env.ADMIN_NAME || 'Vinchurkar Jewellers';
const FIXED_EMAIL = (process.env.ADMIN_EMAIL || 'Vinchurkarj@gmail.com').toLowerCase().trim();
const FIXED_USER = (process.env.ADMIN_USERNAME || 'Vinchurkarj@gmail.com').toLowerCase().trim();
const FIXED_PASS = process.env.ADMIN_PASSWORD || 'Harish@123456';

function syncOwnerCredentials() {
  try {
    const o = db.prepare('SELECT * FROM owner WHERE id=1').get();
    if (!o) {
      db.prepare('INSERT INTO owner(id, name, email, username, pass_hash, created_at) VALUES(1,?,?,?,?,?)')
        .run(FIXED_NAME, FIXED_EMAIL, FIXED_USER, hashPw(FIXED_PASS), new Date().toISOString());
      const d = { shop_name: FIXED_NAME, inv_prefix: 'VJ', wm_text: FIXED_NAME.toUpperCase(), wm_opacity: '0.12', wm_size: '56',
        default_gst_pct: '', terms: '1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.' };
      for (const [k, v] of Object.entries(d)) db.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run(k, v);
      audit('OWNER_INITIALIZED', FIXED_EMAIL);
    } else {
      db.prepare('UPDATE owner SET name=?, email=?, username=?, pass_hash=? WHERE id=1')
        .run(FIXED_NAME, FIXED_EMAIL, FIXED_USER, hashPw(FIXED_PASS));
      audit('OWNER_CREDENTIALS_SYNCED', FIXED_EMAIL);
    }
    db.prepare('DELETE FROM login_attempts').run();
  } catch (err) {
    console.error('Owner initialization failed:', err.message);
  }
}
syncOwnerCredentials();

const logoOf = h => { const r = h && db.prepare('SELECT data FROM assets WHERE hash=?').get(h); return r ? Buffer.from(r.data) : null; };

function syncLogo() {
  try {
    const logoFile = path.join(__dirname, 'public', 'logo.jpg');
    if (fs.existsSync(logoFile)) {
      const buf = fs.readFileSync(logoFile);
      const h = sha(buf.toString('base64'));
      db.prepare('INSERT OR IGNORE INTO assets VALUES(?,?)').run(h, buf);
      const cur = getSettings().logo_hash;
      if (!cur || cur !== h) {
        db.prepare("INSERT INTO settings VALUES('logo_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(h);
      }
    }
  } catch (err) {
    console.error('Logo sync error:', err.message);
  }
}
syncLogo();

app.get('/api/logo', (req, res) => {
  const b = logoOf(getSettings().logo_hash);
  if (!b) return fail(res, 404, 'No logo');
  res.type(b[0] === 0x89 ? 'png' : 'jpeg').send(b);
});

// ---------- setup / login ----------
app.get('/api/state', (req, res) => {
  const t = cookieOf(req), s = t && db.prepare('SELECT last_seen FROM sessions WHERE token_hash=?').get(sha(t));
  res.json({ setup: true, authed: !!(s && now() - s.last_seen <= IDLE_MS) });
});
app.post('/api/setup', (req, res) => {
  return fail(res, 403, 'Application is locked. Public setup is disabled.');
});
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const since = now() - 15 * 60 * 1000, f = db.prepare('SELECT ts FROM login_attempts WHERE ok=0 AND ts>? ORDER BY ts DESC').all(since);
  const wait = f.length < 5 ? 0 : Math.min(2 ** (f.length - 4), 900) * 1000;
  if (f.length >= 5 && now() - f[0].ts < wait) return fail(res, 429, `Too many attempts. Try again in ${Math.ceil((wait - (now() - f[0].ts)) / 1000)}s`);

  const inUser = String(username || '').toLowerCase().trim();
  const inPass = String(password || '').slice(0, 128);
  const o = db.prepare('SELECT * FROM owner WHERE id=1').get();
  const emailPrefix = FIXED_EMAIL.includes('@') ? FIXED_EMAIL.split('@')[0] : '';

  const userMatches = !!o && (
    inUser === FIXED_USER ||
    inUser === FIXED_EMAIL ||
    (emailPrefix && inUser === emailPrefix) ||
    inUser === (o.username || '').toLowerCase() ||
    inUser === (o.email || '').toLowerCase()
  );

  const passMatches = !!o && checkPw(inPass, o.pass_hash);
  const ok = Boolean(userMatches && passMatches);

  db.prepare('INSERT INTO login_attempts(ts,ok) VALUES(?,?)').run(now(), ok ? 1 : 0);
  if (!ok) { audit('LOGIN_FAILED', inUser); return fail(res, 401, 'Invalid Login ID or Password'); }
  db.prepare('DELETE FROM login_attempts WHERE ts<?').run(since); audit('LOGIN_OK', inUser); startSession(res); res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { const t = cookieOf(req); if (t) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(t)); res.json({ ok: true }); });

// ---------- email OTP password recovery ----------
const hm = c => crypto.createHmac('sha256', secret).update(c).digest('hex');
const KEY = crypto.createHash('sha256').update('smtp:' + secret).digest();
const enc = t => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv); const e = Buffer.concat([c.update(t, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), e].map(x => x.toString('hex')).join('.'); };
const dec = v => { const [iv, tag, e] = v.split('.').map(x => Buffer.from(x, 'hex')); const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(e), d.final()]).toString('utf8'); };
function mailConfig() { // Settings screen (encrypted) first, then environment variables
  const r = db.prepare("SELECT value FROM secrets WHERE name='smtp'").get();
  if (r) { try { return JSON.parse(dec(r.value)); } catch { return null; } }
  if (process.env.SMTP_HOST) return { host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT || 587, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, from: process.env.SMTP_FROM };
  return null;
}
async function sendMail(to, subject, text) {
  const c = mailConfig(); if (!c) throw new Error('Email is not configured. Open Settings > Email setup.');
  const tr = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.port === 465, requireTLS: c.port !== 465, auth: { user: c.user, pass: c.pass },
    connectionTimeout: 10000, greetingTimeout: 10000 });
  await tr.sendMail({ from: c.from || c.user, to, subject, text });
}
const sendOtp = (to, code) => sendMail(to, 'Vinchurkar Jewellers password reset code', `Your one-time code is ${code}. It expires in 5 minutes. If you did not request it, ignore this email.`);
app.post('/api/forgot', (req, res) => {
  const email = String((req.body || {}).email || '').toLowerCase(), o = db.prepare('SELECT email FROM owner').get();
  res.json({ ok: true, message: 'If that address is registered, a code has been sent.' }); // identical response either way
  if (!o || o.email !== email) return;
  const last = db.prepare('SELECT created_at FROM otp ORDER BY id DESC LIMIT 1').get();
  if (last && now() - last.created_at < 60000) return; // 60s cooldown
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  tx(() => { db.prepare('UPDATE otp SET used=1 WHERE used=0').run(); db.prepare('INSERT INTO otp(code_hmac,expires_at,created_at) VALUES(?,?,?)').run(hm(code), now() + 300000, now()); });
  sendOtp(email, code).catch(e => console.error('OTP email failed:', String(e.message).slice(0, 120)));
});
app.post('/api/reset', (req, res) => {
  const { email, otp, password, confirm } = req.body || {};
  if (password !== confirm || !strongPw(password)) return fail(res, 400, password !== confirm ? 'Passwords do not match' : PW_MSG);
  const bad = () => fail(res, 400, 'Invalid or expired code');
  const o = db.prepare('SELECT email FROM owner').get(), r = db.prepare('SELECT * FROM otp WHERE used=0 ORDER BY id DESC LIMIT 1').get();
  if (!o || o.email !== String(email || '').toLowerCase() || !r || r.expires_at < now() || r.attempts >= 5) return bad();
  db.prepare('UPDATE otp SET attempts=attempts+1 WHERE id=?').run(r.id);
  const a = Buffer.from(hm(String(otp || ''))), b = Buffer.from(r.code_hmac);
  if (!crypto.timingSafeEqual(a, b)) return bad();
  tx(() => { db.prepare('UPDATE otp SET used=1 WHERE id=?').run(r.id); db.prepare('UPDATE owner SET pass_hash=? WHERE id=1').run(hashPw(password));
    db.prepare('DELETE FROM sessions').run(); db.prepare('DELETE FROM login_attempts').run(); audit('PASSWORD_RESET'); });
  res.json({ ok: true });
});

// ---------- everything below requires login ----------
const api = express.Router(); api.use(requireAuth); app.use('/api', api);

api.get('/settings', (req, res) => res.json(getSettings()));
api.put('/settings', (req, res) => {
  const allowed = ['shop_name', 'address', 'phone', 'email', 'gstin', 'est_year', 'footer', 'terms', 'wm_text', 'wm_opacity', 'wm_size', 'inv_prefix', 'default_gst_pct'];
  const b = req.body || {}; if (!gstinOk(b.gstin || '')) return fail(res, 400, 'Invalid GSTIN format');
  if (b.inv_prefix !== undefined && !/^[A-Z0-9-]{1,10}$/.test(b.inv_prefix)) return fail(res, 400, 'Invoice prefix: 1-10 capitals/digits');
  tx(() => { for (const k of allowed) if (b[k] !== undefined) db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, clean(b[k], 1000)); audit('SETTINGS_CHANGED', Object.keys(b).join(',')); });
  res.json({ ok: true });
});
api.get('/mail', (req, res) => { const c = mailConfig() || {}; res.json({ host: c.host || '', port: c.port || 587, user: c.user || '', from: c.from || '', hasPassword: !!c.pass }); });
api.put('/mail', (req, res) => {
  const b = req.body || {}, old = mailConfig() || {}, port = +b.port;
  if (!/^[A-Za-z0-9.-]{3,100}$/.test(b.host || '') || ![25, 465, 587, 2525].includes(port) || !emailOk(b.user)) return fail(res, 400, 'Check host, port (587 or 465) and email/username');
  const pass = b.password ? String(b.password).slice(0, 200) : old.pass; if (!pass) return fail(res, 400, 'Enter the email app password');
  db.prepare("INSERT INTO secrets VALUES('smtp',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value").run(enc(JSON.stringify({ host: b.host, port, user: b.user, pass, from: clean(b.from, 200) || b.user })));
  audit('EMAIL_SETTINGS_CHANGED'); res.json({ ok: true });
});
api.post('/mail/test', async (req, res) => {
  try { await sendMail(db.prepare('SELECT email FROM owner').get().email, 'Vinchurkar Jewellers test email', 'Email is working. Password-reset codes will be sent from this account.'); res.json({ ok: true }); }
  catch (e) { fail(res, 400, 'Could not send: ' + String(e.message).slice(0, 150)); }
});
api.post('/logo', (req, res) => {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec((req.body || {}).data || ''); if (!m) return fail(res, 400, 'Please choose a PNG or JPG image');
  const buf = Buffer.from(m[2], 'base64'), ok = m[1] === 'png' ? buf.subarray(0, 4).toString('hex') === '89504e47' : buf.subarray(0, 3).toString('hex') === 'ffd8ff';
  if (!ok || buf.length > 1024 * 1024) return fail(res, 400, 'Logo must be a valid PNG/JPG under 1 MB');
  const h = sha(buf.toString('base64'));
  tx(() => { db.prepare('INSERT OR IGNORE INTO assets VALUES(?,?)').run(h, buf); db.prepare("INSERT INTO settings VALUES('logo_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(h); audit('LOGO_CHANGED'); });
  res.json({ ok: true });
});
api.delete('/logo', (req, res) => { db.prepare("DELETE FROM settings WHERE key='logo_hash'").run(); audit('LOGO_REMOVED'); res.json({ ok: true }); });

api.get('/customers', (req, res) => {
  const q = '%' + clean(req.query.q, 50) + '%';
  res.json(db.prepare('SELECT * FROM customers WHERE name LIKE ? OR mobile LIKE ? ORDER BY name LIMIT 20').all(q, q));
});
api.post('/calc', (req, res) => { try { res.json(calcBill(req.body.items, { intraState: req.body.intraState !== false })); } catch (e) { fail(res, 400, e.message); } });

api.post('/invoices', (req, res) => {
  try {
    const { customer: c = {}, items, paymentMode, intraState } = req.body || {};
    const mobile = mobileOf(c.mobile);
    if (!clean(c.name, 100) || !clean(c.address, 300) || !mobile) return fail(res, 400, 'Customer name, address and a valid Indian mobile number are required');
    if (c.email && !emailOk(c.email)) return fail(res, 400, 'Invalid customer email');
    if (!gstinOk(clean(c.gstin, 15).toUpperCase())) return fail(res, 400, 'Invalid customer GSTIN');
    if (!['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque'].includes(paymentMode)) return fail(res, 400, 'Invalid payment mode');
    if (!(items || []).every(i => clean(i.name, 100))) return fail(res, 400, 'Every item needs a name');
    const bill = calcBill(items, { intraState: intraState !== false }), shop = getSettings(), date = today();
    const inv = tx(() => {
      let cust = db.prepare('SELECT * FROM customers WHERE mobile=? AND lower(name)=lower(?)').get(mobile, clean(c.name, 100));
      if (!cust) { const r = db.prepare('INSERT INTO customers(name,address,mobile,email,gstin,notes,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(clean(c.name, 100), clean(c.address, 300), mobile, clean(c.email, 254), clean(c.gstin, 15).toUpperCase(), clean(c.notes, 500), new Date().toISOString());
        cust = db.prepare('SELECT * FROM customers WHERE id=?').get(r.lastInsertRowid); }
      const year = +date.slice(0, 4), n = db.prepare('INSERT INTO invoice_counters VALUES(?,1) ON CONFLICT(year) DO UPDATE SET last=last+1 RETURNING last').get(year).last;
      const invoiceNo = `${shop.inv_prefix || 'VJ'}-${year}-${String(n).padStart(6, '0')}`;
      const snapshot = { invoiceNo, invoiceDate: date, paymentMode, customer: { name: cust.name, address: cust.address, mobile: cust.mobile, email: cust.email, gstin: cust.gstin }, shop, bill };
      const r = db.prepare(`INSERT INTO invoices(invoice_no,invoice_date,created_at,customer_id,payment_mode,subtotal_paise,discount_paise,taxable_paise,tax_paise,round_paise,total_paise,snapshot)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(invoiceNo, date, new Date().toISOString(), cust.id, paymentMode, bill.subtotal, bill.discount, bill.taxable, bill.tax, bill.rounding, bill.total, JSON.stringify(snapshot));
      for (const i of bill.items) db.prepare('INSERT INTO invoice_items(invoice_id,name,category,gross_mg,stone_mg,net_mg,rate_paise,making_paise,stone_paise,other_paise,discount_paise,taxable_paise,tax_bps,final_paise) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(r.lastInsertRowid, i.name, i.category, i.grossMg, i.stoneMg, i.netMg, i.ratePaise, i.makingPaise, i.stonePaise, i.otherPaise, i.discountPaise, i.taxablePaise, i.taxBps, i.finalPaise);
      audit('INVOICE_CREATED', invoiceNo); return { invoiceNo, total: bill.total };
    });
    res.json(inv);
  } catch (e) { console.error('create invoice:', e.message); fail(res, 400, /Invalid|must|exceeds|Add at least|Too many/.test(e.message) ? e.message : 'Could not save invoice'); }
});
const listSql = `SELECT i.invoice_no,i.invoice_date,i.payment_mode,i.status,i.total_paise,c.name customer,c.mobile FROM invoices i JOIN customers c ON c.id=i.customer_id`;
api.get('/invoices', (req, res) => {
  const q = req.query, w = [], p = [];
  if (q.q) { w.push('(i.invoice_no LIKE ? OR c.name LIKE ? OR c.mobile LIKE ?)'); const l = '%' + clean(q.q, 50) + '%'; p.push(l, l, l); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || '')) { w.push('i.invoice_date>=?'); p.push(q.from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) { w.push('i.invoice_date<=?'); p.push(q.to); }
  if (q.mode) { w.push('i.payment_mode=?'); p.push(clean(q.mode, 20)); }
  res.json(db.prepare(listSql + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY i.id DESC LIMIT 200').all(...p));
});
const byNo = no => db.prepare('SELECT * FROM invoices WHERE invoice_no=?').get(no);
api.get('/invoices/:no', (req, res) => { const i = byNo(req.params.no); if (!i) return fail(res, 404, 'Invoice not found');
  res.json({ ...JSON.parse(i.snapshot), status: i.status, cancelReason: i.cancel_reason }); });
api.get('/invoices/:no/pdf', (req, res) => { const i = byNo(req.params.no); if (!i) return fail(res, 404, 'Invoice not found');
  res.type('pdf').set('Content-Disposition', `inline; filename="${i.invoice_no}.pdf"`); const snap = JSON.parse(i.snapshot);
  const logo = logoOf(snap.shop?.logo_hash) || logoOf(getSettings().logo_hash);
  renderInvoice(snap, res, logo); });
api.post('/invoices/:no/cancel', (req, res) => {
  const i = byNo(req.params.no), reason = clean((req.body || {}).reason, 200);
  if (!i) return fail(res, 404, 'Invoice not found'); if (i.status === 'CANCELLED') return fail(res, 400, 'Already cancelled'); if (!reason) return fail(res, 400, 'Reason required');
  tx(() => { db.prepare("UPDATE invoices SET status='CANCELLED',cancel_reason=? WHERE id=?").run(reason, i.id); audit('INVOICE_CANCELLED', i.invoice_no); }); res.json({ ok: true });
});

// ---------- reports: only FINAL invoices count; cancelled excluded; total = amount payable (after discount, tax, rounding) ----------
api.get('/reports/summary', (req, res) => {
  const d = today(), m = d.slice(0, 7), pm = new Date(+d.slice(0, 4), +d.slice(5, 7) - 2, 1).toLocaleDateString('en-CA').slice(0, 7);
  const agg = (w, ...p) => db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total_paise),0) t FROM invoices WHERE status='FINAL' AND ${w}`).get(...p);
  res.json({ today: agg('invoice_date=?', d), month: agg('substr(invoice_date,1,7)=?', m), prevMonth: agg('substr(invoice_date,1,7)=?', pm),
    all: db.prepare('SELECT COUNT(*) n FROM invoices').get().n, recent: db.prepare(listSql + ' ORDER BY i.id DESC LIMIT 8').all(),
    byMode: db.prepare("SELECT payment_mode mode,COUNT(*) n,SUM(total_paise) t FROM invoices WHERE status='FINAL' AND invoice_date=? GROUP BY payment_mode").all(d) });
});
api.get('/reports/range', (req, res) => {
  const from = req.query.from, to = req.query.to; if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from > to) return fail(res, 400, 'Choose a valid date range');
  res.json({ days: db.prepare("SELECT invoice_date d,COUNT(*) n,SUM(total_paise) t FROM invoices WHERE status='FINAL' AND invoice_date BETWEEN ? AND ? GROUP BY d ORDER BY d").all(from, to),
    byMode: db.prepare("SELECT payment_mode mode,COUNT(*) n,SUM(total_paise) t FROM invoices WHERE status='FINAL' AND invoice_date BETWEEN ? AND ? GROUP BY payment_mode").all(from, to) });
});
api.post('/backup', (req, res) => { // consistent snapshot via VACUUM INTO
  const f = path.join(dir, 'backups', `billing-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`); audit('BACKUP_CREATED'); res.json({ ok: true, file: f });
});
api.get('/reports/analysis', (req, res) => {
  const { from, to } = req.query, dt = /^\d{4}-\d{2}-\d{2}$/;
  if (!dt.test(from || '') || !dt.test(to || '') || from > to) return fail(res, 400, 'Choose a valid date range');
  const W = "i.status='FINAL' AND i.invoice_date BETWEEN ? AND ?", p = [from, to], all = sql => db.prepare(sql).all(...p), one = sql => db.prepare(sql).get(...p);
  const it = `FROM invoice_items it JOIN invoices i ON i.id=it.invoice_id WHERE ${W}`;
  res.json({
    totals: one(`SELECT COUNT(*) n,COALESCE(SUM(total_paise),0) t,COALESCE(MAX(total_paise),0) mx,COALESCE(SUM(discount_paise),0) disc,COALESCE(SUM(tax_paise),0) tax FROM invoices i WHERE ${W}`),
    items: one(`SELECT COALESCE(SUM(it.making_paise),0) making,COALESCE(SUM(it.taxable_paise+it.discount_paise),0) amount,COALESCE(SUM(it.net_mg),0) mg ${it}`),
    repeat: one(`SELECT COUNT(*) c FROM (SELECT i.customer_id FROM invoices i WHERE ${W} GROUP BY i.customer_id HAVING COUNT(*)>1)`).c,
    customers: one(`SELECT COUNT(DISTINCT i.customer_id) c FROM invoices i WHERE ${W}`).c,
    byCategory: all(`SELECT it.category cat,COUNT(*) n,SUM(it.net_mg) mg,SUM(it.final_paise) t ${it} GROUP BY it.category ORDER BY t DESC`),
    byMode: all(`SELECT i.payment_mode mode,COUNT(*) n,SUM(i.total_paise) t FROM invoices i WHERE ${W} GROUP BY i.payment_mode ORDER BY t DESC`),
    byWeekday: all(`SELECT CAST(strftime('%w',i.invoice_date) AS INTEGER) d,COUNT(*) n,SUM(i.total_paise) t FROM invoices i WHERE ${W} GROUP BY d`),
    byMonth: all(`SELECT substr(i.invoice_date,1,7) m,COUNT(*) n,SUM(i.total_paise) t FROM invoices i WHERE ${W} GROUP BY m ORDER BY m`),
    topCustomers: all(`SELECT c.name,c.mobile,COUNT(*) n,SUM(i.total_paise) t FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE ${W} GROUP BY c.id ORDER BY t DESC LIMIT 5`)
  });
});
api.get('/audit', (req, res) => res.json(db.prepare('SELECT ts,event,detail FROM audit_logs ORDER BY id DESC LIMIT 100').all()));

app.use((e, req, res, next) => { console.error(e.message); fail(res, 500, 'Something went wrong'); });
const PORT = +process.env.PORT || 3000;
if (require.main === module) {
  const srv = app.listen(PORT, '127.0.0.1', () => console.log(`Vinchurkar Billing running at http://localhost:${PORT}`));
  srv.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[Notice] Port ${PORT} is currently in use by another running window.`);
      console.error(`Close the previous terminal window or change PORT in .env if needed.\n`);
      process.exit(1);
    }
    throw err;
  });
}
module.exports = app;

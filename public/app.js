'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = p => '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function api(p, m = 'GET', b) {
  const r = await fetch('/api' + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-VJ': '1' }, body: b ? JSON.stringify(b) : undefined });
  let d = {}; try { d = await r.json(); } catch {}
  if (r.status === 401 && !['/login'].includes(p)) showAuth('login', d.error);
  if (!r.ok) throw new Error(d.error || 'Request failed'); return d;
}
const inp = (id, label, type = 'text', extra = '') => `<label>${label}<input id="${id}" type="${type}" ${extra}></label>`;
const val = id => $('#' + id).value;
const msg = (t, ok) => { const m = $('#msg'); m.className = ok ? 'ok' : 'err'; m.style.fontWeight = '600'; m.textContent = t; if (t) m.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

// ---------- auth screens ----------
function showAuth(mode, note) {
  $('#app').style.display = 'none'; const a = $('#auth'); a.style.display = 'block'; clearTimeout(idle);
  const T = { setup: ['First-time setup', 'Create the one and only owner account.', inp('name', 'Owner name') + inp('email', 'Registered email', 'email') + inp('username', 'Username') + inp('password', 'Password (12+ chars, upper, lower, digit, symbol)', 'password', 'autocomplete="new-password"') + inp('confirm', 'Confirm password', 'password', 'autocomplete="new-password"'), 'Create owner account'],
    login: ['Sign in', note || 'Owner access only.', inp('username', 'Username') + inp('password', 'Password', 'password'), 'Sign in'],
    forgot: ['Forgot password', 'Enter your registered email to receive a 6-digit code.', inp('email', 'Registered email', 'email'), 'Send code'],
    reset: ['Reset password', 'Enter the code from your email (valid 5 minutes).', inp('email', 'Registered email', 'email') + inp('otp', '6-digit code', 'text', 'inputmode="numeric" maxlength="6"') + inp('password', 'New password', 'password') + inp('confirm', 'Confirm new password', 'password'), 'Set new password'] }[mode];
  a.innerHTML = `<h1>Vinchurkar Jewellers</h1><h3>${T[0]}</h3><p>${esc(T[1])}</p>${T[2]}<button class="p" id="go">${T[3]}</button><div id="msg"></div>` +
    (mode === 'login' ? '<p><a id="fp">Forgot password?</a></p>' : mode === 'forgot' || mode === 'reset' ? '<p><a id="bk">Back to sign in</a></p>' : '');
  if ($('#fp')) $('#fp').onclick = () => showAuth('forgot'); if ($('#bk')) $('#bk').onclick = () => showAuth('login');
  $('#go').onclick = async () => {
    try {
      const f = id => $('#' + id) ? val(id) : undefined;
      const body = { name: f('name'), email: f('email'), username: f('username'), password: f('password'), confirm: f('confirm'), otp: f('otp') };
      if (mode === 'setup' || mode === 'login') { await api('/' + mode, 'POST', body); enter(); }
      else if (mode === 'forgot') { const r = await api('/forgot', 'POST', body); msg(r.message, true); setTimeout(() => showAuth('reset'), 1200); }
      else { await api('/reset', 'POST', body); showAuth('login', 'Password updated. Please sign in.'); }
    } catch (e) { msg(e.message); }
  };
}
let idle; const IDLE = 5 * 60 * 1000;
function bump() { clearTimeout(idle); idle = setTimeout(() => api('/logout', 'POST').finally(() => showAuth('login', 'Locked after 5 minutes of inactivity.')), IDLE); }
['click', 'keydown', 'mousemove'].forEach(e => document.addEventListener(e, () => { if ($('#app').style.display === 'block') bump(); }, { passive: true }));
function enter() { $('#auth').style.display = 'none'; $('#app').style.display = 'block'; bump(); go('dash'); }
$('#lock').onclick = () => api('/logout', 'POST').then(() => showAuth('login'));
document.querySelectorAll('nav [data-v]').forEach(b => b.onclick = () => go(b.dataset.v));
async function go(v) {
  document.querySelectorAll('nav [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  try { await views[v](); } catch (e) { $('#main').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
const bars = (data, h = 160) => { const mx = Math.max(1, ...data.map(d => d.value)), w = Math.max(12, Math.floor(640 / Math.max(1, data.length)));
  return `<svg viewBox="0 0 ${data.length * w + 10} ${h + 30}" style="width:100%;max-height:230px">` + data.map((d, i) => { const bh = d.value / mx * h;
    return `<rect x="${i * w + 4}" y="${h - bh}" width="${w - 6}" height="${bh}" fill="#B8902F"><title>${esc(d.label)}: ${inr(d.value)}</title></rect>${data.length <= 16 ? `<text x="${i * w + w / 2}" y="${h + 14}" font-size="9" text-anchor="middle">${esc(d.label.slice(5))}</text>` : ''}`; }).join('') + '</svg>'; };
const invTable = rows => `<table><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Mobile</th><th>Mode</th><th>Total</th><th>Status</th><th></th></tr>` +
  rows.map(r => `<tr><td>${esc(r.invoice_no)}</td><td>${r.invoice_date}</td><td>${esc(r.customer)}</td><td>${esc(r.mobile)}</td><td>${esc(r.payment_mode)}</td><td>${inr(r.total_paise)}</td><td>${r.status}</td>
  <td><a href="/api/invoices/${encodeURIComponent(r.invoice_no)}/pdf" target="_blank">PDF</a>${r.status === 'FINAL' ? ` · <a data-cancel="${esc(r.invoice_no)}">Cancel</a>` : ''}</td></tr>`).join('') + '</table>';
function bindCancel(reload) { document.querySelectorAll('[data-cancel]').forEach(a => a.onclick = async () => { const reason = prompt('Reason for cancelling ' + a.dataset.cancel + '?'); if (!reason) return;
  try { await api(`/invoices/${encodeURIComponent(a.dataset.cancel)}/cancel`, 'POST', { reason }); reload(); } catch (e) { alert(e.message); } }); }

const views = {
  async dash() {
    const s = await api('/reports/summary'), to = new Date().toLocaleDateString('en-CA'), from = new Date(Date.now() - 29 * 864e5).toLocaleDateString('en-CA');
    const r = await api(`/reports/range?from=${from}&to=${to}`), diff = s.month.t - s.prevMonth.t;
    $('#main').innerHTML = `<h2>Dashboard</h2><div class="cards"><div class="card">Today's sales<b>${inr(s.today.t)}</b>${s.today.n} bills</div><div class="card">This month<b>${inr(s.month.t)}</b>${s.month.n} invoices · vs last month ${diff >= 0 ? '+' : '-'}${inr(Math.abs(diff))}</div>
    <div class="card">Total invoices<b>${s.all}</b></div></div><button class="p" onclick="go('bill')">+ New Bill</button>
    <h3>Last 30 days</h3>${bars(r.days.map(d => ({ label: d.d, value: d.t })))}<h3>Recent invoices</h3>${invTable(s.recent)}`; bindCancel(() => go('dash'));
  },
  async bill() {
    const st = await api('/settings'); const cats = ['Gold bangles', 'Gold chain', 'Gold ring', 'Gold necklace', 'Gold earrings', 'Gold coin', 'Silver jewellery', 'Other jewellery'];
    const itemHtml = () => `<div class="item"><div class="row">${inp('', 'Item name', 'text', 'data-k="name"')}<label>Category<select data-k="category">${cats.map(c => `<option>${c}</option>`).join('')}</select></label>
      ${inp('', 'Gross weight (g)', 'text', 'data-k="grossWeight"')}${inp('', 'Stone weight (g)', 'text', 'data-k="stoneWeight" value="0"')}${inp('', 'Gold rate / g (₹)', 'text', 'data-k="rate"')}
      <label>Making type<select data-k="makingType"><option value="FIXED">Fixed ₹</option><option value="PERCENT">% of gold value</option><option value="PER_GRAM">₹ per gram</option></select></label>
      ${inp('', 'Making value', 'text', 'data-k="making" value="0"')}${inp('', 'Stone charge ₹', 'text', 'data-k="stoneCharge" value="0"')}${inp('', 'Other charge ₹', 'text', 'data-k="otherCharge" value="0"')}
      ${inp('', 'Discount ₹', 'text', 'data-k="discount" value="0"')}${inp('', 'GST % (confirm with your CA)', 'text', `data-k="taxPercent" value="${esc(st.default_gst_pct)}"`)}${inp('', 'Description (optional)', 'text', 'data-k="description"')}</div>
      <button class="s" onclick="this.parentElement.remove()">Remove</button></div>`;
    $('#main').innerHTML = `<h2>New Bill</h2>${st.default_gst_pct === '' ? '<p class="warn">Set the default GST % in Settings (verify current rates with your accountant). The tax field below must be filled for each item.</p>' : ''}
      <div class="row">${inp('cn', 'Customer name')}${inp('cm', 'Mobile (10 digits)')}${inp('ce', 'Email (optional)', 'email')}${inp('cg', 'Customer GSTIN (optional)')}</div>${inp('ca', 'Address')}
      <div id="sug"></div><h3>Items</h3><div id="items">${itemHtml()}</div><button class="s" id="add">+ Add item</button>
      <div class="row"><label>Payment mode<select id="pm"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select></label>
      <label>Tax type<select id="intra"><option value="1">Same state (CGST+SGST)</option><option value="0">Other state (IGST)</option></select></label></div>
      <button class="p" id="calc">Calculate preview</button> <button class="p" id="save">Save &amp; generate PDF</button><div id="msg"></div><div id="prev"></div>`;
    $('#add').onclick = () => $('#items').insertAdjacentHTML('beforeend', itemHtml());
    $('#cn').oninput = async () => { const q = val('cn'); if (q.length < 2) return $('#sug').innerHTML = ''; const c = await api('/customers?q=' + encodeURIComponent(q));
      $('#sug').innerHTML = c.map((x, i) => `<a data-i="${i}">${esc(x.name)} (${esc(x.mobile)})</a>`).join(' | ');
      $('#sug').querySelectorAll('a').forEach(a => a.onclick = () => { const x = c[a.dataset.i]; $('#cn').value = x.name; $('#cm').value = x.mobile; $('#ca').value = x.address; $('#ce').value = x.email || ''; $('#cg').value = x.gstin || ''; $('#sug').innerHTML = ''; }); };
    const items = () => [...document.querySelectorAll('#items .item')].map(d => Object.fromEntries([...d.querySelectorAll('[data-k]')].map(e => [e.dataset.k, e.value])));
    const payload = () => ({ customer: { name: val('cn'), mobile: val('cm'), email: val('ce'), gstin: val('cg'), address: val('ca') }, items: items(), paymentMode: val('pm'), intraState: val('intra') === '1' });
    $('#calc').onclick = async () => { try { const b = await api('/calc', 'POST', payload()); msg('', true);
      $('#prev').innerHTML = `<h3>Breakdown</h3><table><tr><th>Item</th><th>Net wt</th><th>Gold value</th><th>Making</th><th>Taxable</th><th>Tax</th><th>Amount</th></tr>${b.items.map(i => `<tr><td>${esc(i.name)}</td><td>${(i.netMg / 1000).toFixed(3)} g</td><td>${inr(i.goldValue)}</td><td>${inr(i.makingPaise)}</td><td>${inr(i.taxablePaise)}</td><td>${inr(i.taxPaise)}</td><td>${inr(i.finalPaise)}</td></tr>`).join('')}</table>
      <p>Subtotal ${inr(b.subtotal)} · Discount ${inr(b.discount)} · Taxable ${inr(b.taxable)} · CGST ${inr(b.cgst)} · SGST ${inr(b.sgst)} · IGST ${inr(b.igst)} · Rounding ${inr(b.rounding)}</p><h2>Payable ${inr(b.total)}</h2>`; } catch (e) { msg(e.message); } };
    $('#save').onclick = async () => { try { await api('/calc', 'POST', payload()); } catch (e) { return msg(e.message + ' (check Gold rate and GST % on every item)'); }
      if (!confirm('Finalise this invoice? It cannot be edited afterwards.')) return;
      try { const r = await api('/invoices', 'POST', payload()); window.open(`/api/invoices/${encodeURIComponent(r.invoiceNo)}/pdf`, '_blank'); msg(`Saved ${r.invoiceNo} — ${inr(r.total)}. PDF opened in a new tab (allow pop-ups if it did not).`, true); } catch (e) { msg(e.message); } };
  },
  async search() {
    $('#main').innerHTML = `<h2>Search Bill</h2>${inp('no', 'Invoice number (e.g. VJ-2026-000001)')}<button class="p" id="f">Find</button><div id="msg"></div><div id="res"></div>`;
    $('#f').onclick = async () => { try { const s = await api('/invoices/' + encodeURIComponent(val('no').trim().toUpperCase())); msg('', true);
      $('#res').innerHTML = `<h3>${esc(s.invoiceNo)} ${s.status === 'CANCELLED' ? '(CANCELLED: ' + esc(s.cancelReason) + ')' : ''}</h3><p>${s.invoiceDate} · ${esc(s.paymentMode)}<br><b>${esc(s.customer.name)}</b>, ${esc(s.customer.address)}<br>${esc(s.customer.mobile)}</p>
      <table><tr><th>Item</th><th>Net wt</th><th>Rate/g</th><th>Making</th><th>Amount</th></tr>${s.bill.items.map(i => `<tr><td>${esc(i.name)}</td><td>${(i.netMg / 1000).toFixed(3)} g</td><td>${inr(i.ratePaise)}</td><td>${inr(i.makingPaise)}</td><td>${inr(i.finalPaise)}</td></tr>`).join('')}</table>
      <p>CGST ${inr(s.bill.cgst)} · SGST ${inr(s.bill.sgst)} · IGST ${inr(s.bill.igst)} · Rounding ${inr(s.bill.rounding)}</p><h3>Payable ${inr(s.bill.total)}</h3>
      <a href="/api/invoices/${encodeURIComponent(s.invoiceNo)}/pdf" target="_blank">View / Print / Save PDF</a>`; } catch (e) { $('#res').innerHTML = ''; msg(e.message); } };
  },
  async history() {
    $('#main').innerHTML = `<h2>Invoice History</h2><div class="row">${inp('q', 'Invoice / name / mobile')}${inp('from', 'From', 'date')}${inp('to', 'To', 'date')}<label>Mode<select id="mode"><option value="">All</option><option>Cash</option><option>UPI</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select></label></div><button class="p" id="f">Filter</button><div id="list"></div>`;
    const load = async () => { const p = new URLSearchParams({ q: val('q'), from: val('from'), to: val('to'), mode: val('mode') }); $('#list').innerHTML = invTable(await api('/invoices?' + p)); bindCancel(load); };
    $('#f').onclick = load; load();
  },
  async reports() {
    const t = new Date().toLocaleDateString('en-CA');
    $('#main').innerHTML = `<h2>Sales Reports</h2><p class="warn">Totals count FINAL invoices only (amount payable, after discount, tax and rounding). Cancelled invoices are excluded.</p><div class="row">${inp('from', 'From', 'date', `value="${t.slice(0, 8)}01"`)}${inp('to', 'To', 'date', `value="${t}"`)}</div><button class="p" id="f">Show</button> <button class="s" id="csv">Export CSV</button><div id="msg"></div><div id="out"></div>`;
    let last; $('#f').onclick = async () => { try { last = await api(`/reports/range?from=${val('from')}&to=${val('to')}`); const tot = last.days.reduce((a, d) => a + d.t, 0), n = last.days.reduce((a, d) => a + d.n, 0); msg('', true);
      $('#out').innerHTML = `<div class="cards"><div class="card">Total<b>${inr(tot)}</b></div><div class="card">Invoices<b>${n}</b></div><div class="card">Average<b>${inr(n ? Math.round(tot / n) : 0)}</b></div></div>${bars(last.days.map(d => ({ label: d.d, value: d.t })))}
      <table><tr><th>Date</th><th>Invoices</th><th>Sales</th></tr>${last.days.map(d => `<tr><td>${d.d}</td><td>${d.n}</td><td>${inr(d.t)}</td></tr>`).join('')}</table><h3>By payment mode</h3>${bars(last.byMode.map(m => ({ label: '0000-' + m.mode, value: m.t })))}
      <table><tr><th>Mode</th><th>Invoices</th><th>Sales</th></tr>${last.byMode.map(m => `<tr><td>${esc(m.mode)}</td><td>${m.n}</td><td>${inr(m.t)}</td></tr>`).join('')}</table>`; } catch (e) { msg(e.message); } };
    $('#csv').onclick = () => { if (!last) return; const csv = 'date,invoices,sales_inr\n' + last.days.map(d => `${d.d},${d.n},${(d.t / 100).toFixed(2)}`).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'sales.csv'; a.click(); };
  },
  async settings() {
    const s = await api('/settings'), F = [['shop_name', 'Shop name'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'Shop email'], ['gstin', 'GSTIN (if applicable)'], ['est_year', 'Establishment year'], ['footer', 'Invoice footer'],
      ['terms', 'Terms & conditions'], ['inv_prefix', 'Invoice prefix (e.g. VJ)'], ['default_gst_pct', 'Default GST % (confirm current rate with your CA)'], ['wm_text', 'Watermark text'], ['wm_opacity', 'Watermark opacity (0.03–0.3)'], ['wm_size', 'Watermark size (20–90)']];
    $('#main').innerHTML = `<h2>Settings</h2><p class="warn">Enter your real business details. Nothing is pre-filled with invented data.</p><div class="row">${F.map(([k, l]) => inp('s_' + k, l, 'text', `value="${esc(s[k] || '')}"`)).join('')}</div>
      <button class="p" id="sv">Save</button> <button class="s" id="bk">Create backup now</button><div id="msg"></div>`;
    $('#sv').onclick = async () => { try { await api('/settings', 'PUT', Object.fromEntries(F.map(([k]) => [k, val('s_' + k)]))); msg('Saved', true); } catch (e) { msg(e.message); } };
    $('#bk').onclick = async () => { try { const r = await api('/backup', 'POST'); msg('Backup created: ' + r.file, true); } catch (e) { msg(e.message); } };
  }
};
(async () => { const s = await api('/state'); if (!s.setup) showAuth('setup'); else if (s.authed) enter(); else showAuth('login'); })();

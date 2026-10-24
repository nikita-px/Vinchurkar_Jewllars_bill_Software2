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
const inp = (id, label, type = 'text', extra = '') => `<label>${label}<input ${id ? `id="${id}"` : ''} type="${type}" ${extra}></label>`;
const val = id => $('#' + id)?.value ?? '';
const msg = (t, ok) => { const m = $('#msg'); if (!m) return; m.className = ok ? 'ok' : 'err'; m.textContent = t ? (ok ? '✓ ' : '⚠️ ') + t : ''; if (t) m.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
function highlightError(inp) {
  if (!inp) return;
  inp.classList.add('input-invalid');
  inp.focus();
  inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
  inp.addEventListener('input', () => inp.classList.remove('input-invalid'), { once: true });
}
function cleanNum(v) {
  let s = String(v ?? '').trim();
  s = s.replace(/^(₹|rs\.?|\$)\s*/i, '');
  s = s.replace(/[\s,₹$%]/g, '');
  s = s.replace(/(g|gm|grams|kg|\/-)$/i, '');
  return s.trim();
}

function validateBillItems() {
  const itemEls = document.querySelectorAll('#items .item');
  if (itemEls.length === 0) return { ok: false, msg: 'Please add at least one item using "+ Add item"' };
  for (let i = 0; i < itemEls.length; i++) {
    const el = itemEls[i];
    const nameInp = el.querySelector('[data-k="name"]');
    const catSel = el.querySelector('[data-k="category"]');
    const gwInp = el.querySelector('[data-k="grossWeight"]');
    const swInp = el.querySelector('[data-k="stoneWeight"]');
    const rateInp = el.querySelector('[data-k="rate"]');
    const mtSel = el.querySelector('[data-k="makingType"]');
    const mkInp = el.querySelector('[data-k="making"]');
    const taxInp = el.querySelector('[data-k="taxPercent"]');
    const scInp = el.querySelector('[data-k="stoneCharge"]');
    const ocInp = el.querySelector('[data-k="otherCharge"]');
    const dcInp = el.querySelector('[data-k="discount"]');

    if (!nameInp?.value.trim()) {
      nameInp.value = catSel?.value || 'Gold Jewellery';
    }

    const gwClean = cleanNum(gwInp?.value);
    const gw = parseFloat(gwClean || '0');
    if (!gwClean || isNaN(gw) || gw <= 0) {
      highlightError(gwInp);
      return { ok: false, msg: `Item #${i + 1}: Please enter Gross weight in grams (e.g. 5.250)` };
    }
    gwInp.value = gwClean;

    if (swInp) swInp.value = cleanNum(swInp.value) || '0';

    const rateClean = cleanNum(rateInp?.value);
    const rate = parseFloat(rateClean || '0');
    if (!rateClean || isNaN(rate) || rate <= 0) {
      highlightError(rateInp);
      return { ok: false, msg: `Item #${i + 1}: Please enter Gold rate / g (e.g. 7500)` };
    }
    rateInp.value = rateClean;

    const mkClean = cleanNum(mkInp?.value);
    const mkVal = parseFloat(mkClean || '0');
    if (mtSel?.value === 'PERCENT') {
      if (mkVal > 100) {
        highlightError(mkInp);
        return { ok: false, msg: `Item #${i + 1}: Making % cannot exceed 100% (you entered ${mkClean}%). If you intended ₹${mkClean} in rupees, select "Fixed ₹" under Making type.` };
      }
    }
    if (mkInp) mkInp.value = mkClean || '0';

    if (scInp) scInp.value = cleanNum(scInp.value) || '0';
    if (ocInp) ocInp.value = cleanNum(ocInp.value) || '0';
    if (dcInp) dcInp.value = cleanNum(dcInp.value) || '0';
    if (taxInp) taxInp.value = cleanNum(taxInp.value) || '0';
  }
  return { ok: true };
}

// ---------- auth screens ----------
function showAuth(mode, note) {
  $('#app').style.display = 'none'; const a = $('#auth'); a.style.display = 'block'; clearTimeout(idle);
  const T = { setup: ['Owner Sign in', 'Owner access only. Fixed authorization required.', inp('username', 'Login ID / Email', 'text', 'placeholder="Vinchurkarj@gmail.com" autocomplete="username"') + inp('password', 'Password', 'password', 'placeholder="Enter password" autocomplete="current-password"'), 'Sign in'],
    login: ['Sign in', note || 'Owner access only. Fixed authorization required.', inp('username', 'Login ID / Email', 'text', 'placeholder="Vinchurkarj@gmail.com" autocomplete="username"') + inp('password', 'Password', 'password', 'placeholder="Enter password" autocomplete="current-password"'), 'Sign in'],
    forgot: ['Forgot password', 'Enter your registered email to receive a 6-digit code.', inp('email', 'Registered email', 'email'), 'Send code'],
    reset: ['Reset password', 'Enter the code from your email (valid 5 minutes).', inp('email', 'Registered email', 'email') + inp('otp', '6-digit code', 'text', 'inputmode="numeric" maxlength="6"') + inp('password', 'New password', 'password') + inp('confirm', 'Confirm new password', 'password'), 'Set new password'] }[mode];
  a.innerHTML = `<img class="logo" src="/logo.jpg" alt="Vinchurkar Jewellers" onerror="this.style.display='none'"><h1>Vinchurkar Jewellers</h1><h3>${T[0]}</h3><p>${esc(T[1])}</p>${T[2]}<button class="p" id="go">${T[3]}</button><div id="msg"></div>` +
    (mode === 'forgot' || mode === 'reset' ? '<p><a id="bk">Back to sign in</a></p>' : '');
  if ($('#bk')) $('#bk').onclick = () => showAuth('login');

  ['username', 'password', 'email', 'otp', 'confirm'].forEach(id => {
    const el = $('#' + id);
    if (el) el.onkeydown = e => { if (e.key === 'Enter') $('#go').click(); };
  });

  $('#go').onclick = async () => {
    try {
      const f = id => $('#' + id) ? val(id) : undefined;
      const body = { name: f('name'), email: f('email'), username: f('username'), password: f('password'), confirm: f('confirm'), otp: f('otp') };
      if (mode === 'setup' || mode === 'login') { await api('/login', 'POST', body); enter(); }
      else if (mode === 'forgot') { const r = await api('/forgot', 'POST', body); msg(r.message, true); setTimeout(() => showAuth('reset'), 1200); }
      else { await api('/reset', 'POST', body); showAuth('login', 'Password updated. Please sign in.'); }
    } catch (e) { msg(e.message); }
  };
}
let idle; const IDLE = 5 * 60 * 1000;
function bump() { clearTimeout(idle); idle = setTimeout(() => api('/logout', 'POST').finally(() => showAuth('login', 'Locked after 5 minutes of inactivity.')), IDLE); }
['click', 'keydown', 'mousemove'].forEach(e => document.addEventListener(e, () => { if ($('#app').style.display === 'block') bump(); }, { passive: true }));
async function enter() {
  $('#auth').style.display = 'none'; $('#app').style.display = 'block'; bump(); go('dash');
  try { const st = await api('/settings'); $('#sname').textContent = st.shop_name || 'Vinchurkar Jewellers'; const l = $('#slogo');
    l.src = '/logo.jpg?t=' + Date.now(); l.style.display = 'block'; } catch {}
}
$('#lock').onclick = () => api('/logout', 'POST').then(() => showAuth('login'));
document.addEventListener('click', e => {
  const v = e.target.closest('[data-v]');
  if (v) {
    e.preventDefault();
    go(v.dataset.v);
    return;
  }
  const rm = e.target.closest('.item-remove');
  if (rm) {
    e.preventDefault();
    rm.closest('.item')?.remove();
    return;
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset?.k === 'category') {
    const item = e.target.closest('.item');
    const nameInp = item?.querySelector('[data-k="name"]');
    if (nameInp) nameInp.value = e.target.value;
  }
  if (e.target.dataset?.k === 'makingType') {
    const item = e.target.closest('.item');
    const mkInp = item?.querySelector('[data-k="making"]');
    const label = mkInp?.parentElement;
    if (mkInp && label) {
      const type = e.target.value;
      if (type === 'PERCENT') {
        label.childNodes[0].nodeValue = 'Making charge (%) ';
        mkInp.placeholder = 'e.g. 10 or 12.5%';
      } else if (type === 'PER_GRAM') {
        label.childNodes[0].nodeValue = 'Making charge (₹/g) ';
        mkInp.placeholder = 'e.g. 450';
      } else {
        label.childNodes[0].nodeValue = 'Making charge (Fixed ₹) ';
        mkInp.placeholder = 'e.g. 500';
      }
    }
  }
});
async function go(v) {
  document.querySelectorAll('nav [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  try { await views[v](); } catch (e) { $('#main').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
const bars = (data, h = 160) => { const mx = Math.max(1, ...data.map(d => d.value)), w = Math.max(12, Math.floor(640 / Math.max(1, data.length)));
  return `<svg viewBox="0 0 ${data.length * w + 10} ${h + 30}" style="width:100%;max-height:230px">` + data.map((d, i) => { const bh = d.value / mx * h;
    return `<rect x="${i * w + 4}" y="${h - bh}" width="${w - 6}" height="${bh}" fill="#C9A24B"><title>${esc(d.label)}: ${inr(d.value)}</title></rect>${data.length <= 16 ? `<text x="${i * w + w / 2}" y="${h + 14}" font-size="9" text-anchor="middle">${esc(d.label.slice(5))}</text>` : ''}`; }).join('') + '</svg>'; };
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
    <div class="card">Total invoices<b>${s.all}</b></div></div><button class="p" id="dash-new-bill" data-v="bill">+ New Bill</button>
    <h3>Last 30 days</h3>${bars(r.days.map(d => ({ label: d.d, value: d.t })))}<h3>Recent invoices</h3>${invTable(s.recent)}`; bindCancel(() => go('dash'));
    const nb = $('#dash-new-bill'); if (nb) nb.onclick = () => go('bill');
  },
  async bill() {
    const st = await api('/settings'); const cats = ['Gold bangles', 'Gold chain', 'Gold ring', 'Gold necklace', 'Gold earrings', 'Gold coin', 'Silver jewellery', 'Other jewellery'];
    const itemHtml = () => `<div class="item"><div class="row">${inp('', 'Item name *', 'text', 'data-k="name" value="Gold bangles"')}<label>Category<select data-k="category">${cats.map(c => `<option>${c}</option>`).join('')}</select></label>
      ${inp('', 'Gross weight (g) *', 'text', 'data-k="grossWeight" placeholder="e.g. 5.250"')}${inp('', 'Stone weight (g)', 'text', 'data-k="stoneWeight" value="0"')}${inp('', 'Gold rate / g (₹) *', 'text', 'data-k="rate" placeholder="e.g. 7500"')}
      <label>Making type<select data-k="makingType"><option value="FIXED">Fixed ₹</option><option value="PERCENT">% of gold value</option><option value="PER_GRAM">₹ per gram</option></select></label>
      ${inp('', 'Making value', 'text', 'data-k="making" value="0"')}${inp('', 'Stone charge ₹', 'text', 'data-k="stoneCharge" value="0"')}${inp('', 'Other charge ₹', 'text', 'data-k="otherCharge" value="0"')}
      ${inp('', 'Discount ₹', 'text', 'data-k="discount" value="0"')}${inp('', 'GST %', 'text', `data-k="taxPercent" value="${esc(st.default_gst_pct || '0')}"`)}${inp('', 'Description (optional)', 'text', 'data-k="description"')}</div>
      <button class="s item-remove" type="button">Remove</button></div>`;
    $('#main').innerHTML = `<h2>New Bill</h2>${st.default_gst_pct === '' ? '<p class="warn">Set the default GST % in Settings (verify current rates with your accountant). The tax field below must be filled for each item.</p>' : ''}
      <div class="row">${inp('cn', 'Customer name *', 'text', 'placeholder="e.g. Rajesh Sharma"')}${inp('cm', 'Mobile (10 digits) *', 'text', 'placeholder="e.g. 9876543210" maxlength="10"')}${inp('ce', 'Email (optional)', 'email', 'placeholder="customer@example.com"')}${inp('cg', 'Customer GSTIN (optional)', 'text', 'placeholder="Optional"')}</div>${inp('ca', 'Address *', 'text', 'placeholder="Customer city or full address"')}
      <div id="sug"></div><h3>Items</h3><div id="items">${itemHtml()}</div><button class="s" id="add" type="button">+ Add item</button>
      <div class="row"><label>Payment mode<select id="pm"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select></label>
      <label>Tax type<select id="intra"><option value="1">Same state (CGST+SGST)</option><option value="0">Other state (IGST)</option></select></label></div>
      <div id="msg"></div>
      <div style="display:flex;gap:12px;align-items:center;margin:16px 0;flex-wrap:wrap">
        <button class="p" id="calc" type="button" style="margin-top:0">Calculate preview</button>
        <button class="p" id="save" type="button" style="margin-top:0">Save &amp; generate PDF</button>
      </div>
      <div id="prev"></div>`;
    $('#add').onclick = () => $('#items').insertAdjacentHTML('beforeend', itemHtml());
    $('#cn').oninput = async () => { const q = val('cn'); if (q.length < 2) return $('#sug').innerHTML = ''; const c = await api('/customers?q=' + encodeURIComponent(q));
      $('#sug').innerHTML = c.map((x, i) => `<a data-i="${i}">${esc(x.name)} (${esc(x.mobile)})</a>`).join(' | ');
      $('#sug').querySelectorAll('a').forEach(a => a.onclick = () => { const x = c[a.dataset.i]; $('#cn').value = x.name; $('#cm').value = x.mobile; $('#ca').value = x.address; $('#ce').value = x.email || ''; $('#cg').value = x.gstin || ''; $('#sug').innerHTML = ''; }); };
    const items = () => [...document.querySelectorAll('#items .item')].map(d => Object.fromEntries([...d.querySelectorAll('[data-k]')].map(e => [e.dataset.k, e.value])));
    const payload = () => ({ customer: { name: val('cn'), mobile: val('cm'), email: val('ce'), gstin: val('cg'), address: val('ca') }, items: items(), paymentMode: val('pm'), intraState: val('intra') === '1' });
    $('#calc').onclick = async () => {
      const v = validateBillItems(); if (!v.ok) return msg(v.msg);
      const btn = $('#calc'); btn.disabled = true; btn.textContent = 'Calculating...';
      try {
        const b = await api('/calc', 'POST', payload()); msg('Preview calculated successfully', true);
        $('#prev').innerHTML = `<h3>Breakdown</h3><table><tr><th>Item</th><th>Net wt</th><th>Gold value</th><th>Making</th><th>Taxable</th><th>Tax</th><th>Amount</th></tr>${b.items.map(i => `<tr><td>${esc(i.name)}</td><td>${(i.netMg / 1000).toFixed(3)} g</td><td>${inr(i.goldValue)}</td><td>${inr(i.makingPaise)}</td><td>${inr(i.taxablePaise)}</td><td>${inr(i.taxPaise)}</td><td>${inr(i.finalPaise)}</td></tr>`).join('')}</table>
        <p>Subtotal ${inr(b.subtotal)} · Discount ${inr(b.discount)} · Taxable ${inr(b.taxable)} · CGST ${inr(b.cgst)} · SGST ${inr(b.sgst)} · IGST ${inr(b.igst)} · Rounding ${inr(b.rounding)}</p><h2>Payable ${inr(b.total)}</h2>`;
        $('#prev').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        msg(e.message);
      } finally {
        btn.disabled = false; btn.textContent = 'Calculate preview';
      }
    };
    $('#save').onclick = async () => {
      const cName = val('cn').trim(), cMobile = val('cm').trim().replace(/[\s-]/g, '').replace(/^(\+91|91|0)/, ''), cAddress = val('ca').trim();
      const cnInp = $('#cn'), cmInp = $('#cm'), caInp = $('#ca');
      if (!cName) { highlightError(cnInp); return msg('Please enter Customer Name'); }
      if (!/^[6-9]\d{9}$/.test(cMobile)) { highlightError(cmInp); return msg('Please enter a valid 10-digit Indian Mobile number (e.g. 9876543210)'); }
      if (!cAddress) { highlightError(caInp); return msg('Please enter Customer Address'); }

      const v = validateBillItems(); if (!v.ok) return msg(v.msg);

      const saveBtn = $('#save'); saveBtn.disabled = true; saveBtn.textContent = '⏳ Saving invoice & generating bill...'; msg('Saving invoice and generating bill...', true);
      try {
        const r = await api('/invoices', 'POST', payload());
        const pdfUrl = `/api/invoices/${encodeURIComponent(r.invoiceNo)}/pdf`;
        try { window.open(pdfUrl, '_blank'); } catch {}
        msg(`✓ Invoice ${r.invoiceNo} successfully generated!`, true);
        $('#prev').innerHTML = `
          <div class="panel" style="margin-top:20px;border-left:5px solid var(--ok);background:#FCFDFB;padding:22px;border-radius:14px;box-shadow:var(--sh)">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
              <div>
                <h3 style="color:var(--ok);margin:0;font-size:24px">✓ Invoice ${esc(r.invoiceNo)} Ready!</h3>
                <p style="margin:6px 0;font-size:15px;color:var(--mute)">Customer: <b style="color:var(--ink)">${esc(cName)}</b> &nbsp;|&nbsp; Amount Payable: <b style="color:var(--gold);font-size:18px">${inr(r.total)}</b></p>
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                <a href="${pdfUrl}" target="_blank" class="p" style="display:inline-flex;align-items:center;gap:6px;padding:12px 24px;text-decoration:none;border-radius:10px;font-size:15px">📄 View / Print PDF</a>
                <a href="${pdfUrl}" download="${esc(r.invoiceNo)}.pdf" class="s" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;text-decoration:none;border-radius:10px;font-size:14px">📥 Download PDF</a>
                <button class="s" id="nextBill" style="padding:10px 18px">+ Create Next Bill</button>
                <button class="s" id="viewHist" style="padding:10px 18px">Invoice History</button>
              </div>
            </div>
            <div style="margin-top:18px">
              <iframe src="${pdfUrl}" style="width:100%;height:680px;border:1px solid var(--line);border-radius:12px;background:#fff;box-shadow:var(--sh)"></iframe>
            </div>
          </div>`;
        if ($('#nextBill')) $('#nextBill').onclick = () => views.bill();
        if ($('#viewHist')) $('#viewHist').onclick = () => go('history');
        $('#prev').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        msg(e.message);
      } finally {
        saveBtn.disabled = false; saveBtn.textContent = 'Save & generate PDF';
      }
    };
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
      <button class="p" id="sv">Save</button> <button class="s" id="bk">Create backup now</button>
      <h3>Shop logo (top-left of every bill)</h3><div>${s.logo_hash ? '<img src="/api/logo?t=' + Date.now() + '" style="max-height:80px;display:block;margin:6px 0">' : '<p>No logo uploaded yet.</p>'}</div>
      <input type="file" id="logo" accept="image/png,image/jpeg" style="max-width:320px"> <button class="s" id="rmlogo">Remove logo</button><div id="msg"></div>`;
    $('#sv').onclick = async () => { try { await api('/settings', 'PUT', Object.fromEntries(F.map(([k]) => [k, val('s_' + k)]))); msg('Saved', true); } catch (e) { msg(e.message); } };
    $('#bk').onclick = async () => { try { const r = await api('/backup', 'POST'); msg('Backup created: ' + r.file, true); } catch (e) { msg(e.message); } };
    $('#logo').onchange = e => { const f = e.target.files[0]; if (!f) return; if (f.size > 1048576) return msg('Logo must be under 1 MB'); const r = new FileReader();
      r.onload = async () => { try { await api('/logo', 'POST', { data: r.result }); views.settings(); } catch (x) { msg(x.message); } }; r.readAsDataURL(f); };
    $('#rmlogo').onclick = async () => { await api('/logo', 'DELETE'); views.settings(); };
  }
};
const hbars = (rows, fmt) => { const mx = Math.max(1, ...rows.map(r => r.v)); return rows.length ? rows.map(r => `<div class="hb"><span>${esc(r.l)}</span><div class="tr"><i style="width:${(r.v / mx * 100).toFixed(1)}%"></i></div><b>${fmt(r.v)}</b></div>`).join('') : '<p>No data in this period.</p>'; };
views.analytics = async () => {
  const t = new Date().toLocaleDateString('en-CA'), f = new Date(Date.now() - 89 * 864e5).toLocaleDateString('en-CA');
  $('#main').innerHTML = `<h2>Sales Analytics</h2><p class="warn">Counts final invoices only (cancelled ones are excluded). Amounts are the amount payable.</p><div class="row">${inp('from', 'From', 'date', `value="${f}"`)}${inp('to', 'To', 'date', `value="${t}"`)}</div><button class="p" id="f">Analyse</button><div id="msg"></div><div id="out"></div>`;
  const D = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '0%';
  $('#f').onclick = async () => { try {
    const a = await api(`/reports/analysis?from=${val('from')}&to=${val('to')}`), T = a.totals; msg('', true);
    const wd = D.map((l, d) => ({ l, v: (a.byWeekday.find(x => x.d === d) || { t: 0 }).t }));
    $('#out').innerHTML = `<div class="cards"><div class="card">Total sales<b>${inr(T.t)}</b>${T.n} invoices</div><div class="card">Average bill<b>${inr(T.n ? Math.round(T.t / T.n) : 0)}</b>Largest ${inr(T.mx)}</div>
      <div class="card">Customers<b>${a.customers}</b>${a.repeat} repeat (${pct(a.repeat, a.customers)})</div><div class="card">Net metal weight sold<b>${(a.items.mg / 1000).toFixed(2)} g</b>across all items</div>
      <div class="card">Making charges<b>${inr(a.items.making)}</b>${pct(a.items.making, a.items.amount)} of item value</div><div class="card">Discounts given<b>${inr(T.disc)}</b>Tax collected ${inr(T.tax)}</div></div>
      <div class="two"><div class="panel"><h3>Sales by category</h3>${hbars(a.byCategory.map(c => ({ l: c.cat, v: c.t })), inr)}</div><div class="panel"><h3>Weight sold by category (g)</h3>${hbars(a.byCategory.map(c => ({ l: c.cat, v: c.mg })), v => (v / 1000).toFixed(2))}</div>
      <div class="panel"><h3>Best days of the week</h3>${hbars(wd, inr)}</div><div class="panel"><h3>Payment modes</h3>${hbars(a.byMode.map(m => ({ l: m.mode + ' (' + m.n + ')', v: m.t })), inr)}</div></div>
      <h3>Monthly trend</h3><div class="panel">${a.byMonth.length ? bars(a.byMonth.map(m => ({ label: m.m, value: m.t }))) : '<p>No data in this period.</p>'}</div>
      <h3>Top customers</h3><table><tr><th>Customer</th><th>Mobile</th><th>Bills</th><th>Spent</th></tr>${a.topCustomers.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.mobile)}</td><td>${c.n}</td><td>${inr(c.t)}</td></tr>`).join('') || '<tr><td colspan="4">No data</td></tr>'}</table>`;
  } catch (e) { msg(e.message); } };
  $('#f').click();
};
(async () => { const s = await api('/state'); if (!s.setup) showAuth('setup'); else if (s.authed) enter(); else showAuth('login'); })();

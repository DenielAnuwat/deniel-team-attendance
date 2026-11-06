/* Beyond29 app: registration, my info, admin. All data access passes through `api`. */
(function () {
  'use strict';
  const CFG = window.B29_CONFIG || {};
  const live = CFG.url && !CFG.url.startsWith('__');
  const WS = ['สายกรุงเทพฯ', 'สายขอนแก่น', 'สายเชียงใหม่', 'สายกำแพงแสน', 'อื่นๆ'];
  const TICKETS = ['เสาร์-อาทิตย์', 'เสาร์', 'อาทิตย์'];
  const STATUS = ['Not Paid', 'Waiting Verify', 'Paid', 'Rejected', 'Needs Review', 'Refunded'];
  const LABEL = { 'Not Paid': 'ยังไม่จ่าย', 'Waiting Verify': 'รอตรวจสลิป', Paid: 'จ่ายแล้ว', Rejected: 'สลิปไม่ผ่าน', 'Needs Review': 'รอทีมงานตรวจยอด', Refunded: 'คืนเงินแล้ว', '-': 'ไม่พัก', Active: 'Active', Inactive: 'Inactive', Test: 'Test' };

  const $ = (s, r = document) => r.querySelector(s);
  const main = $('#main'), dlg = $('#dlg');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const baht = n => Number(n || 0).toLocaleString('th-TH') + ' บาท';
  const pill = s => `<span class="pill ${s === '-' ? 'none' : esc(String(s).replace(/\s/g, ''))}">${esc(LABEL[s] || s)}</span>`;
  const options = (list, sel, ph) => (ph ? `<option value="">${esc(ph)}</option>` : '') + list.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
  const store = { get() { try { return JSON.parse(sessionStorage.getItem('b29me')); } catch { return null; } }, set(v) { try { v ? sessionStorage.setItem('b29me', JSON.stringify(v)) : sessionStorage.removeItem('b29me'); } catch { /* optional */ } } };

  let api, cfg = null, offset = 0, tab = 'register', me = null, nickHits = null, nickPick = null;
  const A = { data: null, view: 'overview', f: {}, signed: false };

  function toast(msg) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div'); t.className = 'toast'; t.role = 'status'; t.textContent = msg;
    document.body.append(t); setTimeout(() => t.remove(), 3200);
  }
  const niceErr = e => (e && (e.message || e.error_description)) || 'เกิดข้อผิดพลาด กรุณาลองใหม่';

  async function busy(btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); } catch (e) { toast(niceErr(e)); return undefined; } finally { if (btn) btn.disabled = false; }
  }

  async function makeApi() {
    if (window.B29_TEST_API) return window.B29_TEST_API;
    if (!live) {
      await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'demo.js'; s.onload = ok; s.onerror = no; document.head.append(s); });
      $('#demoBar').hidden = false;
      return window.B29_DEMO;
    }
    await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'; s.onload = ok; s.onerror = no; document.head.append(s); });
    const sb = window.supabase.createClient(CFG.url, CFG.anon);
    const un = r => { if (r.error) throw r.error; return r.data; };
    return {
      rpc: async (n, a) => un(await sb.rpc(n, a)),
      upload: async (path, file) => un(await sb.storage.from('slips').upload(path, file, { contentType: file.type, upsert: false })),
      slipUrl: async path => un(await sb.storage.from('slips').createSignedUrl(path, 3600)).signedUrl,
      login: async (email, password) => un(await sb.auth.signInWithPassword({ email, password })),
      logout: async () => { await sb.auth.signOut(); },
      session: async () => !!(await sb.auth.getSession()).data.session,
      forgot: async email => un(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/#admin' })),
      setPassword: async password => un(await sb.auth.updateUser({ password })),
      onRecovery: fn => sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') fn(); })
    };
  }

  const now = () => Date.now() + offset;
  const cutoffMs = () => new Date(cfg.cutoff).getTime();
  const after = () => now() >= cutoffMs();
  const CUT_TEXT = '15 พ.ย. 2569 เวลา 20:00 น.';
  function fee(t, round) {
    const p = cfg.prices;
    if (!t) return null;
    return t === 'เสาร์-อาทิตย์' ? (round === 'Early Bird' ? p.weekend_early : p.weekend_general) : p.single_day;
  }

  /* ---------- countdown ---------- */
  function tickClock() {
    if (!cfg) return;
    const left = cutoffMs() - now(), box = $('#clock');
    if (left <= 0) {
      if (box.dataset.done) return;
      box.dataset.done = 1;
      $('#clockHead').textContent = 'ปิด Early Bird แล้ว บัตรเสาร์-อาทิตย์ราคา 1,350 บาท';
      box.innerHTML = '';
      if (tab === 'register') render();
      return;
    }
    const s = Math.floor(left / 1000);
    const parts = [[Math.floor(s / 86400), 'วัน'], [Math.floor(s / 3600) % 24, 'ชั่วโมง'], [Math.floor(s / 60) % 60, 'นาที'], [s % 60, 'วินาที']];
    box.innerHTML = parts.map(([n, l]) => `<div><b>${String(n).padStart(2, '0')}</b><span>${l}</span></div>`).join('');
  }

  /* ---------- registration ---------- */
  function personFields(p = {}, admin = false) {
    const stayLocked = !admin && after() && p.stay_choice !== 'พัก';
    return `<div class="fields">
      <label class="all" for="f_full_name">ชื่อ-นามสกุล<input id="f_full_name" name="full_name" required autocomplete="name" value="${esc(p.full_name)}"></label>
      <label for="f_nickname">ชื่อเล่น<input id="f_nickname" name="nickname" required value="${esc(p.nickname)}"></label>
      <label for="f_upline">อัพไลน์ติดตัว<input id="f_upline" name="upline" required value="${esc(p.upline)}"></label>
      <label for="f_workstream">สายงาน<select id="f_workstream" name="workstream" required>${options(WS, p.workstream, 'เลือกสายงาน')}</select></label>
      <label for="f_phone">เบอร์โทร<input id="f_phone" name="phone" required type="tel" inputmode="tel" autocomplete="tel" maxlength="12" placeholder="08xxxxxxxx" value="${esc(p.phone)}"></label>
      <label for="f_gender">เพศ<select id="f_gender" name="gender" required>${options(['ชาย', 'หญิง'], p.gender, 'เลือก')}</select></label>
      <label for="f_ticket_type">ประเภทบัตร<select id="f_ticket_type" name="ticket_type" required>${options(TICKETS, p.ticket_type, 'เลือก')}</select></label>
      <label class="all" for="f_stay_choice">ต้องการที่พัก<select id="f_stay_choice" name="stay_choice" required>${options(stayLocked ? ['ไม่พัก'] : ['พัก', 'ไม่พัก'], p.stay_choice, stayLocked ? null : 'เลือก')}</select></label>
    </div>${stayLocked ? `<p class="note">ปิดรับที่พักแล้ว ถ้าต้องการที่พักกรุณาติดต่อ${esc(cfg.contact)}</p>` : ''}`;
  }

  function vRegister() {
    if (!cfg.registration_open) return `<section class="slab"><h2>ปิดรับลงทะเบียนแล้ว</h2><p class="muted">ถ้าลงทะเบียนไว้แล้ว ดูข้อมูลได้ที่เมนู “ข้อมูลของฉัน”</p></section>`;
    return `<div class="twin">
      <section class="slab"><div><h2>ลงทะเบียนเข้าร่วม</h2><p class="muted">กรอกครั้งเดียว ระบบออก Beyond ID ให้ทันที แล้วกลับมาส่งสลิปหรือแก้ข้อมูลภายหลังได้</p></div>
        <form id="regForm">${personFields()}<div class="m-total" aria-live="polite"><span id="mNote" class="small muted">เลือกบัตรและที่พักเพื่อดูยอด</span><b id="mTotal">–</b></div><button class="btn main" type="submit" id="regBtn">ยืนยันการลงทะเบียน</button></form>
      </section>
      <aside class="slab bill" aria-label="สรุปยอดชำระ"><h3>ยอดที่ต้องชำระ</h3><div id="bill"></div></aside></div>`;
  }

  function renderBill() {
    const form = $('#regForm'), box = $('#bill');
    if (!form || !box) return;
    const t = form.ticket_type.value, s = form.stay_choice.value, round = after() ? 'General' : 'Early Bird';
    const tf = fee(t, round), sf = s === 'พัก' ? cfg.prices.stay : s ? 0 : null;
    const rows = t === 'เสาร์-อาทิตย์' ? (round === 'Early Bird' ? 'ราคา Early Bird' : 'ราคาหน้างาน') : t ? 'บัตรวันเดียว' : 'เลือกประเภทบัตร';
    const mt = $('#mTotal'); if (mt) { mt.textContent = tf == null || sf == null ? '–' : baht(tf + sf); $('#mNote').textContent = tf == null || sf == null ? 'เลือกบัตรและที่พักเพื่อดูยอด' : `บัตร ${baht(tf)}${sf ? ` + ที่พัก ${baht(sf)}` : ''} · จ่ายภายใน 15 พ.ย. 20:00 น.`; }
    box.innerHTML = `<div class="bill-row"><span>ค่าบัตร<br><small class="muted">${rows}</small></span><b class="num">${tf == null ? '–' : baht(tf)}</b></div>
      <div class="bill-row"><span>ที่พัก 1 คืน</span><b class="num">${sf == null ? '–' : baht(sf)}</b></div>
      <div class="bill-row total"><span>รวม</span><b class="num">${tf == null || sf == null ? '–' : baht(tf + sf)}</b></div>
      <p class="note">${after() ? `หมดเขต Early Bird แล้ว บัตรเสาร์-อาทิตย์ราคา ${baht(cfg.prices.weekend_general)}` : `ชำระค่าบัตรและค่าที่พักภายใน ${CUT_TEXT} หลังเวลานี้บัตรเสาร์-อาทิตย์เป็น ${baht(cfg.prices.weekend_general)} และปิดรับที่พัก`}</p>`;
  }

  /* ---------- my info ---------- */
  function vLookup() {
    return `<section class="slab"><div><h2>ข้อมูลของฉัน</h2><p class="muted">กรอกเบอร์โทรเพื่อเปิดข้อมูลทันที หรือกรอกชื่อเล่นแล้วยืนยันด้วยเบอร์โทร</p></div>
      <form id="findForm" class="row"><label class="grow" for="findQ">เบอร์โทร หรือ ชื่อเล่น<input id="findQ" required autocomplete="off"></label><button class="btn main" id="findBtn" style="align-self:end">ค้นหา</button></form>
      ${nickHits ? (nickHits.length ? `<div class="row">${nickHits.map(h => `<button class="btn" data-act="pick" data-id="${esc(h.beyond_id)}" aria-pressed="${nickPick === h.beyond_id}">${esc(h.nickname)} (${esc(h.upline)}) · ${esc(h.beyond_id)}</button>`).join('')}</div>` : `<p class="err">ไม่พบข้อมูล ตรวจสอบตัวสะกดหรือค้นหาด้วยเบอร์โทร</p>`) : ''}
      ${nickPick ? `<form id="verifyForm" class="row"><label class="grow" for="verifyPhone">ยืนยันเบอร์โทรของ ${esc(nickPick)}<input id="verifyPhone" required inputmode="tel"></label><button class="btn main" style="align-self:end">เปิดข้อมูล</button></form>` : ''}
    </section>`;
  }

  function payBlock(kind) {
    const isTicket = kind === 'Ticket';
    const st = isTicket ? me.ticket_status : me.stay_status, amount = isTicket ? me.ticket_fee : me.stay_fee;
    const acc = isTicket ? me.accounts.ticket : me.accounts.stay;
    const reason = isTicket ? me.ticket_reason : me.stay_reason;
    const open = st === 'Not Paid' || st === 'Rejected';
    const closed = !isTicket && after();
    const title = isTicket ? `ค่าบัตร · ${esc(me.ticket_type)}` : 'ค่าที่พัก';
    return `<section class="slab"><div class="row split"><h3>${title}</h3>${pill(st)}</div>
      <p class="num" style="font-size:1.5rem;font-weight:700">${baht(amount)}${isTicket ? ` <small class="muted" style="font-size:.85rem;font-weight:400">${me.price_round === 'Early Bird' ? 'Early Bird' : 'ราคาหน้างาน'}</small>` : ''}</p>
      ${st === 'Rejected' && reason ? `<p class="err">สลิปไม่ผ่าน: ${esc(reason)}</p>` : ''}
      ${st === 'Needs Review' ? `<p class="note">ยอดเปลี่ยนหลังจากส่งสลิปแล้ว ทีมงานจะตรวจและแจ้งส่วนต่าง</p>` : ''}
      ${open && !closed ? `<div class="acct"><div><span class="muted small">${acc.bank ? `ธนาคาร${esc(acc.bank)}` : 'พร้อมเพย์'} · ${esc(acc.name)}</span><b>${esc(acc.account || acc.promptpay)}</b></div><button class="btn" data-act="copy" data-v="${esc(acc.account || acc.promptpay)}" type="button">คัดลอก</button></div>
        ${isTicket && me.price_round === 'Early Bird' && me.ticket_type === 'เสาร์-อาทิตย์' ? `<p class="note">ส่งสลิปภายใน ${CUT_TEXT} เพื่อรับราคา Early Bird</p>` : ''}
        ${!isTicket ? `<p class="note">ส่งสลิปภายใน ${CUT_TEXT}</p>` : ''}
        <form class="slipForm" data-type="${kind}"><label for="slip${kind}">แนบสลิปโอนเงิน (รูป หรือ PDF ไม่เกิน 8 MB)<input id="slip${kind}" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label><button class="btn main">ส่งสลิป</button></form>` : ''}
      ${open && closed ? `<p class="err">ปิดรับสลิปที่พักแล้ว กรุณาติดต่อ${esc(cfg.contact)}</p>` : ''}
      ${st === 'Waiting Verify' ? `<p class="muted">ได้รับสลิปแล้ว รอทีมงานตรวจสอบ</p>` : ''}
    </section>`;
  }

  function vMe() {
    const h = me.hotel || {}, m = me.meal, r = me.refund;
    return `<section class="slab"><div class="row split"><div><p class="muted">สวัสดี ${esc(me.nickname)}</p><div class="bigid">${esc(me.beyond_id)}</div></div>
        <div class="row"><button class="btn" data-act="editMe">แก้ไขข้อมูลลงทะเบียน</button><button class="btn" data-act="leave">ออก</button></div></div>
        ${me.registration_status === 'Inactive' ? `<p class="err">รายการนี้ถูกปิดใช้งาน กรุณาติดต่อ${esc(cfg.contact)}</p>` : ''}
        <dl><dt>ชื่อ</dt><dd>${esc(me.full_name)}</dd><dt>อัพไลน์</dt><dd>${esc(me.upline)}</dd><dt>สายงาน</dt><dd>${esc(me.workstream)}</dd><dt>เบอร์โทร</dt><dd class="num">${esc(me.phone)}</dd></dl></section>
      <div class="even">${payBlock('Ticket')}${me.stay_choice === 'พัก' ? payBlock('Accommodation') : `<section class="slab"><h3>ที่พัก</h3><p class="muted">ไม่ได้เลือกที่พัก</p></section>`}</div>
      ${me.stay_choice === 'พัก' ? `<section class="slab"><h3>ที่พักและรูมเมท</h3>
        ${h.name ? `<p><b>${esc(h.name)}</b>${h.map_url ? ` · <a href="${esc(h.map_url)}" target="_blank" rel="noopener">เปิดแผนที่</a>` : ''}</p>${h.note ? `<p class="muted">${esc(h.note)}</p>` : ''}` : `<p class="muted">ทีมงานจะแจ้งชื่อที่พักที่หน้านี้</p>`}
        ${me.room ? `<dl><dt>ห้อง</dt><dd class="num">${esc(me.room)}</dd><dt>รูมเมท</dt><dd>${me.roommates.length ? me.roommates.map(esc).join('<br>') : '–'}</dd></dl>` : `<p class="muted">ยังไม่ได้จัดห้อง</p>`}</section>` : ''}
      ${m ? `<section class="slab"><div class="row split"><h3>จองอาหาร · ${esc(m.round_name)}</h3>${m.order ? pill(m.order.status) : ''}</div>
        <p><b>${esc(m.menu_name)}</b> · <span class="num">${baht(m.price)}</span></p>${m.note ? `<p class="muted">${esc(m.note)}</p>` : ''}
        ${m.order?.reject_reason ? `<p class="err">สลิปไม่ผ่าน: ${esc(m.order.reject_reason)}</p>` : ''}
        ${!m.order || m.order.status === 'Rejected' ? `<div class="acct"><div><span class="muted small">พร้อมเพย์ · ${esc(m.payee_name)}</span><b>${esc(m.promptpay)}</b></div><button class="btn" data-act="copy" data-v="${esc(m.promptpay)}" type="button">คัดลอก</button></div>
        <form class="slipForm" data-type="Meal"><label for="slipMeal">แนบสลิปค่าอาหาร<input id="slipMeal" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label><button class="btn main">จองและส่งสลิป</button></form>` : ''}</section>` : ''}
      ${r ? `<section class="slab"><div class="row split"><h3>รับเงินคืน ${baht(r.amount)}</h3>${r.completed ? pill('Refunded') : ''}</div>
        ${r.completed ? '<p class="muted">ทีมงานคืนเงินเรียบร้อยแล้ว</p>' : `<form id="refundForm"><div class="fields">
          <label class="all" for="r_method">วิธีรับเงิน<select id="r_method" name="method" required>${options([['PromptPay', 'พร้อมเพย์'], ['Bank', 'บัญชีธนาคาร']], r.method, 'เลือก')}</select></label>
          <label class="all" data-m="PromptPay" for="r_pp">หมายเลขพร้อมเพย์<input id="r_pp" name="promptpay" inputmode="numeric" value="${esc(r.promptpay)}"></label>
          <label data-m="Bank" for="r_bank">ชื่อธนาคาร<input id="r_bank" name="bank_name" value="${esc(r.bank_name)}"></label>
          <label data-m="Bank" for="r_acc">เลขบัญชี<input id="r_acc" name="bank_account" inputmode="numeric" value="${esc(r.bank_account)}"></label>
        </div><button class="btn main">บันทึกข้อมูลรับเงินคืน</button></form>`}</section>` : ''}`;
  }

  function syncRefund() {
    const f = $('#refundForm'); if (!f) return;
    const m = f.method.value;
    f.querySelectorAll('[data-m]').forEach(l => { l.hidden = l.dataset.m !== m; });
  }

  async function sha256(file) {
    const d = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function sendSlip(form) {
    const file = form.querySelector('input[type=file]').files[0], type = form.dataset.type;
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 8 MB'); return; }
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) { toast('รองรับเฉพาะรูป JPG PNG WEBP หรือ PDF'); return; }
    const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1];
    await busy(form.querySelector('button'), async () => {
      const hash = await sha256(file);
      const path = `${me.id}/${type}-${crypto.randomUUID()}.${ext}`;
      await api.upload(path, file);
      me = await api.rpc('submit_slip', { p_id: me.id, p_token: me.token, p_type: type, p_path: path, p_hash: hash });
      toast('ส่งสลิปแล้ว รอทีมงานตรวจสอบ');
      render();
    });
  }

  function setMe(m) { me = m; nickHits = null; nickPick = null; store.set(m ? { id: m.id, token: m.token } : null); }

  /* ---------- admin ---------- */
  const fp = () => A.data.participants.filter(p => p.registration_status === 'Active');
  const byId = id => A.data.participants.find(p => p.id === id);
  const ADMIN_VIEWS = [['overview', 'ภาพรวม'], ['people', 'ผู้เข้าร่วม'], ['slips', 'สลิป / การเงิน'], ['rooms', 'จัดห้องพัก'], ['meals', 'อาหาร'], ['checkin', 'Check-in'], ['refunds', 'คืนเงิน'], ['settings', 'ตั้งค่า']];

  function vLogin() {
    return `<section class="slab" style="max-width:460px;margin:0 auto"><div><h2>Admin</h2><p class="muted">สำหรับทีมงาน Beyond29</p></div>
      <form id="loginForm"><label for="a_email">อีเมล<input id="a_email" type="email" name="email" autocomplete="username" required></label>
      <label for="a_pw">รหัสผ่าน<input id="a_pw" type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn main">เข้าสู่ระบบ</button></form><button class="btn" data-act="forgot">ลืมรหัสผ่าน</button></section>`;
  }

  const sum = (arr, f) => arr.reduce((a, p) => a + f(p), 0);
  function money(arr, fee, st) {
    const list = arr.filter(p => p[st] !== '-' && p[st] !== 'Refunded');
    const paid = sum(list.filter(p => p[st] === 'Paid'), p => p[fee]), total = sum(list, p => p[fee]);
    return { paid, total, due: total - paid };
  }
  const tile = (l, v, c = '', go = '') => go ? `<button class="tile ${c}" data-act="go" data-go="${esc(go)}"><span>${l}</span><b>${v}</b></button>` : `<div class="tile ${c}"><span>${l}</span><b>${v}</b></div>`;

  function vOverview() {
    const a = fp(), cnt = (k, v) => a.filter(p => p[k] === v).length;
    const stay = a.filter(p => p.stay_choice === 'พัก');
    const mt = money(a, 'ticket_fee', 'ticket_status'), ms = money(a, 'stay_fee', 'stay_status');
    const row = (title, k, list) => `<h3>${title}</h3><div class="tiles">
      ${tile('ทั้งหมด', list.length + ' คน')}
      ${tile('ยังไม่จ่าย', list.filter(p => p[k] === 'Not Paid').length + ' คน', 'bad', `${k}|Not Paid`)}
      ${tile('รอตรวจสลิป', list.filter(p => p[k] === 'Waiting Verify').length + ' คน', 'warn', `${k}|Waiting Verify`)}
      ${tile('ต้องตรวจยอด', list.filter(p => p[k] === 'Needs Review').length + ' คน', 'warn', `${k}|Needs Review`)}
      ${tile('จ่ายแล้ว', list.filter(p => p[k] === 'Paid').length + ' คน', 'ok', `${k}|Paid`)}</div>`;
    const m3 = (t, m) => `<h3>${t}</h3><div class="tiles">${tile('ยอดค้างจ่าย', baht(m.due), 'bad')}${tile('ยอดชำระแล้ว', baht(m.paid), 'ok')}${tile('ยอดรวมทั้งหมด', baht(m.total))}</div>`;
    return `<section class="slab"><h3>จำนวนผู้เข้าร่วม (Active)</h3><div class="tiles">
        ${tile('ทั้งหมด', a.length + ' คน')}${tile('เสาร์-อาทิตย์', cnt('ticket_type', 'เสาร์-อาทิตย์') + ' คน')}${tile('เสาร์', cnt('ticket_type', 'เสาร์') + ' คน')}${tile('อาทิตย์', cnt('ticket_type', 'อาทิตย์') + ' คน')}${tile('เข้าพัก', stay.length + ' คน')}</div></section>
      <div class="even"><section class="slab">${m3('การเงิน ค่าบัตร · บัญชีรุ่งทิพย์', mt)}</section><section class="slab">${m3('การเงิน ค่าที่พัก · บัญชีอนุวัฒน์', ms)}</section></div>
      <section class="slab">${row('สถานะค่าบัตร', 'ticket_status', a)}${row('สถานะค่าที่พัก', 'stay_status', stay)}</section>
      <section class="slab"><h3>สรุปตามสายงาน</h3>${table(['สายงาน', 'คน', 'จ่ายบัตรแล้ว', 'ค้างบัตร', 'พัก', 'จ่ายที่พักแล้ว'], WS.map(w => { const l = a.filter(p => p.workstream === w), s = l.filter(p => p.stay_choice === 'พัก'), pd = l.filter(p => p.ticket_status === 'Paid').length; return [esc(w), l.length, pd, l.length - pd, s.length, s.filter(p => p.stay_status === 'Paid').length]; }))}</section>`;
  }

  function table(cols, rows, empty = 'ไม่มีข้อมูล') {
    if (!rows.length) return `<p class="empty">${empty}</p>`;
    return `<div class="tablebox"><table class="cards"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((v, i) => `<td data-label="${esc(cols[i])}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  const fsel = (k, label, list) => `<label for="fl_${k}">${label}<select id="fl_${k}" data-filter="${k}">${options(list, A.f[k] || '', 'ทั้งหมด')}</select></label>`;

  function peopleRows() {
    const q = (A.f.q || '').toLowerCase(), f = A.f;
    return A.data.participants.filter(p =>
      (!q || `${p.full_name} ${p.nickname} ${p.upline} ${p.phone} ${p.beyond_id}`.toLowerCase().includes(q)) &&
      (!f.workstream || p.workstream === f.workstream) && (!f.ticket_type || p.ticket_type === f.ticket_type) &&
      (!f.stay_choice || p.stay_choice === f.stay_choice) && (!f.price_round || p.price_round === f.price_round) &&
      (!f.ticket_status || p.ticket_status === f.ticket_status) && (!f.stay_status || p.stay_status === f.stay_status) &&
      (!f.gender || p.gender === f.gender) && (!f.reg ? p.registration_status !== 'Test' || f.reg === 'Test' : p.registration_status === f.reg));
  }

  function vPeople() {
    const rows = peopleRows();
    return `<section class="slab"><div class="row split"><h3>ผู้เข้าร่วม ${rows.length} คน</h3><button class="btn" data-act="csv">ดาวน์โหลด CSV</button></div>
      <label for="fl_q">ค้นหา<input id="fl_q" data-filter="q" value="${esc(A.f.q || '')}" placeholder="ชื่อ ชื่อเล่น อัพไลน์ เบอร์ หรือ Beyond ID"></label>
      <div class="filters">${fsel('workstream', 'สายงาน', WS)}${fsel('ticket_type', 'วันที่มา', TICKETS)}${fsel('stay_choice', 'ที่พัก', ['พัก', 'ไม่พัก'])}${fsel('price_round', 'รอบราคา', [['Early Bird', 'Early Bird'], ['General', 'หน้างาน']])}${fsel('ticket_status', 'สถานะค่าบัตร', STATUS.map(s => [s, LABEL[s]]))}${fsel('stay_status', 'สถานะที่พัก', STATUS.map(s => [s, LABEL[s]]))}${fsel('reg', 'สถานะคน', ['Active', 'Inactive', 'Test'])}</div>
      ${table(['ID', 'ชื่อ', 'สาย', 'บัตร', 'ค่าบัตร', 'ที่พัก', 'สถานะ', 'จัดการ'], rows.map(p => [esc(p.beyond_id), `<b>${esc(p.nickname)}</b> (${esc(p.upline)})<br><span class="muted small">${esc(p.full_name)} · ${esc(p.phone)}</span>`, esc(p.workstream), `${esc(p.ticket_type)}<br><span class="muted small">${p.price_round === 'General' ? 'หน้างาน' : 'Early Bird'}</span>`, `${baht(p.ticket_fee)}<br>${pill(p.ticket_status)}`, p.stay_choice === 'พัก' ? `${baht(p.stay_fee)}<br>${pill(p.stay_status)}` : '<span class="muted">ไม่พัก</span>', pill(p.registration_status), `<div class="row"><button class="btn" data-act="adminEdit" data-id="${p.id}">แก้ไข</button><button class="btn ${p.registration_status === 'Active' ? 'bad' : 'ok'}" data-act="toggleActive" data-id="${p.id}">${p.registration_status === 'Active' ? 'Inactivate' : 'Activate'}</button></div>`]))}</section>`;
  }

  function csv() {
    const rows = peopleRows();
    const head = ['Beyond ID', 'ชื่อ-นามสกุล', 'ชื่อเล่น', 'อัพไลน์', 'สายงาน', 'เบอร์โทร', 'เพศ', 'ประเภทบัตร', 'รอบราคา', 'ค่าบัตร', 'สถานะค่าบัตร', 'ที่พัก', 'ค่าที่พัก', 'สถานะที่พัก', 'ห้อง', 'สถานะคน', 'Check-in'];
    const cell = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const body = rows.map(p => [p.beyond_id, p.full_name, p.nickname, p.upline, p.workstream, p.phone, p.gender, p.ticket_type, p.price_round, p.ticket_fee, p.ticket_status, p.stay_choice, p.stay_fee, p.stay_status, p.room, p.registration_status, p.checkin ? 'Yes' : ''].map(cell).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Beyond29_participants_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a); a.click(); a.remove();
  }

  function vSlips() {
    const f = A.f, rows = A.data.payments.filter(x => {
      const p = byId(x.participant_id);
      return p && (!f.pay_status || x.status === f.pay_status) && (!f.pay_type || x.payment_type === f.pay_type) && (!f.workstream || p.workstream === f.workstream) && p.registration_status !== 'Test';
    });
    return `<section class="slab"><h3>สลิปทั้งหมด ${rows.length} รายการ</h3>
      <div class="filters">${fsel('pay_status', 'สถานะ', ['Waiting Verify', 'Paid', 'Rejected', 'Needs Review', 'Refunded'].map(s => [s, LABEL[s]]))}${fsel('pay_type', 'ประเภท', [['Ticket', 'ค่าบัตร'], ['Accommodation', 'ค่าที่พัก']])}${fsel('workstream', 'สายงาน', WS)}</div>
      ${table(['เวลา', 'ผู้จ่าย', 'รายการ', 'ยอดที่ต้องตรงกับสลิป', 'สถานะ', 'จัดการ'], rows.map(x => { const p = byId(x.participant_id); return [new Date(x.uploaded_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }), `<b>${esc(p.nickname)}</b> (${esc(p.upline)})<br><span class="muted small">${esc(p.beyond_id)} · ${esc(p.workstream)}</span>`, x.payment_type === 'Ticket' ? `บัตร ${esc(p.ticket_type)}` : 'ที่พัก', baht(x.expected_amount), `${pill(x.status)}${x.reject_reason ? `<br><span class="muted small">${esc(x.reject_reason)}</span>` : ''}`, `<div class="row"><button class="btn" data-act="slip" data-path="${esc(x.slip_path)}">ดูสลิป</button><button class="btn ok" data-act="review" data-id="${x.id}" data-s="Paid">ผ่าน</button><button class="btn bad" data-act="reject" data-id="${x.id}">ไม่ผ่าน</button></div>`]; }), 'ยังไม่มีสลิป')}</section>`;
  }

  function vRooms() {
    const f = A.f, h = A.data.settings.hotel || {};
    const rows = A.data.participants.filter(p => p.registration_status === 'Active' && p.stay_choice === 'พัก' && p.stay_status === 'Paid' && (!f.workstream || p.workstream === f.workstream) && (!f.gender || p.gender === f.gender)).sort((a, b) => (a.room || 'zzz').localeCompare(b.room || 'zzz', 'th', { numeric: true }));
    return `<section class="slab"><h3>ข้อมูลที่พัก (ทุกคนเห็นในหน้าข้อมูลของฉัน)</h3><form id="hotelForm"><div class="fields">
        <label for="h_name">ชื่อที่พัก<input id="h_name" name="name" value="${esc(h.name)}"></label><label for="h_map">ลิงก์แผนที่<input id="h_map" name="map_url" type="url" value="${esc(h.map_url)}"></label>
        <label class="all" for="h_note">หมายเหตุ<input id="h_note" name="note" value="${esc(h.note)}"></label></div><button class="btn">บันทึกข้อมูลที่พัก</button></form></section>
      <section class="slab"><h3>ใส่เลขห้อง (เฉพาะคนที่จ่ายค่าที่พักแล้ว) ${rows.length} คน</h3><div class="filters">${fsel('workstream', 'สายงาน', WS)}${fsel('gender', 'เพศ', ['ชาย', 'หญิง'])}</div>
      ${table(['ชื่อ', 'เพศ', 'สาย', 'เลขห้อง'], rows.map(p => [`<b>${esc(p.nickname)}</b> (${esc(p.upline)})`, esc(p.gender), esc(p.workstream), `<input aria-label="เลขห้องของ ${esc(p.nickname)}" data-room="${p.id}" value="${esc(p.room)}">`]))}</section>`;
  }

  function vMeals() {
    const open = A.data.meal_rounds.find(r => r.status === 'Open');
    return `<section class="slab"><h3>${open ? `เปิดจองอยู่: ${esc(open.round_name)} · ${esc(open.menu_name)}` : 'เปิดรอบจองอาหาร'}</h3>
      ${open ? `<button class="btn bad" data-act="closeMeal" data-id="${open.id}">ปิดรอบนี้</button>` : `<form id="mealForm"><div class="fields">
        <label for="m_round">ชื่อรอบ<input id="m_round" name="round_name" required placeholder="กลางวันวันเสาร์"></label><label for="m_menu">เมนู<input id="m_menu" name="menu_name" required></label>
        <label for="m_price">ราคา (บาท)<input id="m_price" name="price" type="number" min="0" required></label><label for="m_pp">เบอร์พร้อมเพย์<input id="m_pp" name="promptpay" inputmode="numeric" required></label>
        <label for="m_payee">ชื่อบัญชี<input id="m_payee" name="payee_name"></label><label for="m_note">หมายเหตุ<input id="m_note" name="note"></label></div><button class="btn main">เปิดจอง</button></form>`}</section>
      <section class="slab"><h3>รายการจอง</h3>${table(['รอบ', 'ผู้จอง', 'สถานะ', 'จัดการ'], A.data.meal_orders.map(o => { const p = byId(o.participant_id), r = A.data.meal_rounds.find(x => x.id === o.round_id); return [esc(r?.round_name), p ? `${esc(p.nickname)} (${esc(p.upline)})` : '', pill(o.status), `<div class="row"><button class="btn" data-act="slip" data-path="${esc(o.slip_path)}">ดูสลิป</button><button class="btn ok" data-act="reviewMeal" data-id="${o.id}" data-s="Paid">ผ่าน</button><button class="btn bad" data-act="reviewMeal" data-id="${o.id}" data-s="Rejected">ไม่ผ่าน</button></div>`]; }), 'ยังไม่มีรายการจอง')}</section>`;
  }

  function vCheckin() {
    const q = (A.f.cq || '').toLowerCase(), a = fp(), rows = a.filter(p => !q || `${p.nickname} ${p.full_name} ${p.phone} ${p.beyond_id}`.toLowerCase().includes(q));
    return `<section class="slab"><h3>Check-in ${a.filter(p => p.checkin).length} / ${a.length} คน</h3><label for="fl_cq">ค้นหา<input id="fl_cq" data-filter="cq" value="${esc(A.f.cq || '')}" placeholder="ชื่อเล่น เบอร์ หรือ Beyond ID"></label>
      ${table(['ID', 'ชื่อ', 'บัตร', 'ค่าบัตร', 'Check-in'], rows.map(p => [esc(p.beyond_id), `<b>${esc(p.nickname)}</b> (${esc(p.upline)})`, esc(p.ticket_type), pill(p.ticket_status), `<button class="btn ${p.checkin ? 'ok' : ''}" data-act="checkin" data-id="${p.id}">${p.checkin ? 'เข้างานแล้ว' : 'Check-in'}</button>`]))}</section>`;
  }

  function vRefunds() {
    const list = A.data.participants.filter(p => p.registration_status !== 'Test').map(p => ({ p, r: A.data.refunds.find(x => x.participant_id === p.id) })).filter(x => x.r && x.r.amount > 0);
    const stat = r => r.completed ? 'คืนเงินแล้ว' : r.method ? 'รอคืนเงิน' : 'รอข้อมูล';
    const f = A.f.refund_status, rows = list.filter(x => !f || stat(x.r) === f);
    return `<section class="slab"><h3>กำหนดยอดคืนเงิน</h3><form id="refundSet" class="row"><label class="grow" for="rf_id">Beyond ID<input id="rf_id" name="id" required placeholder="B29-001"></label><label for="rf_amt">ยอดคืน (บาท)<input id="rf_amt" name="amount" type="number" min="0" required></label><button class="btn" style="align-self:end">บันทึก</button></form></section>
      <section class="slab"><h3>รายการคืนเงิน ${list.length} คน · รวม ${baht(sum(list, x => x.r.amount))}</h3><div class="filters">${fsel('refund_status', 'สถานะ', ['รอข้อมูล', 'รอคืนเงิน', 'คืนเงินแล้ว'])}</div>
      ${table(['ID', 'ชื่อจริง', 'ห้อง', 'วิธีรับเงิน', 'พร้อมเพย์ / บัญชี', 'ยอด', 'สถานะ', 'จัดการ'], rows.map(({ p, r }) => [esc(p.beyond_id), `<b>${esc(p.full_name)}</b><br><span class="muted small">${esc(p.nickname)}</span>`, esc(p.room || '-'), esc(r.method || '-'), esc(r.method === 'Bank' ? `${r.bank_name} ${r.bank_account}` : r.promptpay || '-'), baht(r.amount), esc(stat(r)), `<button class="btn" data-act="refundDone" data-id="${p.id}" data-amt="${r.amount}" data-v="${!r.completed}">${r.completed ? 'ยกเลิกสถานะ' : 'คืนเงินแล้ว'}</button>`]))}</section>`;
  }

  function vSettings() {
    const s = A.data.settings, open = s.registration_open === true;
    return `<section class="slab"><div class="row split"><div><h3>รับลงทะเบียน</h3><p class="muted">สถานะตอนนี้: ${open ? 'เปิดรับ' : 'ปิดรับ'}</p></div><button class="btn ${open ? 'bad' : 'ok'}" data-act="toggleReg">${open ? 'ปิดรับลงทะเบียน' : 'เปิดรับลงทะเบียน'}</button></div></section>
      <section class="slab"><div class="row split"><div><h3>ข้อมูลทดสอบ</h3><p class="muted">ตั้งสถานะคนเป็น Test แล้วล้างทีเดียวก่อนเปิดจริง ไม่กระทบคนจริง</p></div><button class="btn bad" data-act="clearTest">ล้างข้อมูล Test ${A.data.participants.filter(p => p.registration_status === 'Test').length} คน</button></div></section>
      <section class="slab"><h3>ประวัติการแก้ไขของทีมงาน</h3>${table(['เวลา', 'ผู้ทำ', 'รายการ', 'ผู้เกี่ยวข้อง'], A.data.logs.slice(0, 50).map(l => [new Date(l.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }), esc(l.admin_email), esc(l.action), esc(byId(l.participant_id)?.beyond_id || '')]))}</section>`;
  }

  function vAdmin() {
    if (!A.signed) return vLogin();
    if (!A.data) return `<section class="slab"><p class="empty">กำลังโหลด…</p></section>`;
    const body = { overview: vOverview, people: vPeople, slips: vSlips, rooms: vRooms, meals: vMeals, checkin: vCheckin, refunds: vRefunds, settings: vSettings }[A.view]();
    return `<div class="row split"><h2>Admin</h2><div class="row"><button class="btn" data-act="reload">รีเฟรช</button><button class="btn" data-act="logout">ออกจากระบบ</button></div></div>
      <div class="subtabs" role="tablist">${ADMIN_VIEWS.map(([k, l]) => `<button class="btn" role="tab" aria-selected="${A.view === k}" data-act="aview" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
  }

  async function loadAdmin() {
    try { A.data = await api.rpc('admin_data'); } catch (e) { toast(niceErr(e)); A.signed = false; A.data = null; if (api.logout) await api.logout(); }
    render();
  }

  async function adminCall(btn, name, args, msg) {
    await busy(btn, async () => { await api.rpc(name, args); if (msg) toast(msg); await loadAdmin(); });
  }

  function confirmDlg(text, fn) {
    dlg.innerHTML = `<div class="view"><h3>${esc(text)}</h3><div class="row"><button class="btn bad" id="dlgYes">ยืนยัน</button><button class="btn" data-act="close">ยกเลิก</button></div></div>`;
    dlg.showModal(); $('#dlgYes').onclick = async () => { dlg.close(); await fn(); };
  }

  function editDialog(p, admin) {
    dlg.innerHTML = `<form id="editForm" class="view"><h3>แก้ไขข้อมูล ${esc(p.beyond_id)}</h3>${personFields(p, admin)}
      ${admin ? `<div class="fields"><label for="e_round">รอบราคา<select id="e_round" name="price_round">${options([['Early Bird', 'Early Bird'], ['General', 'หน้างาน']], p.price_round)}</select></label>
      <label for="e_reg">สถานะคน<select id="e_reg" name="registration_status">${options(['Active', 'Inactive', 'Test'], p.registration_status)}</select></label>
      <label for="e_ts">สถานะค่าบัตร<select id="e_ts" name="ticket_status">${options(STATUS.map(s => [s, LABEL[s]]), p.ticket_status)}</select></label>
      <label for="e_ss">สถานะค่าที่พัก<select id="e_ss" name="stay_status">${options([['-', 'ไม่พัก'], ...STATUS.map(s => [s, LABEL[s]])], p.stay_status)}</select></label>
      <label class="all" for="e_note">โน้ตทีมงาน<textarea id="e_note" name="admin_note" rows="2">${esc(p.admin_note)}</textarea></label></div>` : `<p class="note">ถ้าเปลี่ยนบัตรหรือที่พักหลังส่งสลิปแล้ว ทีมงานจะตรวจยอดใหม่อีกครั้ง</p>`}
      <div class="row"><button class="btn main">บันทึก</button><button class="btn" type="button" data-act="close">ยกเลิก</button></div></form>`;
    dlg.showModal();
    $('#editForm').onsubmit = async ev => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(ev.target));
      await busy(ev.submitter, async () => {
        if (admin) { await api.rpc('admin_update_participant', { p_id: p.id, p: data }); dlg.close(); toast('บันทึกแล้ว'); await loadAdmin(); }
        else { const m = await api.rpc('update_me', { p_id: me.id, p_token: me.token, p: data }); setMe(m); dlg.close(); toast('บันทึกแล้ว'); render(); }
      });
    };
  }

  /* ---------- shell ---------- */
  function render() {
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
    if (!cfg) return;
    const html = tab === 'register' ? vRegister() : tab === 'me' ? (me ? vMe() : vLookup()) : vAdmin();
    const y = scrollY;
    main.innerHTML = `<div class="view">${html}</div>`;
    scrollTo({ top: y, behavior: 'instant' });
    renderBill(); syncRefund();
  }

  function go(t) { tab = t; try { location.hash = t; } catch { /* optional */ } render(); if (t === 'admin' && A.signed && !A.data) loadAdmin(); }

  document.addEventListener('click', async ev => {
    const tabBtn = ev.target.closest('.tab');
    if (tabBtn) { go(tabBtn.dataset.tab); return; }
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (b.tagName === 'BUTTON' && act !== 'copy') ev.preventDefault();
    const acts = {
      close: () => dlg.close(),
      copy: async () => { try { await navigator.clipboard.writeText(b.dataset.v); toast('คัดลอกเลขบัญชีแล้ว'); } catch { toast(b.dataset.v); } },
      pick: () => { nickPick = id; render(); },
      leave: () => { setMe(null); render(); },
      editMe: () => editDialog(me, false),
      forgot: () => { const e = $('#a_email').value; if (!e) { toast('กรอกอีเมลก่อน'); return; } busy(b, async () => { await api.forgot(e); toast('ส่งลิงก์เปลี่ยนรหัสผ่านไปที่อีเมลแล้ว'); }); },
      logout: async () => { await api.logout(); A.signed = false; A.data = null; render(); },
      reload: () => loadAdmin(),
      aview: () => { A.view = b.dataset.v; render(); },
      go: () => { const [k, v] = b.dataset.go.split('|'); A.f = { [k]: v }; A.view = 'people'; render(); },
      csv: () => csv(),
      adminEdit: () => editDialog(byId(id), true),
      toggleActive: () => { const p = byId(id), on = p.registration_status === 'Active'; const run = () => adminCall(null, 'admin_update_participant', { p_id: id, p: { registration_status: on ? 'Inactive' : 'Active' } }, on ? 'Inactivate แล้ว' : 'Activate แล้ว'); on ? confirmDlg(`Inactivate ${p.nickname}? ข้อมูลยังอยู่ และเปิดกลับได้`, run) : run(); },
      slip: () => busy(b, async () => { const url = await api.slipUrl(b.dataset.path); dlg.innerHTML = `<div class="view">${/\.pdf$/.test(b.dataset.path) ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">เปิดไฟล์ PDF</a>` : `<img src="${esc(url)}" alt="สลิปโอนเงิน">`}<button class="btn" data-act="close">ปิด</button></div>`; dlg.showModal(); }),
      review: () => adminCall(b, 'admin_review_payment', { p_id: id, p_status: b.dataset.s, p_reason: null }, 'บันทึกผลตรวจแล้ว'),
      reject: () => { dlg.innerHTML = `<form id="rejForm" class="view"><h3>สลิปไม่ผ่าน</h3><label for="rej">เหตุผลที่ผู้ลงทะเบียนจะเห็น<input id="rej" required placeholder="เช่น ยอดไม่ตรง หรือชื่อบัญชีผิด"></label><div class="row"><button class="btn bad">บันทึก</button><button class="btn" type="button" data-act="close">ยกเลิก</button></div></form>`; dlg.showModal(); $('#rejForm').onsubmit = ev2 => { ev2.preventDefault(); dlg.close(); adminCall(null, 'admin_review_payment', { p_id: id, p_status: 'Rejected', p_reason: $('#rej').value }, 'บันทึกผลตรวจแล้ว'); }; },
      closeMeal: () => adminCall(b, 'admin_close_meal', { p_id: id }, 'ปิดรอบแล้ว'),
      reviewMeal: () => adminCall(b, 'admin_review_meal', { p_id: id, p_status: b.dataset.s, p_reason: null }, 'บันทึกแล้ว'),
      checkin: () => adminCall(b, 'admin_update_participant', { p_id: id, p: { checkin: !byId(id).checkin } }),
      refundDone: () => adminCall(b, 'admin_set_refund', { p_id: id, p_amount: Number(b.dataset.amt), p_completed: b.dataset.v === 'true' }, 'บันทึกแล้ว'),
      toggleReg: () => adminCall(b, 'admin_set_setting', { p_key: 'registration_open', p_value: !(A.data.settings.registration_open === true) }, 'บันทึกแล้ว'),
      clearTest: () => confirmDlg('ลบข้อมูล Test ทั้งหมดถาวร?', () => adminCall(null, 'admin_clear_test', {}, 'ล้างแล้ว'))
    };
    if (acts[act]) await acts[act]();
  });

  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.closest('#regForm')) renderBill();
    if (t.id === 'r_method') syncRefund();
    if (t.dataset.room) adminCall(null, 'admin_update_participant', { p_id: t.dataset.room, p: { room: t.value } }, 'บันทึกเลขห้องแล้ว');
    if (t.dataset.filter && t.tagName === 'SELECT') { A.f[t.dataset.filter] = t.value; render(); }
  });
  document.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.filter && t.tagName === 'INPUT') { A.f[t.dataset.filter] = t.value; const id = t.id, pos = t.selectionStart; render(); const n = document.getElementById(id); n.focus(); n.setSelectionRange(pos, pos); }
  });

  document.addEventListener('submit', async ev => {
    const f = ev.target;
    if (f.id === 'editForm' || f.id === 'rejForm') return;
    ev.preventDefault();
    const btn = ev.submitter, data = Object.fromEntries(new FormData(f));
    if (f.id === 'regForm') {
      await busy(btn, async () => { setMe(await api.rpc('register', { p: data })); tab = 'me'; try { location.hash = 'me'; } catch { /* optional */ } render(); scrollTo({ top: $('.tabs').offsetTop - 8 }); window.bubbleBurst(); toast(`ลงทะเบียนสำเร็จ Beyond ID ${me.beyond_id}`); });
    } else if (f.id === 'findForm') {
      const q = $('#findQ').value.trim();
      await busy(btn, async () => {
        nickPick = null;
        if (/^[0-9\s-]{6,}$/.test(q)) { const m = await api.rpc('find_by_phone', { p_phone: q }); if (m) setMe(m); else { nickHits = []; } }
        else nickHits = await api.rpc('search_nickname', { p_q: q });
        render();
      });
    } else if (f.id === 'verifyForm') {
      await busy(btn, async () => { setMe(await api.rpc('verify_nickname', { p_beyond_id: nickPick, p_phone: $('#verifyPhone').value })); render(); });
    } else if (f.classList.contains('slipForm')) {
      await sendSlip(f);
    } else if (f.id === 'refundForm') {
      await busy(btn, async () => { me = await api.rpc('save_refund', { p_id: me.id, p_token: me.token, p: data }); toast('บันทึกข้อมูลรับเงินคืนแล้ว'); render(); });
    } else if (f.id === 'loginForm') {
      await busy(btn, async () => { await api.login(data.email, data.password); A.signed = true; await loadAdmin(); });
    } else if (f.id === 'hotelForm') {
      adminCall(btn, 'admin_set_setting', { p_key: 'hotel', p_value: data }, 'บันทึกข้อมูลที่พักแล้ว');
    } else if (f.id === 'mealForm') {
      adminCall(btn, 'admin_open_meal', { p: data }, 'เปิดจองแล้ว');
    } else if (f.id === 'refundSet') {
      const p = A.data.participants.find(x => x.beyond_id === data.id.trim().toUpperCase());
      if (!p) { toast('ไม่พบ Beyond ID นี้'); return; }
      adminCall(btn, 'admin_set_refund', { p_id: p.id, p_amount: Number(data.amount), p_completed: false }, 'บันทึกยอดคืนแล้ว');
    }
  });

  document.addEventListener('focusin', e => { if (e.target.matches('input:not([type=file]),textarea')) document.body.classList.add('typing'); });
  document.addEventListener('focusout', () => document.body.classList.remove('typing'));

  async function boot() {
    const h = location.hash.slice(1);
    if (['register', 'me', 'admin'].includes(h)) tab = h;
    render();
    try {
      api = await makeApi();
      cfg = await api.rpc('public_config');
      offset = new Date(cfg.server_now).getTime() - Date.now();
    } catch (e) {
      main.innerHTML = `<section class="slab"><p class="err">เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง</p></section>`;
      return;
    }
    if (api.onRecovery) api.onRecovery(() => {
      dlg.innerHTML = `<form id="pwForm" class="view"><h3>ตั้งรหัสผ่านใหม่</h3><label for="npw">รหัสผ่านใหม่<input id="npw" type="password" minlength="8" required></label><button class="btn main">บันทึก</button></form>`;
      dlg.showModal();
      $('#pwForm').onsubmit = async e => { e.preventDefault(); await busy(e.submitter, async () => { await api.setPassword($('#npw').value); dlg.close(); toast('เปลี่ยนรหัสผ่านแล้ว'); }); };
    });
    A.signed = await api.session();
    const saved = store.get();
    if (saved) { try { me = await api.rpc('get_me', { p_id: saved.id, p_token: saved.token }); } catch { store.set(null); } }
    render();
    if (tab === 'admin' && A.signed) loadAdmin();
    tickClock(); setInterval(tickClock, 1000);
  }
  boot();
})();

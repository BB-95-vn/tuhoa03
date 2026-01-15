/* =====================================================
   ADD-ON: CAN TABLE + POPUP
   - Không sửa logic app.js
   - Thay nội dung #stats bằng bảng tứ hóa theo 2 can:
     Can năm + Can tiết khí
   ===================================================== */

(function () {
  function norm(s){ return (s ?? "").toString().trim(); }

  // Load can_texts.json (người dùng sẽ update nội dung tại đây)
  // Format kỳ vọng:
  // {
  //   "Ất": { "tu_hoa": {"loc":"...","quyen":"...","khoa":"...","ky":"..."}, ... },
  //   ...
  // }
  let CAN_TEXTS = null;

  async function loadCanTexts(){
    if (CAN_TEXTS) return CAN_TEXTS;
    try {
      const res = await fetch('./data/can_texts.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      CAN_TEXTS = await res.json();
      return CAN_TEXTS;
    } catch (e) {
      // để tránh crash: giữ null, UI sẽ fallback sang window.tuHoaByCan
      console.warn('[addon_can_table] Cannot load ./data/can_texts.json', e);
      CAN_TEXTS = null;
      return null;
    }
  }

  const HOA_ORDER = ["Hóa Lộc","Hóa Quyền","Hóa Khoa","Hóa Kỵ"]; 

  function ensureModal(){
    if (document.getElementById('canModal')) return;

    const wrap = document.createElement('div');
    wrap.id = 'canModal';
    wrap.className = 'hidden';
    wrap.setAttribute('aria-hidden','true');
    wrap.innerHTML = `
      <div class="modal-backdrop" id="canModalClose"></div>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="canModalTitle">
        <div class="modal-header">
          <div id="canModalTitle" class="modal-title">Chi tiết Thiên Can</div>
          <button id="canModalX" class="modal-x" type="button" aria-label="Đóng">✕</button>
        </div>
        <div id="canModalBody" class="modal-body"></div>
      </div>
    `;
    document.body.appendChild(wrap);

    document.getElementById('canModalClose')?.addEventListener('click', closeModal);
    document.getElementById('canModalX')?.addEventListener('click', closeModal);
  }

  function openModal(title, html){
    ensureModal();
    document.getElementById('canModalTitle').textContent = title;
    document.getElementById('canModalBody').innerHTML = html;
    document.getElementById('canModal').classList.remove('hidden');
  }

  function closeModal(){
    document.getElementById('canModal')?.classList.add('hidden');
  }

  // Lấy can năm / can tiết từ hoaSummary (text app.js đã render)
  function parseCansFromSummary(){
    const el = document.getElementById('hoaSummary');
    if (!el) return null;
    const t = el.textContent || '';
    const mYear = t.match(/Can năm:\s*([^|]+)/i);
    const mTiet = t.match(/Can tiết:\s*([^|]+)/i);
    const canNam = mYear ? norm(mYear[1]) : '';
    const canTiet = mTiet ? norm(mTiet[1]) : '';
    if (!canNam || !canTiet) return null;
    return { canNam, canTiet };
  }

  function getTuHoaRow(can){
    // Ưu tiên đọc từ can_texts.json (đúng theo yêu cầu: nội dung lấy từ bài viết)
    if (CAN_TEXTS && CAN_TEXTS[can]) {
      const t = CAN_TEXTS[can];
      const tu = t && t.tu_hoa ? t.tu_hoa : {};
      return {
        "Hóa Lộc": norm(tu.loc),
        "Hóa Quyền": norm(tu.quyen),
        "Hóa Khoa": norm(tu.khoa),
        "Hóa Kỵ": norm(tu.ky),
        __raw: t,
      };
    }

    // Fallback: nếu nơi khác đã cung cấp window.tuHoaByCan
    const map = (window.tuHoaByCan || {});
    if (map[can]) return map[can];
    const keys = Object.keys(map);
    const k = keys.find(x => norm(x) === norm(can));
    return k ? map[k] : null;
  }

  function renderCanTable(canNam, canTiet){
    const host = document.getElementById('stats');
    if (!host) return;

    const cans = [canNam, canTiet];
    const rows = cans.map(can => {
      const row = getTuHoaRow(can) || {};
      return {
        can,
        "Hóa Lộc": norm(row["Hóa Lộc"]),
        "Hóa Quyền": norm(row["Hóa Quyền"]),
        "Hóa Khoa": norm(row["Hóa Khoa"]),
        "Hóa Kỵ": norm(row["Hóa Kỵ"]),
        __raw: row.__raw || null,
      };
    });

    host.innerHTML = `
      <div class="note" style="margin-bottom:6px;"><b>Bảng tứ hoá theo Can năm & Can tiết khí</b></div>
      <div class="can-table-wrap">
        <table class="can-table">
          <thead>
            <tr>
              <th>Thiên Can</th>
              <th>Hóa Lộc</th>
              <th>Hóa Quyền</th>
              <th>Hóa Khoa</th>
              <th>Hóa Kỵ</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><span class="can-chip" data-can="${r.can}">${r.can}</span></td>
                <td>${r["Hóa Lộc"] || '<span class="small-muted">(trống)</span>'}</td>
                <td>${r["Hóa Quyền"] || '<span class="small-muted">(trống)</span>'}</td>
                <td>${r["Hóa Khoa"] || '<span class="small-muted">(trống)</span>'}</td>
                <td>${r["Hóa Kỵ"] || '<span class="small-muted">(trống)</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="note" style="margin-top:6px;">Tip: bấm vào <b>Thiên Can</b> để mở popup.</div>
    `;
  }

  // Popup: hiện placeholder + bảng tứ hóa của can
  function onClickCan(e){
    const chip = e.target.closest('.can-chip');
    if (!chip) return;
    const can = norm(chip.getAttribute('data-can'));
    const row = getTuHoaRow(can) || {};
    const raw = row.__raw || null;

    // Nội dung diễn giải (nếu có can_texts.json)
    const tongQuan = raw ? norm(raw.tong_quan) : '';
    const ketCau = raw ? norm(raw.ket_cau) : '';
    const giai = raw && raw.giai_nghia ? raw.giai_nghia : null;

    const giaiHtml = giai ? HOA_ORDER.map(h => {
      const txt = norm(giai[h]);
      return txt ? `<div class="can-explain"><b>${h}:</b> ${txt}</div>` : '';
    }).filter(Boolean).join('') : '';

    const html = `
      <div class="modal-section">
        <h3>Tứ hoá theo ${can}</h3>
        <div>${HOA_ORDER.map(h => `<div><b>${h}:</b> ${norm(row[h]) || '(trống)'}</div>`).join('')}</div>
      </div>

      <div class="modal-section">
        <h3>Tổng quan</h3>
        <div>${tongQuan || '<span class="small-muted">(chưa có nội dung)</span>'}</div>
      </div>

      <div class="modal-section">
        <h3>Diễn giải theo tứ hoá</h3>
        <div>${giaiHtml || '<span class="small-muted">(chưa có nội dung)</span>'}</div>
      </div>

      <div class="modal-section">
        <h3>Kết câu</h3>
        <div>${ketCau || '<span class="small-muted">(chưa có nội dung)</span>'}</div>
      </div>
    `;
    openModal(`Thiên Can: ${can}`, html);
  }

  async function install(){
    // load can texts first (non-blocking for the rest)
    await loadCanTexts();

    // click can
    document.addEventListener('click', onClickCan);

    // quan sát hoaSummary: mỗi lần compute xong app.js update text => render bảng mới
    const sum = document.getElementById('hoaSummary');
    if (!sum) return;

    const obs = new MutationObserver(() => {
      const cans = parseCansFromSummary();
      if (cans) renderCanTable(cans.canNam, cans.canTiet);
    });

    obs.observe(sum, { childList:true, characterData:true, subtree:true });

    // nếu load lại trang mà đã có sẵn summary (cache), render luôn
    const cans0 = parseCansFromSummary();
    if (cans0) renderCanTable(cans0.canNam, cans0.canTiet);
  }

  // chờ DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { install(); });
  } else {
    install();
  }
})();

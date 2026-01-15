(() => {
  // ===== Config =====
  const STAR_TEXTS_URL = "./data/star_texts.json";
  const CONDITION_URL  = "./data/data_condition.csv";

  // Badge text prefixes used in app.js
  const HOA_TYPES = ["Hóa Lộc", "Hóa Quyền", "Hóa Khoa", "Hóa Kỵ"];

  let starTexts = {};
  let starHoaCaps = {}; // star -> Set(hoaType)

  // ===== Helpers =====
  const norm = (s) => (s ?? "").toString().trim();

  function escapeHtml(s) {
    return (s ?? "")
      .toString()
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;")
      .replaceAll("\n","<br>");
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Không tải được: " + url);
    return await res.text();
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Không tải được: " + url);
    return await res.json();
  }

  function detectKeys(row) {
    const keys = Object.keys(row || {});
    const lower = (k) => k.toLowerCase();

    const canKey =
      keys.find(k => lower(k).includes("can")) ||
      keys[0];

    const locKey =
      keys.find(k => lower(k).includes("lộc") || lower(k).includes("loc"));

    const quyenKey =
      keys.find(k => lower(k).includes("quyền") || lower(k).includes("quyen"));

    const khoaKey =
      keys.find(k => lower(k).includes("khoa"));

    const kyKey =
      keys.find(k => lower(k).includes("kỵ") || lower(k).includes("ky"));

    return { canKey, locKey, quyenKey, khoaKey, kyKey };
  }

  function buildCapsFromConditionRows(rows) {
    if (!rows || !rows.length) return {};
    const { locKey, quyenKey, khoaKey, kyKey } = detectKeys(rows[0]);

    const caps = {}; // star -> Set
    const add = (star, hoaType) => {
      const s = norm(star);
      if (!s) return;
      if (!caps[s]) caps[s] = new Set();
      caps[s].add(hoaType);
    };

    for (const r of rows) {
      if (locKey) add(r[locKey], "Hóa Lộc");
      if (quyenKey) add(r[quyenKey], "Hóa Quyền");
      if (khoaKey) add(r[khoaKey], "Hóa Khoa");
      if (kyKey) add(r[kyKey], "Hóa Kỵ");
    }
    return caps;
  }

  // ===== Modal =====
  function ensureModalExists() {
    const modal = document.getElementById("starModal");
    return !!modal;
  }

  function closeModal() {
    const modal = document.getElementById("starModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function openModal(star, house, hoaTypesInHouse) {
    const modal = document.getElementById("starModal");
    const title = document.getElementById("modalTitle");
    const body = document.getElementById("modalBody");
    if (!modal || !title || !body) return;

    const s = norm(star);
    const h = norm(house);

    title.textContent = `${s} — Cung ${h}`;

    const info = starTexts?.[s] || {};
    const base = info.base || "(Chưa có nội dung base cho sao này trong star_texts.json)";
    const hoaMap = info.hoa || {};

    // allowed types: prefer condition table; fallback to star_texts keys
    const allowedSet = starHoaCaps?.[s] ? starHoaCaps[s] : new Set(Object.keys(hoaMap || {}));
    const finalHoa = (hoaTypesInHouse || []).filter(ht => allowedSet.has(ht));

    let html = `
      <div class="modal-section">
        <h3>Tổng quan</h3>
        <div>${escapeHtml(base)}</div>
      </div>
      <div class="modal-section">
        <h3>Tứ hóa đang có tại cung ${escapeHtml(h)}</h3>
        <div>
          ${
            finalHoa.length
              ? finalHoa.map(x => `<span class="modal-chip">${escapeHtml(x)}</span>`).join("")
              : `<span class="small-muted">(Không có tứ hóa hợp lệ cho sao này tại ô này)</span>`
          }
        </div>
      </div>
    `;

    // show each hoa text in fixed order
    for (const ht of HOA_TYPES) {
      if (!finalHoa.includes(ht)) continue;
      const txt = hoaMap?.[ht] || `(Chưa có nội dung ${ht})`;
      html += `
        <div class="modal-section">
          <h3>${escapeHtml(ht)}</h3>
          <div>${escapeHtml(txt)}</div>
        </div>
      `;
    }

    body.innerHTML = html;

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  // ===== Chart decoration & click handling =====
  function getHouseFromBox(box) {
    const t = box.querySelector(".house-title");
    return norm(t?.textContent);
  }

  function getHoaTypesFromBox(box) {
    // label badges are in the 2nd div of box: <div>${labelHtml}</div>
    // We read all spans.badge except those in the stars area
    const divs = box.querySelectorAll(":scope > div");
    if (divs.length < 2) return [];
    const labelsDiv = divs[1];
    const spans = labelsDiv.querySelectorAll("span.badge");
    const types = new Set();
    for (const sp of spans) {
      const txt = norm(sp.textContent);
      for (const ht of HOA_TYPES) {
        if (txt.startsWith(ht)) {
          types.add(ht);
          break;
        }
      }
    }
    return Array.from(types);
  }

  function decorateChartOnce() {
    const chart = document.getElementById("chart");
    if (!chart) return;

    const boxes = chart.querySelectorAll(".house");
    boxes.forEach(box => {
      const house = getHouseFromBox(box);
      if (!house) return;

      const divs = box.querySelectorAll(":scope > div");
      if (divs.length < 3) return;
      const starsDiv = divs[2];

      // In starsDiv, stars are spans.badge without extra classes (hloc/hquyen/hkhoa/hky/dayhouse).
      const starSpans = starsDiv.querySelectorAll("span.badge");
      starSpans.forEach(sp => {
        if (sp.classList.contains("star-click")) return;

        // Only convert if it looks like a star name (not "(trống)")
        const star = norm(sp.textContent);
        if (!star || star.startsWith("(")) return;

        sp.classList.add("star-click");
        sp.setAttribute("role", "button");
        sp.setAttribute("tabindex", "0");
        sp.dataset.star = star;
        sp.dataset.house = house;
      });
    });
  }

  function attachChartListeners() {
    const chart = document.getElementById("chart");
    if (!chart) return;

    chart.addEventListener("click", (e) => {
      const el = e.target.closest(".star-click");
      if (!el) return;

      const star = el.dataset.star;
      const house = el.dataset.house;

      const box = el.closest(".house");
      const hoaTypesInHouse = box ? getHoaTypesFromBox(box) : [];

      openModal(star, house, hoaTypesInHouse);
    });

    chart.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = e.target.closest(".star-click");
      if (!el) return;
      e.preventDefault();

      const star = el.dataset.star;
      const house = el.dataset.house;
      const box = el.closest(".house");
      const hoaTypesInHouse = box ? getHoaTypesFromBox(box) : [];

      openModal(star, house, hoaTypesInHouse);
    });
  }

  function attachModalListeners() {
    document.getElementById("modalClose")?.addEventListener("click", closeModal);
    document.getElementById("modalX")?.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  function observeChartMutations() {
    const chart = document.getElementById("chart");
    if (!chart) return;
    const obs = new MutationObserver(() => decorateChartOnce());
    obs.observe(chart, { childList: true, subtree: true });
  }

  async function initData() {
    // star texts
    try {
      starTexts = await fetchJSON(STAR_TEXTS_URL);
    } catch (e) {
      console.warn("[addon_star_modal] star_texts.json load failed:", e.message);
      starTexts = {};
    }

    // condition table -> starHoaCaps
    try {
      const csv = await fetchText(CONDITION_URL);
      if (window.Papa) {
        const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
        starHoaCaps = buildCapsFromConditionRows(parsed.data || []);
      } else {
        console.warn("[addon_star_modal] PapaParse not found; will fallback to star_texts keys.");
        starHoaCaps = {};
      }
    } catch (e) {
      console.warn("[addon_star_modal] data_condition.csv load failed:", e.message);
      starHoaCaps = {};
    }
  }

  async function boot() {
    if (!ensureModalExists()) {
      console.warn("[addon_star_modal] Modal HTML missing.");
      return;
    }

    await initData();

    decorateChartOnce();
    attachChartListeners();
    attachModalListeners();
    observeChartMutations();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
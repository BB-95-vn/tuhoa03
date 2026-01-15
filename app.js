// ======================
// Paths
// ======================
const DATA_LASO_URL = "./data/DATA_laso.csv";
const DATA_COND_URL = "./data/data_condition.csv";
const AMLICH_URL = "./data/amlich_normalized.csv";
const SOLAR_TERMS_URL = "./data/solar_terms_4zones_2000_2100_with_utc.csv";

// ======================
// Constants
// ======================
const HOUSES = ["Tý","Sửu","Dần","Mão","Thìn","Tỵ","Ngọ","Mùi","Thân","Dậu","Tuất","Hợi"];
const FOUR_STARS = ["Tả Phù","Hữu Bật","Văn Xương","Văn Khúc"];
const STEMS = ["Giáp","Ất","Bính","Đinh","Mậu","Kỷ","Canh","Tân","Nhâm","Quý"];
const BRANCHES_SOLAR_MONTH = ["Dần","Mão","Thìn","Tỵ","Ngọ","Mùi","Thân","Dậu","Tuất","Hợi","Tý","Sửu"];

// Đối / Nhị / Tam theo địa chi chuẩn
const DOI_CUNG = {
  "Tý":"Ngọ","Ngọ":"Tý",
  "Sửu":"Mùi","Mùi":"Sửu",
  "Dần":"Thân","Thân":"Dần",
  "Mão":"Dậu","Dậu":"Mão",
  "Thìn":"Tuất","Tuất":"Thìn",
  "Tỵ":"Hợi","Hợi":"Tỵ"
};

const NHI_HOP = {
  "Tý":"Sửu","Sửu":"Tý",
  "Dần":"Hợi","Hợi":"Dần",
  "Mão":"Tuất","Tuất":"Mão",
  "Thìn":"Dậu","Dậu":"Thìn",
  "Tỵ":"Thân","Thân":"Tỵ",
  "Ngọ":"Mùi","Mùi":"Ngọ"
};

const TAM_HOP = {
  "Tý":["Thân","Thìn"],
  "Thân":["Tý","Thìn"],
  "Thìn":["Tý","Thân"],

  "Hợi":["Mão","Mùi"],
  "Mão":["Hợi","Mùi"],
  "Mùi":["Hợi","Mão"],

  "Dần":["Ngọ","Tuất"],
  "Ngọ":["Dần","Tuất"],
  "Tuất":["Dần","Ngọ"],

  "Tỵ":["Dậu","Sửu"],
  "Dậu":["Tỵ","Sửu"],
  "Sửu":["Tỵ","Dậu"]
};

// 12 "tháng tiết khí" (theo 12 "tiết"), bắt đầu từ Dần (term_key tiếng Anh)
const SOLAR_MONTH_START_TERMS = [
  { key: "start_of_spring",        branch: "Dần"  },
  { key: "awakening_of_insects",   branch: "Mão"  },
  { key: "pure_brightness",        branch: "Thìn" },
  { key: "start_of_summer",        branch: "Tỵ"   },
  { key: "grain_in_ear",           branch: "Ngọ"  },
  { key: "minor_heat",             branch: "Mùi"  },
  { key: "start_of_autumn",        branch: "Thân" },
  { key: "white_dew",              branch: "Dậu"  },
  { key: "cold_dew",               branch: "Tuất" },
  { key: "start_of_winter",        branch: "Hợi"  },
  { key: "major_snow",             branch: "Tý"   },
  { key: "minor_cold",             branch: "Sửu"  },
];
const SOLAR_MONTH_START_KEYS = new Set(SOLAR_MONTH_START_TERMS.map(x => x.key));

// ======================
// State
// ======================
let lasoRows = [];
let amlichRows = [];
let solarRows = [];

let tyMap = {};              // "A|B" => groupId
let chartByGroup = {};       // groupId => { type, houses:{house:[stars...]}}
let tuHoaByCan = {};         // can => { "Hóa Lộc": star, ... }
let allMainStars = new Set();

let amlichMap = new Map();   // "YYYY-MM-DD" => row
let solarTermsByTZ = {};     // tz => rows sorted

let selectedGroupId = null;
let userExtraPos = {};       // {"Tả Phù":"Tý",...}

// ======================
// Utilities
// ======================
function norm(s){ return (s ?? "").toString().trim(); }
function key2(a,b){ return [norm(a), norm(b)].sort((x,y)=>x.localeCompare(y)).join("|"); }
function pad2(n){ return String(n).padStart(2,'0'); }
function toISODateString(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

function parsePossibleDate(s) {
  const t = (s ?? "").toString().trim();
  if (!t) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(t + "T00:00:00");
    return isNaN(d) ? null : d;
  }

  // M/D/YYYY hoặc D/M/YYYY
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const a = parseInt(m[1],10), b=parseInt(m[2],10), y=parseInt(m[3],10);

    // ưu tiên M/D/YYYY
    let d1 = new Date(y, a-1, b);
    if (!isNaN(d1)) return d1;

    // fallback D/M/YYYY
    let d2 = new Date(y, b-1, a);
    return isNaN(d2) ? null : d2;
  }

  return null;
}

function stemIndex(stem){ return STEMS.indexOf(stem); }

function firstMonthStemForYearStem(yearStem) {
  // can tháng Dần theo can năm
  const s = yearStem;
  if (s === "Giáp" || s === "Kỷ") return "Bính";
  if (s === "Ất"  || s === "Canh") return "Mậu";
  if (s === "Bính"|| s === "Tân") return "Canh";
  if (s === "Đinh"|| s === "Nhâm") return "Nhâm";
  if (s === "Mậu" || s === "Quý") return "Giáp";
  throw new Error("Niên can không hợp lệ.");
}

function buildSolarMonthsCanChi(yearStem) {
  const first = firstMonthStemForYearStem(yearStem);
  const idx0 = stemIndex(first);
  if (idx0 < 0) throw new Error("Không xác định được can tháng Dần.");

  const months12 = [];
  for (let i=0;i<12;i++) {
    const stem = STEMS[(idx0 + i) % 10];
    const branch = BRANCHES_SOLAR_MONTH[i];
    months12.push(`${stem} ${branch}`);
  }
  return months12;
}

function buildMonthLabelByHouseFromTy(monthCanChiAtTy, months12) {
  const idx0 = months12.indexOf(monthCanChiAtTy);
  if (idx0 < 0) throw new Error("Can-chi tháng tại cung Tý không nằm trong 12 tháng tiết khí của năm này.");

  const map = {};
  for (let i=0;i<12;i++) {
    map[HOUSES[i]] = months12[(idx0 + i) % 12];
  }
  return map;
}

function getStemFromCanChiMonth(s) {
  // "Bính Dần" -> "Bính"
  return (s ?? "").trim().split(/\s+/)[0] ?? "";
}

function advanceHouse(house, offset) {
  const i = HOUSES.indexOf(house);
  return HOUSES[(i + offset) % 12];
}

function getDayHouseBySolarMonthLabel(solarMonthCanChi, dayIndexInSolarMonth, labelByHouse) {
  const startHouse = HOUSES.find(h => labelByHouse[h] === solarMonthCanChi);
  if (!startHouse) throw new Error("Không tìm thấy cung khởi của tháng tiết khí trong nhãn 12 cung.");
  return advanceHouse(startHouse, dayIndexInSolarMonth - 1);
}

// ======================
// CSV Loaders
// ======================
function loadCSV(url, opts={header:true}) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: !!opts.header,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data),
      error: reject
    });
  });
}

// ======================
// Parse & Index
// ======================
function buildLasoIndex() {
  const clean = lasoRows.filter(r => norm(r["GroupID"]) !== "group_id");

  for (const r of clean) {
    const gid = parseInt(r["GroupID"], 10);
    if (!chartByGroup[gid]) {
      chartByGroup[gid] = { type: norm(r["Loại"]), houses: {} };
      for (const h of HOUSES) chartByGroup[gid].houses[h] = [];
    }

    const house = norm(r["Cung địa chi"]);
    const star = norm(r["Chính Tinh"]);
    if (house && star) {
      chartByGroup[gid].houses[house].push(star);
      allMainStars.add(star);
    }
  }

  for (const r of clean) {
    const check = norm(r["Lá tại Tý"]);
    if (!check) continue;
    const gid = parseInt(r["GroupID"], 10);
    const parts = check.split("|").map(x => x.trim());
    if (parts.length !== 2) continue;
    tyMap[key2(parts[0], parts[1])] = gid;
  }
}

function parseTuHoaTable(condRawRows) {
  // data_condition.csv của bạn: bảng bắt đầu tại dòng có "Can"
  let start = -1;
  for (let i=0;i<condRawRows.length;i++) {
    if (norm(condRawRows[i][0]) === "Can") { start = i; break; }
  }
  if (start === -1) throw new Error("Không tìm thấy bảng 'Can' trong data_condition.csv");

  for (let i=start+1;i<condRawRows.length;i++) {
    const can = norm(condRawRows[i][0]);
    if (!can) break;
    const hloc = norm(condRawRows[i][1]);
    const hquyen = norm(condRawRows[i][2]);
    const hkhoa = norm(condRawRows[i][3]);
    const hky = norm(condRawRows[i][4]);

    tuHoaByCan[can] = {
      "Hóa Lộc": hloc,
      "Hóa Quyền": hquyen,
      "Hóa Khoa": hkhoa,
      "Hóa Kỵ": hky
    };
  }
}

function buildAmlichIndex(rows) {
  for (const r of rows) {
    const ds = r["duong"];
    const d = parsePossibleDate(ds);
    if (!d) continue;
    amlichMap.set(toISODateString(d), r);
  }
}

function buildSolarTermsIndex(rows) {
  solarTermsByTZ = {};
  for (const r of rows) {
    const tz = norm(r["timezone"]);
    if (!tz) continue;
    if (!solarTermsByTZ[tz]) solarTermsByTZ[tz] = [];
    solarTermsByTZ[tz].push(r);
  }

  for (const tz of Object.keys(solarTermsByTZ)) {
    solarTermsByTZ[tz].sort((a,b)=> {
      const ta = norm(a["datetime_local"] ?? a["date_local"]);
      const tb = norm(b["datetime_local"] ?? b["date_local"]);
      return ta.localeCompare(tb);
    });
  }
}

function parseLocalStartDateWithCutoff(r, cutoffHour = 13) {
  // Ưu tiên datetime_local nếu có, fallback date_local
  const dtStr = norm(r["datetime_local"]);
  const dStr  = norm(r["date_local"]);

  let dt = null;

  // datetime_local thường là ISO (vd: 2026-01-05T15:03:00+09:00 hoặc "2026-01-05 15:03")
  if (dtStr) {
    // Thử parse trực tiếp
    dt = new Date(dtStr);
    if (isNaN(dt)) {
      // fallback nếu format "YYYY-MM-DD HH:mm"
      const m = dtStr.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
      if (m) dt = new Date(`${m[1]}T${m[2]}:${m[3]}:00`);
    }
  }

  // Fallback chỉ có date_local
  if (!dt || isNaN(dt)) {
    if (!dStr) return null;
    dt = new Date(dStr + "T00:00:00");
    if (isNaN(dt)) return null;
  }

  // ✅ Rule của bạn: nếu giờ bắt đầu >= cutoffHour thì tính sang ngày mới
  const hour = dt.getHours();
  if (hour >= cutoffHour) {
    const shifted = new Date(dt);
    shifted.setDate(shifted.getDate() + 1);
    // set về 00:00 để làm mốc ngày 1
    shifted.setHours(0, 0, 0, 0);
    return shifted;
  }

  // nếu < cutoffHour => ngày 1 chính là ngày dt
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function isMonthStartTermRow(r) {
  const k = norm(r["term_key"]);
  return SOLAR_MONTH_START_KEYS.has(k);
}

function getActiveSolarMonth(tz, isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d)) throw new Error("Ngày không hợp lệ.");

  const year = d.getFullYear();
  const rows = solarTermsByTZ[tz] ?? [];
  if (!rows.length) throw new Error("Không có dữ liệu tiết khí cho timezone này.");

  // lấy tiết khí khởi tháng trong [year-1, year]
  const candidates = rows.filter(r => {
    const y = parseInt(r["year"], 10);
    if (!(y === year || y === year - 1)) return false;
    return isMonthStartTermRow(r);
  }).map(r => {
    const dt = parseLocalStartDateWithCutoff(r, 13);
    return { r, dt };
  }).filter(x => x.dt);

  candidates.sort((a,b)=>a.dt-b.dt);

  let active = null;
  for (const c of candidates) {
    if (c.dt <= d) active = c;
    else break;
  }
  if (!active) active = candidates[candidates.length-1] ?? null;
  if (!active) throw new Error("Không tìm thấy tiết khí khởi tháng.");

  const startDate = active.dt;
  const dayIndex = Math.floor((d - startDate) / (24*3600*1000)) + 1;

  const def = SOLAR_MONTH_START_TERMS.find(x => x.key === norm(active.r["term_key"]));
  const monthBranch = def?.branch;

  return {
    year,
    startISO: toISODateString(startDate),
    dayIndexInSolarMonth: dayIndex,
    monthBranch,
    termKey: norm(active.r["term_key"])
  };
}

function getSolarMonthCanChiForDate(activeSolarMonth, months12) {
  const idx = BRANCHES_SOLAR_MONTH.indexOf(activeSolarMonth.monthBranch);
  if (idx < 0) throw new Error("Không xác định được chi tháng tiết khí từ tiết khí.");
  return months12[idx];
}

// ======================
// Core computations
// ======================
function buildExpandedHouses(groupId) {
  const base = chartByGroup[groupId]?.houses;
  const expanded = {};
  for (const h of HOUSES) expanded[h] = (base?.[h] ?? []).slice();

  for (const star of FOUR_STARS) {
    const h = userExtraPos[star];
    if (h) expanded[h].push(star);
  }
  return expanded;
}

function computeHoaCore(can, expandedHouses) {
  const map = tuHoaByCan[can];
  if (!map) throw new Error(`Không có dữ liệu tứ hoá cho can ${can}`);

  const core = {};
  for (const [hoaType, starName] of Object.entries(map)) {
    const housesHit = [];
    for (const h of HOUSES) {
      if ((expandedHouses[h] ?? []).some(s => norm(s) === norm(starName))) housesHit.push(h);
    }
    core[hoaType] = housesHit;
  }
  return core;
}

/**
 * ✅ RULE MỚI (theo yêu cầu của bạn):
 * - Đối / Nhị / Tam chỉ xét trực tiếp từ ô TỰ HÓA (core).
 * - Không lan tầng (không từ đối -> nhị, không từ nhị -> tam).
 */
function propagateHoaByDiaChi(hoaCoreByType) {
  const out = {};

  for (const [hoaType, coreList] of Object.entries(hoaCoreByType)) {
    const coreSet = new Set(coreList ?? []);

    const doiSet = new Set();
    const nhiSet = new Set();
    const tamSet = new Set();

    // chỉ xét trực tiếp từ core
    for (const h of coreSet) {
      const d = DOI_CUNG[h];
      if (d) doiSet.add(d);

      const n = NHI_HOP[h];
      if (n) nhiSet.add(n);

      const t = TAM_HOP[h] ?? [];
      for (const th of t) tamSet.add(th);
    }

    out[hoaType] = { core: coreSet, doi: doiSet, nhi: nhiSet, tam: tamSet };
  }

  return out;
}

function buildBadgesByHouse2(spreadNam, spreadTiet) {
  const badges = {};
  for (const h of HOUSES) badges[h] = [];

  function add(spread, srcLabel) {
    for (const [hoaType, src] of Object.entries(spread)) {
      for (const hh of src.core) badges[hh].push(`${hoaType} (${srcLabel}, tự)`);
      for (const hh of src.doi)  badges[hh].push(`${hoaType} (${srcLabel}, đối)`);
      for (const hh of src.nhi)  badges[hh].push(`${hoaType} (${srcLabel}, nhị)`);
      for (const hh of src.tam)  badges[hh].push(`${hoaType} (${srcLabel}, tam)`);
    }
  }

  add(spreadNam, "năm");
  add(spreadTiet, "tiết");
  return badges;
}

// ======================
// UI helpers
// ======================
function fillSelectOptions(sel, options, placeholder="-- chọn --") {
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    options.map(o => `<option value="${o}">${o}</option>`).join("");
}

function fillTySolarMonthSelect(months12) {
  const sel = document.getElementById("tySolarMonthSelect");
  sel.innerHTML = `<option value="">-- chọn tháng tại cung Tý --</option>` +
    months12.map(x => `<option value="${x}">${x}</option>`).join("");
}

// ======================
// Render
// ======================
function renderStatsTable(hoaSpread, titleText) {
  const stats = document.getElementById("stats");

  function clsForHoaType(hoaType) {
    return hoaType === "Hóa Lộc" ? "hloc"
      : hoaType === "Hóa Quyền" ? "hquyen"
      : hoaType === "Hóa Khoa" ? "hkhoa"
      : "hky";
  }

  function pills(houses, hoaType) {
    const arr = Array.from(houses ?? []);
    if (!arr.length) return `<span class="small-muted">(không)</span>`;
    const cls = clsForHoaType(hoaType);
    return arr.map(h => `<span class="pill ${cls}">${h}</span>`).join("");
  }

  const orderHoa = ["Hóa Lộc","Hóa Quyền","Hóa Khoa","Hóa Kỵ"];
  const rowsHtml = orderHoa.map(hoaType => {
    const src = hoaSpread[hoaType] ?? { core:new Set(), doi:new Set(), nhi:new Set(), tam:new Set() };
    return `
      <tr>
        <th>${hoaType}</th>
        <td>${pills(src.core, hoaType)}</td>
        <td>${pills(src.doi, hoaType)}</td>
        <td>${pills(src.nhi, hoaType)}</td>
        <td>${pills(src.tam, hoaType)}</td>
      </tr>
    `;
  }).join("");

  const title = titleText ? `<div class="note" style="margin-bottom:6px;"><b>${titleText}</b></div>` : "";

  stats.innerHTML = `
    ${title}
    <table>
      <thead>
        <tr>
          <th>Loại Hóa</th>
          <th>Tự hóa</th>
          <th>Đối cung</th>
          <th>Nhị hợp</th>
          <th>Tam hợp</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function renderChart(expandedHouses, badgesByHouse) {
  const chart = document.getElementById("chart");
  chart.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "grid12";

  for (const h of HOUSES) {
    const box = document.createElement("div");
    box.className = "house";

    const stars = expandedHouses[h] ?? [];
    const labels = badgesByHouse[h] ?? [];

    const labelHtml = labels.length
      ? labels.map(t => {
          let cls = "hky";
          if (t.startsWith("Hóa Lộc")) cls = "hloc";
          else if (t.startsWith("Hóa Quyền")) cls = "hquyen";
          else if (t.startsWith("Hóa Khoa")) cls = "hkhoa";
          else if (t.startsWith("Ô ngày")) cls = "dayhouse";
          return `<span class="badge ${cls}">${t}</span>`;
        }).join("")
      : `<span class="muted">(chưa dính hoá)</span>`;

    box.innerHTML = `
      <div class="house-title">${h}</div>
      <div>${labelHtml}</div>
      <div style="margin-top:6px;">
        ${stars.length ? stars.map(s => `<span class="badge">${s}</span>`).join("") : `<span class="muted">(trống)</span>`}
      </div>
    `;
    grid.appendChild(box);
  }

  chart.appendChild(grid);
}

// ======================
// UI events
// ======================
function onFindGroup() {
  const a = document.getElementById("tyStar1").value;
  const b = document.getElementById("tyStar2").value;
  const out = document.getElementById("groupResult");

  if (!a || !b) { out.textContent = "Bạn cần chọn đủ 2 chính tinh tại cung Tý."; return; }

  const gid = tyMap[key2(a,b)];
  if (!gid) { out.textContent = `Không khớp lá số cho cặp: ${key2(a,b)} (kiểm tra lại data)`; return; }

  selectedGroupId = gid;
  const type = chartByGroup[gid]?.type ? ` — ${chartByGroup[gid].type}` : "";
  out.textContent = `✅ GroupID: ${gid}${type}`;

  document.getElementById("step2").style.display = "";
  document.getElementById("step3").style.display = "none";
  document.getElementById("output").style.display = "none";
  document.getElementById("step2Error").textContent = "";
  document.getElementById("hoaSummary").textContent = "";
}

function onGoStep3() {
  const p1 = document.getElementById("posTaPhu").value;
  const p2 = document.getElementById("posHuuBat").value;
  const p3 = document.getElementById("posVanXuong").value;
  const p4 = document.getElementById("posVanKhuc").value;

  const err = document.getElementById("step2Error");
  err.textContent = "";
  if (!p1 || !p2 || !p3 || !p4) {
    err.textContent = "Bạn phải chọn đủ cung cho: Tả Phù, Hữu Bật, Văn Xương, Văn Khúc.";
    return;
  }

  userExtraPos = {
    "Tả Phù": p1,
    "Hữu Bật": p2,
    "Văn Xương": p3,
    "Văn Khúc": p4
  };

  document.getElementById("step3").style.display = "";
  document.getElementById("output").style.display = "none";
  document.getElementById("hoaSummary").textContent = "";
}

function onDateChanged() {
  const iso = document.getElementById("dateInput").value;
  const sum = document.getElementById("hoaSummary");
  sum.textContent = "";
  if (!iso) return;

  const row = amlichMap.get(iso);
  if (!row) {
    sum.textContent = "Không tìm thấy ngày này trong amlich_normalized.csv";
    fillTySolarMonthSelect([]);
    return;
  }

  const yearStem = norm(row["nam_can"]);
  if (!yearStem) {
    sum.textContent = "Thiếu nam_can trong amlich_normalized.csv";
    fillTySolarMonthSelect([]);
    return;
  }

  const months12 = buildSolarMonthsCanChi(yearStem);
  fillTySolarMonthSelect(months12);
}

function onCompute() {
  const iso = document.getElementById("dateInput").value;
  const tz = document.getElementById("tzSelect").value;
  const tyMonth = document.getElementById("tySolarMonthSelect").value;
  const sum = document.getElementById("hoaSummary");
  sum.textContent = "";

  if (!selectedGroupId) { sum.textContent = "Chưa xác định GroupID."; return; }
  if (!iso) { sum.textContent = "Bạn cần chọn ngày."; return; }
  if (!tz) { sum.textContent = "Bạn cần chọn timezone."; return; }
  if (!tyMonth) { sum.textContent = "Bạn cần chọn Can-Chi tháng tiết khí tại cung Tý."; return; }

  const row = amlichMap.get(iso);
  if (!row) { sum.textContent = "Không tìm thấy ngày trong amlich_normalized.csv"; return; }
  const canNam = norm(row["nam_can"]);
  if (!canNam) { sum.textContent = "Thiếu nam_can cho ngày này."; return; }

  let active;
  try {
    active = getActiveSolarMonth(tz, iso);
  } catch (e) {
    sum.textContent = "Lỗi xác định tháng tiết khí: " + e.message;
    return;
  }

  const months12 = buildSolarMonthsCanChi(canNam);

  let solarMonthCanChi;
  try {
    solarMonthCanChi = getSolarMonthCanChiForDate(active, months12);
  } catch (e) {
    sum.textContent = "Lỗi xác định Can-Chi tháng tiết khí: " + e.message;
    return;
  }

  let labelByHouse;
  try {
    labelByHouse = buildMonthLabelByHouseFromTy(tyMonth, months12);
  } catch (e) {
    sum.textContent = e.message;
    return;
  }

  let dayHouse;
  try {
    dayHouse = getDayHouseBySolarMonthLabel(solarMonthCanChi, active.dayIndexInSolarMonth, labelByHouse);
  } catch (e) {
    sum.textContent = "Lỗi tính ô ngày: " + e.message;
    return;
  }

  const expanded = buildExpandedHouses(selectedGroupId);

  const canTiet = getStemFromCanChiMonth(solarMonthCanChi);

  let spreadNam, spreadTiet;
  try {
    spreadNam = propagateHoaByDiaChi(computeHoaCore(canNam, expanded));
    spreadTiet = propagateHoaByDiaChi(computeHoaCore(canTiet, expanded));
  } catch (e) {
    sum.textContent = "Lỗi tính tứ hoá: " + e.message;
    return;
  }

  const badgesByHouse = buildBadgesByHouse2(spreadNam, spreadTiet);
  badgesByHouse[dayHouse] = (badgesByHouse[dayHouse] ?? []);
  badgesByHouse[dayHouse].unshift("Ô ngày (lưu nhật)");

  document.getElementById("output").style.display = "";
  renderStatsTable(spreadNam, `Thống kê tứ hoá theo Can năm: ${canNam}`);
  renderChart(expanded, badgesByHouse);

  sum.textContent = `Ngày: ${iso} | Can năm: ${canNam} | Tháng tiết khí: ${solarMonthCanChi} (start ${active.startISO}, day ${active.dayIndexInSolarMonth}) | Can tiết: ${canTiet} | Ô ngày: ${dayHouse}`;
}

// ======================
// UI init
// ======================
function initUI() {
  const stars = Array.from(allMainStars).sort((a,b)=>a.localeCompare(b));
  fillSelectOptions(document.getElementById("tyStar1"), stars);
  fillSelectOptions(document.getElementById("tyStar2"), stars);

  for (const id of ["posTaPhu","posHuuBat","posVanXuong","posVanKhuc"]) {
    fillSelectOptions(document.getElementById(id), HOUSES, "-- chọn cung --");
  }

  // TZ select
  const tzSel = document.getElementById("tzSelect");
  const tzs = Object.keys(solarTermsByTZ).sort();
  tzSel.innerHTML = tzs.map(tz => `<option value="${tz}">${tz}</option>`).join("");

  fillTySolarMonthSelect([]);

  document.getElementById("btnFindGroup").addEventListener("click", onFindGroup);
  document.getElementById("btnGoStep3").addEventListener("click", onGoStep3);
  document.getElementById("btnCompute").addEventListener("click", onCompute);
  document.getElementById("dateInput").addEventListener("change", onDateChanged);
}

// ======================
// Main
// ======================
async function main() {
  lasoRows = await loadCSV(DATA_LASO_URL, {header:true});
  buildLasoIndex();

  // data_condition.csv: đọc header=false rồi convert về mảng
  const condObjRows = await loadCSV(DATA_COND_URL, {header:false});
  const condRows = condObjRows.map(r => Array.isArray(r) ? r : Object.values(r));
  parseTuHoaTable(condRows);

  amlichRows = await loadCSV(AMLICH_URL, {header:true});
  buildAmlichIndex(amlichRows);

  solarRows = await loadCSV(SOLAR_TERMS_URL, {header:true});
  buildSolarTermsIndex(solarRows);

  initUI();
}

main().catch(err => {
  console.error(err);
  alert("Lỗi load dữ liệu: " + err.message);
});

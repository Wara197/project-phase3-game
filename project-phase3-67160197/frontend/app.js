"use strict";

// ==========================================================
// 1. ตั้งค่า API
//    เปิดผ่าน http://localhost:3000/app หรือ Live Server ก็ใช้ค่านี้ได้
//    (ฝั่ง backend อนุญาต origin ของ Live Server ผ่าน cors แล้ว)
// ==========================================================
const API_BASE = "http://localhost:3000/api/v1";
const JSON_HEADERS = { "Content-Type": "application/json" };

// const API_BASE = "https://boardgames-api.example.com/api/v1"; คือ URL ของ backend จริงที่ deploy ไว้บน server หรือ cloud (เช่น Render, Railway, Heroku, Vercel)
const state = {
  allGames: [],
  members: [],
  borrowedGameIds: new Set(),
  searchPlayers: null,
  visibleGames: [],
};

//const $ = (id) => document.getElementById(id); id ที่ใช้บ่อย ๆ จะได้ไม่ต้องพิมพ์ document.getElementById() ทุกครั้ง
const $ = (id) => document.getElementById(id);
let statusTimer = null;

// ==========================================================
// 2. Helper: เรียก API, แสดงสถานะ, สร้าง element
// ==========================================================

/** เรียก API แล้วคืน JSON; ถ้า response ไม่ ok จะ throw error ที่มีข้อความจาก server */
async function apiFetch(path, options = {}) {
  let res;
  try {
    res = await fetch(API_BASE + path, options);
  } catch (err) {
    throw new Error(
      "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่า npm start ทำงานอยู่",
    );
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(
      data?.error?.message || `เซิร์ฟเวอร์ตอบกลับผิดพลาด: ${res.status}`,
    );
    error.code = data?.error?.code;
    throw error;
  }
  return data;
}

/** แสดงสถานะ: kind = "loading" | "success" | "error" | "" (ซ่อน) */
function setStatus(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = kind;
  clearTimeout(statusTimer);
  if (kind === "success") statusTimer = setTimeout(() => setStatus(""), 3500);
}
/** sleep(ms) คืน Promise ที่ resolve หลังจาก ms มิลลิวินาที */
function setFieldError(id, message = "") {
  const input = $(id);
  const hint = document.querySelector(`[data-error-for="${id}"]`);
  if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  if (hint) hint.textContent = message;
}
/** ฟังก์ชันหยุดพักเป็นเวลา ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
/** ฟังก์ชันล้างข้อผิดพลาดของฟิลด์ */
function clearFieldErrors(form) {
  form
    .querySelectorAll("[data-error-for]")
    .forEach((h) => (h.textContent = ""));
  form
    .querySelectorAll("[aria-invalid]")
    .forEach((i) => i.setAttribute("aria-invalid", "false"));
}
/** ฟังก์ชันสร้างเซลล์ในตาราง */
function cell(text) {
  const td = document.createElement("td");
  td.textContent = text ?? "-";
  return td;
}
/** ฟังก์ชันสร้างแถวข้อความสำหรับตาราง */
function messageRow(colspan, text, kind = "") {
  const td = document.createElement("td");
  td.colSpan = colspan;
  td.className = `table-msg ${kind}`.trim();
  td.textContent = text;
  const tr = document.createElement("tr");
  tr.append(td);
  return tr;
}
//** ฟังก์ชันสร้าง badge สำหรับสถานะ
function badge(kind, text) {
  const span = document.createElement("span");
  span.className = `badge ${kind}`;
  span.textContent = text;
  const td = document.createElement("td");
  td.append(span);
  return td;
}
/** ฟังก์ชันสร้างปุ่มในตาราง */
function button(label, className, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `small ${className}`;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}
/** ฟังก์ชันสร้างเซลล์สำหรับปุ่มในตาราง */
function actionCell(buttons) {
  const td = document.createElement("td");
  td.className = "actions-cell";
  td.append(...buttons);
  return td;
}
/* แสดงข้อความสถานะของการยืม-คืน: "BORROWED" => "กำลังยืม", "RETURNED" => "คืนแล้ว" */
const statusLabel = (s) => (s === "BORROWED" ? "กำลังยืม" : "คืนแล้ว");

// ==========================================================
// 3. GET: โหลดข้อมูลและแสดงผล
// ==========================================================

/** โหลดข้อมูลทั้งหมดที่ใช้ร่วมกันทุกแท็บ แล้วโหลดตารางทั้งสองตาราง */
async function loadAll() {
  try {
    const [games, members, borrowed] = await Promise.all([
      apiFetch("/boardgames"),
      apiFetch("/members"),
      apiFetch("/borrowings?status=BORROWED"),
    ]);
    state.allGames = games.data;
    state.members = members.data;
    state.borrowedGameIds = new Set(borrowed.data.map((b) => b.boardgameId));
    renderMembers();
    fillSelects();
  } catch (err) {
    setStatus(`โหลดข้อมูลไม่สำเร็จ: ${err.message}`, "error");
    $("members-body").replaceChildren(
      messageRow(4, `โหลดรายชื่อสมาชิกไม่สำเร็จ: ${err.message}`, "error"),
    );
    $("borrow-member").replaceChildren(new Option("โหลดสมาชิกไม่สำเร็จ", ""));
  }
  await Promise.all([loadGameTable(), loadBorrowings()]);
}

/** ตารางบอร์ดเกม: ถ้าค้นหาอยู่ให้ GET พร้อม ?players=N */
async function loadGameTable() {
  const tbody = $("games-body");
  tbody.replaceChildren(messageRow(4, "กำลังโหลดรายการบอร์ดเกม...", "loading"));
  try {
    state.visibleGames = state.searchPlayers
      ? (await apiFetch(`/boardgames?players=${state.searchPlayers}`)).data
      : state.allGames;
    renderGames();
  } catch (err) {
    tbody.replaceChildren(
      messageRow(4, `โหลดข้อมูลไม่สำเร็จ: ${err.message}`, "error"),
    );
  }
}

/** ตารางรายการยืม-คืน: GET /borrowings พร้อม ?status=...&from=...&to=... */
async function loadBorrowings() {
  const tbody = $("borrowings-body");
  const filter = $("borrow-filter").value;
  tbody.replaceChildren(messageRow(6, "กำลังโหลดรายการยืม-คืน...", "loading"));
  try {
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    const from = $("borrow-from").value;
    const to = $("borrow-to").value;
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const query = params.toString() ? `?${params}` : "";
    const res = await apiFetch(`/borrowings${query}`);
    renderBorrowings(res.data);
  } catch (err) {
    tbody.replaceChildren(
      messageRow(6, `โหลดข้อมูลไม่สำเร็จ: ${err.message}`, "error"),
    );
  }
}

// ==========================================================
// 4. แสดงผลตาราง
// ==========================================================

/** แสดงตารางบอร์ดเกม */
function renderGames() {
  const tbody = $("games-body");
  const games = state.visibleGames;
  if (games.length === 0) {
    const msg = state.searchPlayers
      ? `ไม่พบบอร์ดเกมที่รองรับ ${state.searchPlayers} คน`
      : "ยังไม่มีข้อมูลบอร์ดเกม";
    tbody.replaceChildren(messageRow(4, msg));
    return;
  }
  /* การสร้างแถวของตารางบอร์ดเกม โดยใช้ข้อมูลจาก state.visibleGames และ state.borrowedGameIds เพื่อแสดงสถานะการยืม */
  tbody.replaceChildren(
    ...games.map((g) => {
      const tr = document.createElement("tr");
      const borrowed = state.borrowedGameIds.has(g.id);
      tr.append(
        cell(g.name),
        cell(`${g.minPlayers} – ${g.maxPlayers} คน`),
        badge(
          borrowed ? "borrowed" : "available",
          borrowed ? "ถูกยืมอยู่" : "พร้อมให้ยืม",
        ),
        actionCell([
          button("แก้ไข", "secondary", () => startEditGame(g)),
          button("ลบ", "danger", () => deleteGame(g)),
        ]),
      );
      return tr;
    }),
  );
}
/** ฟังก์ชันแสดงตารางสมาชิก */
function renderMembers() {
  const tbody = $("members-body");
  if (state.members.length === 0) {
    tbody.replaceChildren(messageRow(4, "ยังไม่มีข้อมูลสมาชิก"));
    return;
  }
  tbody.replaceChildren(
    ...state.members.map((m) => {
      const tr = document.createElement("tr");
      tr.append(
        cell(m.name),
        cell(m.email),
        cell(m.phone),
        actionCell([
          button("ประวัติการยืม", "secondary", () => showHistory(m)),
          button("ลบ", "danger", () => deleteMember(m)),
        ]),
      );
      return tr;
    }),
  );
}
/** ฟังก์ชันแสดงตารางรายการยืม-คืน */
function renderBorrowings(rows) {
  const tbody = $("borrowings-body");
  if (rows.length === 0) {
    tbody.replaceChildren(
      messageRow(6, "ไม่มีรายการยืม-คืนตามเงื่อนไขที่เลือก"),
    );
    return;
  }
  tbody.replaceChildren(
    ...rows.map((r) => {
      const tr = document.createElement("tr");
      const actions =
        r.status === "BORROWED"
          ? actionCell([button("คืนบอร์ดเกม", "", () => returnGame(r))])
          : cell("-");
      tr.append(
        cell(r.memberName),
        cell(r.boardgameName),
        cell(r.borrowDate),
        cell(r.returnDate || "-"),
        badge(r.status, statusLabel(r.status)),
        actions,
      );
      return tr;
    }),
  );
}

/** เติม select สมาชิกและบอร์ดเกม โดยคงค่าที่เลือกไว้เดิมถ้ายังมีอยู่ */
function fillSelects() {
  const memberSel = $("borrow-member");
  const prevMember = memberSel.value;
  memberSel.replaceChildren(
    new Option("-- เลือกสมาชิก --", ""),
    ...state.members.map((m) => new Option(m.name, m.id)),
  );
  memberSel.value = prevMember;

  const gameSel = $("borrow-game");
  const prevGame = gameSel.value;
  gameSel.replaceChildren(
    new Option("-- เลือกบอร์ดเกม --", ""),
    ...state.allGames.map(
      (g) =>
        new Option(
          state.borrowedGameIds.has(g.id) ? `${g.name} (ถูกยืมอยู่)` : g.name,
          g.id,
        ),
    ),
  );
  gameSel.value = prevGame;
}

// ==========================================================
// 5. POST / PUT: บอร์ดเกม
// ==========================================================

function validateGameForm() {
  const name = $("game-name").value.trim();
  const minRaw = $("game-min").value.trim();
  const maxRaw = $("game-max").value.trim();
  const minN = Number(minRaw);
  const maxN = Number(maxRaw);
  let ok = true;

  setFieldError("game-name", "");
  setFieldError("game-min", "");
  setFieldError("game-max", "");

  if (!name) {
    setFieldError("game-name", "กรุณาระบุชื่อเกม");
    ok = false;
  } else if (name.length > 150) {
    setFieldError("game-name", "ชื่อเกมต้องไม่เกิน 150 ตัวอักษร");
    ok = false;
  }
  if (minRaw === "" || !Number.isInteger(minN) || minN < 1) {
    setFieldError("game-min", "ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");
    ok = false;
  }
  if (maxRaw === "" || !Number.isInteger(maxN) || maxN < 1) {
    setFieldError("game-max", "ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");
    ok = false;
  }
  if (ok && minN > maxN) {
    setFieldError("game-max", "ต้องไม่น้อยกว่าผู้เล่นขั้นต่ำ");
    ok = false;
  }
  return ok;
}
/** ฟังก์ชันรีเซ็ตฟอร์มบอร์ดเกม */
function resetGameForm() {
  const form = $("game-form");
  form.reset();
  $("game-id").value = "";
  clearFieldErrors(form);
  $("game-form-title").textContent = "เพิ่มบอร์ดเกมใหม่";
  $("game-cancel").hidden = true;
}
/** ฟังก์ชันเริ่มแก้ไขบอร์ดเกม */
function startEditGame(game) {
  $("game-id").value = game.id;
  $("game-name").value = game.name;
  $("game-min").value = game.minPlayers;
  $("game-max").value = game.maxPlayers;
  $("game-form-title").textContent = `แก้ไขบอร์ดเกม: ${game.name}`;
  $("game-cancel").hidden = false;
  clearFieldErrors($("game-form"));
  $("game-name").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
/** ฟังก์ชันลบบอร์ดเกม */
async function deleteGame(game) {
  if (
    !confirm(
      `ลบบอร์ดเกม "${game.name}" ใช่หรือไม่?\nประวัติการยืมของเกมนี้จะถูกลบไปด้วย`,
    )
  )
    return;
  setStatus("กำลังลบบอร์ดเกม...", "loading");
  try {
    await apiFetch(`/boardgames/${game.id}`, { method: "DELETE" });
    if (Number($("game-id").value) === game.id) resetGameForm();
    setStatus("ลบบอร์ดเกมสำเร็จ", "success");
  } catch (err) {
    setStatus(err.message, "error");
  }
  await loadAll();
}
/* ฟังก์ชันเรียก API พร้อม retry และ exponential backoff */
$("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = $("search-players").value.trim();
  const n = Number(raw);
  if (raw === "" || !Number.isInteger(n) || n < 1) {
    setFieldError(
      "search-players",
      "กรุณาระบุจำนวนผู้เล่นเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป",
    );
    return;
  }
  setFieldError("search-players", "");
  state.searchPlayers = n;
  await loadGameTable();
});
/** ฟังก์ชันรีเซ็ตการค้นหา */
$("search-reset").addEventListener("click", async () => {
  state.searchPlayers = null;
  $("search-players").value = "";
  setFieldError("search-players", "");
  await loadGameTable();
});
/* ฟังก์ชันเรียก API ภายนอกพร้อม retry และ exponential backoff */
$("game-cancel").addEventListener("click", resetGameForm);

$("game-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateGameForm()) {
    setStatus("กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง", "error");
    return;
  }

  setStatus("กำลังบันทึกบอร์ดเกม...", "loading");
  const id = Number($("game-id").value) || null;
  const body = JSON.stringify({
    name: $("game-name").value.trim(),
    minPlayers: Number($("game-min").value),
    maxPlayers: Number($("game-max").value),
  });

  const btn = $("game-submit");
  btn.disabled = true;
  try {
    if (id) {
      await apiFetch(`/boardgames/${id}`, {
        method: "PUT",
        headers: JSON_HEADERS,
        body,
      });
      setStatus("แก้ไขบอร์ดเกมสำเร็จ", "success");
    } else {
      await apiFetch("/boardgames", {
        method: "POST",
        headers: JSON_HEADERS,
        body,
      });
      setStatus("เพิ่มบอร์ดเกมสำเร็จ", "success");
    }
    resetGameForm();
  } catch (err) {
    if (err.code === "DUPLICATE_NAME") setFieldError("game-name", err.message);
    setStatus(err.message, "error");
  } finally {
    btn.disabled = false;
  }
  await loadAll();
});

// ==========================================================
// 6. POST / DELETE: สมาชิก
// ==========================================================
/** ฟังก์ชันตรวจสอบฟอร์มสมาชิก */
$("member-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const name = $("member-name").value.trim();
  const email = $("member-email").value.trim();
  const phone = $("member-phone").value.trim();
  const EMAIL_RE = /^\S+@\S+\.\S+$/;
  let ok = true;

  clearFieldErrors(form);
  if (!name) {
    setFieldError("member-name", "กรุณาระบุชื่อ-นามสกุล");
    ok = false;
  } else if (name.length > 100) {
    setFieldError("member-name", "ชื่อต้องไม่เกิน 100 ตัวอักษร");
    ok = false;
  }

  if (!email) {
    setFieldError("member-email", "กรุณาระบุอีเมล");
    ok = false;
  } else if (!EMAIL_RE.test(email)) {
    setFieldError("member-email", "รูปแบบอีเมลไม่ถูกต้อง");
    ok = false;
  } else if (email.length > 100) {
    setFieldError("member-email", "อีเมลต้องไม่เกิน 100 ตัวอักษร");
    ok = false;
  }

  if (!phone) {
    setFieldError("member-phone", "กรุณาระบุเบอร์โทรศัพท์");
    ok = false;
  } else if (phone.length > 20) {
    setFieldError("member-phone", "เบอร์โทรต้องไม่เกิน 20 ตัวอักษร");
    ok = false;
  }

  if (!ok) {
    setStatus("กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง", "error");
    return;
  }

  setStatus("กำลังบันทึกสมาชิก...", "loading");
  const btn = $("member-submit");
  btn.disabled = true;
  try {
    await apiFetch("/members", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name, email, phone }),
    });
    form.reset();
    setStatus("เพิ่มสมาชิกสำเร็จ", "success");
  } catch (err) {
    if (err.code === "DUPLICATE_EMAIL")
      setFieldError("member-email", err.message);
    setStatus(err.message, "error");
  } finally {
    btn.disabled = false;
  }
  await loadAll();
});

/** GET ประวัติการยืมของสมาชิก */
async function showHistory(member) {
  const tbody = $("history-body");
  $("history-title").textContent = `ประวัติการยืมของ ${member.name}`;
  $("member-history").hidden = false;
  tbody.replaceChildren(messageRow(4, "กำลังโหลดประวัติ...", "loading"));
  try {
    const res = await apiFetch(`/members/${member.id}/borrowings`);
    if (res.data.length === 0) {
      tbody.replaceChildren(messageRow(4, "สมาชิกคนนี้ยังไม่เคยยืมบอร์ดเกม"));
      return;
    }
    tbody.replaceChildren(
      ...res.data.map((r) => {
        const tr = document.createElement("tr");
        tr.append(
          cell(r.boardgameName),
          cell(r.borrowDate),
          cell(r.returnDate || "-"),
          badge(r.status, statusLabel(r.status)),
        );
        return tr;
      }),
    );
  } catch (err) {
    tbody.replaceChildren(
      messageRow(4, `โหลดประวัติไม่สำเร็จ: ${err.message}`, "error"),
    );
  }
}

async function deleteMember(member) {
  if (
    !confirm(
      `ลบสมาชิก "${member.name}" ใช่หรือไม่?\nประวัติการยืมของสมาชิกคนนี้จะถูกลบไปด้วย`,
    )
  )
    return;
  setStatus("กำลังลบสมาชิก...", "loading");
  try {
    await apiFetch(`/members/${member.id}`, { method: "DELETE" });
    $("member-history").hidden = true;
    setStatus("ลบสมาชิกสำเร็จ", "success");
  } catch (err) {
    setStatus(err.message, "error");
  }
  await loadAll();
}

$("history-close").addEventListener("click", () => {
  $("member-history").hidden = true;
});

// ==========================================================
// 7. POST / PATCH: ยืม-คืน
// ==========================================================

$("borrow-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const memberId = $("borrow-member").value;
  const boardgameId = $("borrow-game").value;
  const borrowDate = $("borrow-date").value;

  setFieldError("borrow-member", memberId ? "" : "กรุณาเลือกสมาชิก");
  setFieldError("borrow-game", boardgameId ? "" : "กรุณาเลือกบอร์ดเกม");
  setFieldError("borrow-date", "");
  if (!memberId || !boardgameId) {
    setStatus("กรุณาเลือกสมาชิกและบอร์ดเกมให้ครบถ้วน", "error");
    return;
  }

  setStatus("กำลังบันทึกการยืม...", "loading");
  const payload = {
    memberId: Number(memberId),
    boardgameId: Number(boardgameId),
  };
  if (borrowDate) payload.borrowDate = borrowDate;

  const btn = $("borrow-submit");
  btn.disabled = true;
  try {
    await apiFetch("/borrowings", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
    form.reset();
    setStatus("บันทึกการยืมสำเร็จ", "success");
  } catch (err) {
    if (err.code === "GAME_NOT_AVAILABLE")
      setFieldError("borrow-game", err.message);
    setStatus(err.message, "error");
  } finally {
    btn.disabled = false;
  }
  await loadAll();
});

async function returnGame(record) {
  setStatus("กำลังบันทึกการคืน...", "loading");
  const body = JSON.stringify({});
  try {
    const res = await apiFetch(`/borrowings/${record.id}/return`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body,
    });
    setStatus(res.message, "success");
  } catch (err) {
    setStatus(err.message, "error");
  }
  await loadAll();
}

$("borrow-from").addEventListener("change", loadBorrowings);
$("borrow-to").addEventListener("change", loadBorrowings);

// ==========================================================
// 8. แท็บ และการเริ่มต้นหน้า
// ==========================================================
/* ฟังก์ชันจัดการการคลิกแท็บ: ซ่อน/แสดง panel ตามแท็บที่เลือก */
document.querySelectorAll(".tabs button").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".tabs button")
      .forEach((t) => t.classList.toggle("active", t === tab));
    document
      .querySelectorAll(".panel")
      .forEach((p) =>
        p.classList.toggle("active", p.id === `panel-${tab.dataset.tab}`),
      );
  });
});

(async function init() {
  setStatus("กำลังโหลดข้อมูลจากเซิร์ฟเวอร์...", "loading");
  await loadAll();
  if (!$("status").classList.contains("error")) setStatus("");
})();

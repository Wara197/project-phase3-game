/**
 * ไฟล์ฟังก์ชันตรวจสอบความถูกต้องของข้อมูล (Validation)
 *
 * - เป็นฟังก์ชันล้วน (pure function) คือรับค่าเข้ามา คืนค่าออกไป ไม่แตะฐานข้อมูลและไม่ใช้ Express
 * - ใช้ร่วมกันระหว่าง routes ใน index.js และ unit test ในโฟลเดอร์ test/
 */

// ความยาวสูงสุดของแต่ละฟิลด์ (ตัวอักษร) ต้องตรงกับขนาดคอลัมน์ในฐานข้อมูลด้วย
const LIMITS = {
  boardgameName: 150,
  memberName: 100,
  memberEmail: 100,
  memberPhone: 20,
};

/**
 * แปลงค่าให้เป็น "จำนวนเต็มบวก" (ตัวเลข 1, 2, 3, ...)
 * รับได้ทั้ง number และ string เช่น 5 หรือ "5"
 * ถ้าแปลงไม่ได้ หรือไม่ใช่จำนวนเต็มบวก จะคืนค่า null
 */
const toPosInt = (value) => {
  // ขั้นที่ 1: รับเฉพาะ number หรือ string เท่านั้น ค่าอื่น (เช่น undefined, object, boolean) ไม่ผ่าน
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  // ขั้นที่ 2: string ที่มีแต่ช่องว่าง ถือว่าไม่มีค่า
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  // ขั้นที่ 3: แปลงเป็นตัวเลข
  const n = Number(value);

  // ขั้นที่ 4: ต้องเป็นจำนวนเต็ม และต้องมากกว่า 0
  if (Number.isInteger(n) && n > 0) {
    return n;
  }
  return null;
};

/**
 * ตรวจว่าค่าเป็นวันที่รูปแบบ YYYY-MM-DD และเป็นวันที่ที่มีอยู่จริง
 * เช่น "2026-02-30" รูปแบบถูกต้อง แต่ไม่มีวันที่ 30 เดือนกุมภาพันธ์ จึงไม่ผ่าน
 */
const isDate = (value) => {
  // ขั้นที่ 1: ต้องเป็น string
  if (typeof value !== "string") {
    return false;
  }

  // ขั้นที่ 2: ต้องมีรูปแบบ ปี 4 หลัก - เดือน 2 หลัก - วัน 2 หลัก
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  // ขั้นที่ 3: แยกปี เดือน วัน ออกมาเป็นตัวเลข
  const [year, month, day] = value.split("-").map(Number);

  // ขั้นที่ 4: สร้าง Date จากค่าที่แยกได้ แล้วดูว่าได้วันที่เดิมกลับมาหรือไม่
  // ถ้าวันที่ไม่มีอยู่จริง เช่น 30 ก.พ. Date จะเลื่อนไปเป็นวันอื่น ทำให้ค่าไม่ตรงกัน
  // เดือนใน Date เริ่มนับจาก 0 จึงต้อง -1
  const date = new Date(Date.UTC(year, month - 1, day));
  const isSameYear = date.getUTCFullYear() === year;
  const isSameMonth = date.getUTCMonth() === month - 1;
  const isSameDay = date.getUTCDate() === day;

  return isSameYear && isSameMonth && isSameDay;
};

/**
 * ตรวจว่าเป็นรูปแบบอีเมลพื้นฐานหรือไม่ คือมีตัวอักษรที่ไม่ใช่ช่องว่าง + "@" + โดเมนที่มี "."
 */
const isEmail = (value) => {
  if (typeof value !== "string") {
    return false;
  }
  return /^\S+@\S+\.\S+$/.test(value);
};

/** เติมเลข 0 ข้างหน้าให้ครบ 2 หลัก เช่น 5 => "05" */
const padTwoDigits = (n) => String(n).padStart(2, "0");

/**
 * คืนวันที่ปัจจุบันตาม "เวลาท้องถิ่นของเซิร์ฟเวอร์" ในรูปแบบ YYYY-MM-DD
 *
 * หมายเหตุ: ไม่ใช้ toISOString() เพราะมันเป็นเวลา UTC
 * ถ้าใช้จะทำให้วันที่เพี้ยนในช่วง 00:00-07:00 ของประเทศไทย (ซึ่งเร็วกว่า UTC 7 ชั่วโมง)
 */
const todayStr = (date = new Date()) => {
  const year = date.getFullYear();
  const month = padTwoDigits(date.getMonth() + 1); // getMonth() เริ่มนับจาก 0 จึงต้อง +1
  const day = padTwoDigits(date.getDate());
  return `${year}-${month}-${day}`;
};

/** ตรวจว่าค่าเป็นค่าว่าง คือไม่ใช่ string หรือเป็น string ที่มีแต่ช่องว่าง */
const isBlank = (value) => {
  if (typeof value !== "string") {
    return true;
  }
  return value.trim() === "";
};

/**
 * ตรวจข้อมูลบอร์ดเกมก่อนบันทึก
 * คืนข้อความ error (string) ถ้าข้อมูลไม่ถูกต้อง หรือคืน null ถ้าข้อมูลถูกต้องทั้งหมด
 */
const validateBoardgame = (body) => {
  const { name, minPlayers, maxPlayers } = body || {};

  // ตรวจว่าใส่ข้อมูลครบหรือไม่
  if (isBlank(name) || minPlayers === undefined || maxPlayers === undefined) {
    return "กรุณาระบุ name, minPlayers, maxPlayers ให้ครบถ้วน";
  }

  // ตรวจความยาวชื่อ (ตัดช่องว่างหัวท้ายออกก่อนนับ)
  if (name.trim().length > LIMITS.boardgameName) {
    return `name ต้องมีความยาวไม่เกิน ${LIMITS.boardgameName} ตัวอักษร`;
  }

  // ตรวจว่าจำนวนผู้เล่นเป็นตัวเลขจำนวนเต็ม
  if (!Number.isInteger(minPlayers) || !Number.isInteger(maxPlayers)) {
    return "minPlayers และ maxPlayers ต้องเป็นจำนวนเต็ม";
  }

  // ตรวจช่วงจำนวนผู้เล่น: ต้องเริ่มจาก 1 และ min ต้องไม่มากกว่า max
  if (minPlayers < 1 || minPlayers > maxPlayers) {
    return "ต้องมี 1 <= minPlayers <= maxPlayers";
  }

  return null; // ผ่านทุกเงื่อนไข
};

/**
 * ตรวจข้อมูลสมาชิกก่อนบันทึก
 * คืนข้อความ error (string) ถ้าข้อมูลไม่ถูกต้อง หรือคืน null ถ้าถูกต้อง
 */
const validateMember = (body) => {
  const { name, email, phone } = body || {};

  // ตรวจว่าใส่ข้อมูลครบหรือไม่
  if (isBlank(name) || isBlank(email) || isBlank(phone)) {
    return "กรุณาระบุ name, email, phone ให้ครบถ้วน";
  }

  // ตรวจความยาวของแต่ละฟิลด์
  if (name.trim().length > LIMITS.memberName) {
    return `name ต้องมีความยาวไม่เกิน ${LIMITS.memberName} ตัวอักษร`;
  }
  if (email.length > LIMITS.memberEmail) {
    return `email ต้องมีความยาวไม่เกิน ${LIMITS.memberEmail} ตัวอักษร`;
  }
  if (phone.length > LIMITS.memberPhone) {
    return `phone ต้องมีความยาวไม่เกิน ${LIMITS.memberPhone} ตัวอักษร`;
  }

  // ตรวจรูปแบบอีเมล
  if (!isEmail(email)) {
    return "รูปแบบ email ไม่ถูกต้อง";
  }

  return null; // ผ่านทุกเงื่อนไข
};

module.exports = {
  LIMITS,
  toPosInt,
  isDate,
  isEmail,
  todayStr,
  validateBoardgame,
  validateMember,
};

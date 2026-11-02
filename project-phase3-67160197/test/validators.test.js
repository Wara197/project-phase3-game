const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  toPosInt,
  isDate,
  isEmail,
  todayStr,
  validateBoardgame,
  validateMember,
} = require("../src/validators");

describe("toPosInt", () => {
  it("คืนจำนวนเต็มบวกสำหรับ number และ numeric string", () => {
    assert.equal(toPosInt(3), 3);
    assert.equal(toPosInt("4"), 4);
  });

  it("คืน null สำหรับค่าที่ไม่ใช่จำนวนเต็มบวก", () => {
    for (const v of [0, -1, "0", "-1", "1.5", "abc", "", "   ", true, null, undefined, {}]) {
      assert.equal(toPosInt(v), null, `ควรเป็น null เมื่อ input = ${JSON.stringify(v)}`);
    }
  });
});

describe("isDate", () => {
  it("ยอมรับวันที่รูปแบบ YYYY-MM-DD ที่มีอยู่จริง", () => {
    assert.equal(isDate("2026-10-25"), true);
    assert.equal(isDate("2024-02-29"), true); // ปีอธิกสุรทิน
  });

  it("ปฏิเสธวันที่ที่ไม่มีอยู่จริง", () => {
    assert.equal(isDate("2026-02-30"), false);
    assert.equal(isDate("2023-02-29"), false);
    assert.equal(isDate("2026-13-01"), false);
  });

  it("ปฏิเสธรูปแบบที่ไม่ถูกต้องและชนิดข้อมูลที่ไม่ใช่ string", () => {
    assert.equal(isDate("25-10-2026"), false);
    assert.equal(isDate("2026-1-5"), false);
    assert.equal(isDate(20261025), false);
    assert.equal(isDate(undefined), false);
  });
});

describe("isEmail", () => {
  it("ตรวจรูปแบบอีเมลพื้นฐาน", () => {
    assert.equal(isEmail("a@b.co"), true);
    assert.equal(isEmail("bad"), false);
    assert.equal(isEmail("a b@c.d"), false);
    assert.equal(isEmail(undefined), false);
  });
});

describe("todayStr", () => {
  it("ใช้วันที่ตามเวลาท้องถิ่น ไม่ใช่ UTC (กัน bug วันเพี้ยนช่วงเช้าในไทย)", () => {
    // 01:30 น. เวลาท้องถิ่น: ถ้าใช้ UTC จะได้วันก่อนหน้า
    assert.equal(todayStr(new Date(2026, 0, 5, 1, 30)), "2026-01-05");
    assert.equal(todayStr(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
  });

  it("เติม 0 นำหน้าเดือนและวันให้เป็นสองหลัก", () => {
    assert.equal(todayStr(new Date(2026, 2, 9)), "2026-03-09");
  });

  it("ค่าเริ่มต้นเป็นวันที่ปัจจุบันในรูปแบบ YYYY-MM-DD", () => {
    assert.match(todayStr(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("validateBoardgame", () => {
  const valid = { name: "Catan", minPlayers: 3, maxPlayers: 4 };

  it("คืน null เมื่อข้อมูลถูกต้อง", () => {
    assert.equal(validateBoardgame(valid), null);
    assert.equal(validateBoardgame({ ...valid, name: "x".repeat(150) }), null);
  });

  it("รองรับ body เป็น undefined (Express 5 ไม่ใส่ {} ให้อัตโนมัติ)", () => {
    assert.match(validateBoardgame(undefined), /ครบถ้วน/);
  });

  it("ตรวจฟิลด์ที่หายไปหรือเป็นชื่อว่าง", () => {
    assert.match(validateBoardgame({ minPlayers: 1, maxPlayers: 2 }), /ครบถ้วน/);
    assert.match(validateBoardgame({ ...valid, name: "   " }), /ครบถ้วน/);
    assert.match(validateBoardgame({ name: "A", maxPlayers: 2 }), /ครบถ้วน/);
  });

  it("ตรวจความยาวชื่อไม่เกิน 150 ตัวอักษร", () => {
    assert.match(validateBoardgame({ ...valid, name: "x".repeat(151) }), /150/);
  });

  it("ตรวจชนิดข้อมูลของจำนวนผู้เล่นต้องเป็นจำนวนเต็ม", () => {
    assert.match(validateBoardgame({ ...valid, minPlayers: "3" }), /จำนวนเต็ม/);
    assert.match(validateBoardgame({ ...valid, maxPlayers: 2.5 }), /จำนวนเต็ม/);
  });

  it("ตรวจช่วงจำนวนผู้เล่น 1 <= min <= max", () => {
    assert.match(validateBoardgame({ ...valid, minPlayers: 0 }), /1 <= minPlayers/);
    assert.match(validateBoardgame({ name: "A", minPlayers: 5, maxPlayers: 2 }), /1 <= minPlayers/);
  });
});

describe("validateMember", () => {
  const valid = { name: "สมชาย", email: "somchai@example.com", phone: "0891234567" };

  it("คืน null เมื่อข้อมูลถูกต้อง", () => {
    assert.equal(validateMember(valid), null);
  });

  it("รองรับ body เป็น undefined", () => {
    assert.match(validateMember(undefined), /ครบถ้วน/);
  });

  it("ตรวจฟิลด์ที่หายไปหรือไม่ใช่ string", () => {
    assert.match(validateMember({ ...valid, phone: "" }), /ครบถ้วน/);
    assert.match(validateMember({ ...valid, email: 123 }), /ครบถ้วน/);
  });

  it("ตรวจความยาวของ name, email, phone", () => {
    assert.match(validateMember({ ...valid, name: "n".repeat(101) }), /name/);
    assert.match(validateMember({ ...valid, email: "a".repeat(96) + "@b.com" }), /email/);
    assert.match(validateMember({ ...valid, phone: "1".repeat(21) }), /phone/);
  });

  it("ตรวจรูปแบบ email", () => {
    assert.match(validateMember({ ...valid, email: "not-an-email" }), /รูปแบบ email/);
  });
});

# รายงาน Test Coverage Baseline — ระยะที่ 3

**โครงงาน:** ระบบยืม-คืนบอร์ดเกม (Boardgame Service API) — รหัสนิสิต 67160197
**คำสั่ง:** `npm test`

---

## 1. สรุปผล

| รายการ             | ผล  |
| ------------------ | --- |
| จำนวน test ทั้งหมด | 35  |
| ผ่าน               | 35  |
| ล้มเหลว            | 0   |
| ข้าม / ค้าง        | 0   |

## 2. Coverage ของโมดูลที่ทดสอบอัตโนมัติ

| ไฟล์                           | Line % | Branch % | Function % | บรรทัดที่ยังไม่ถูกทดสอบ |
| ------------------------------ | -----: | -------: | ---------: | ----------------------- |
| `src/validators.js`            | 100.00 |   100.00 |     100.00 | —                       |
| `src/services/external-api.js` | 100.00 |   100.00 |     100.00 | —                       |

> หมายเหตุ: ตัวเลขนี้วัดเฉพาะไฟล์ที่ถูก unit test โดยตรงเท่านั้น ไม่ได้เป็นตัวแทน coverage ของทั้งระบบ

## 3. ส่วนที่ยังไม่มี test อัตโนมัติ (ตรงตามที่ต้องรายงาน)

| ส่วน                               | ไฟล์              | สถานะ              | เหตุผล / แนวทาง                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REST routes (17 route รวม `GET /`) | `src/index.js`    | **0% (automated)** | ต้องติดตั้ง express และเชื่อม MySQL จริง ในสภาพแวดล้อมที่ทำงานอยู่ไม่สามารถติดตั้ง dependencies ได้ จึงยังไม่มี integration test. ทดสอบแบบ manual ด้วย Postman collection (37 requests ครอบคลุม 16 operation ใน openapi.yaml และ 404 fallback; ยกเว้น `GET /` ซึ่งไม่ได้อยู่ใน collection) |
| การเชื่อมต่อฐานข้อมูล              | `src/db.js`       | 0% (automated)     | ทดสอบผ่าน integration test ที่ต้องมี MySQL                                                                                                                                                                                                                                                 |
| หน้าเว็บ Frontend                  | `frontend/app.js` | 0% (automated)     | ยังไม่มี DOM test (เช่น jsdom / Playwright). ทดสอบ manual ตามขั้นตอนใน clo-requirements-checklist.md                                                                                                                                                                                       |

## 4. ชุดทดสอบที่มีในโปรเจกต์

### 4.1 `test/validators.test.js` (6 กลุ่ม, 20 test case)

- `toPosInt`: จำนวนเต็มบวก, ค่าไม่ถูกต้อง (0, ลบ, ทศนิยม, ค่าว่าง, boolean, null)
- `isDate`: วันที่ถูกต้อง, ปีอธิกสุรทิน, วันที่ไม่มีจริง (2026-02-30), รูปแบบผิด
- `isEmail`: รูปแบบอีเมล
- `todayStr`: ใช้เวลาท้องถิ่น (ป้องกันวันเพี้ยนจาก UTC ตอนเช้าในไทย), เติม 0 นำหน้า
- `validateBoardgame`: ฟิลด์หายไป, body เป็น undefined, ความยาวชื่อ, ชนิดข้อมูล, ช่วง min/max
- `validateMember`: ฟิลด์หายไป, ความยาว name/email/phone, รูปแบบ email

### 4.2 `test/external-api.test.js` (3 กลุ่ม, 15 test case)

- `requestWithRetry`: สำเร็จทันที, retry เมื่อ 5xx, ไม่ retry เมื่อ 4xx, หยุดที่จำนวนสูงสุด, network error, timeout, exponential backoff, อ่านค่าจาก environment variable
- `sendNotification`: ส่ง POST พร้อม header/body, ใช้ opts และ env, encode topic, Fallback เมื่อล้มเหลว, ดักข้อผิดพลาดที่ไม่คาดคิด
- `notifyBorrowed` / `notifyReturned`: ข้อความและ header ถูกต้อง

## 5. ข้อบกพร่องที่ค้นพบจากการทดสอบและแก้ไขแล้ว

| #   | ไฟล์                           | ปัญหา                                                                                                   | การแก้ไข                                         | ตรวจพบจาก                             |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| 1   | `src/services/external-api.js` | เมื่อหยุด retry ก่อนกำหนด (4xx) ระบบรายงาน `attempts` เป็นจำนวนสูงสุด (3) ทั้งที่เรียกจริงเพียง 1 ครั้ง | เก็บจำนวนครั้งที่ทำจริงใน `attemptsMade`         | `external-api.test.js` (4xx)          |
| 2   | `src/index.js`                 | Express 5 ไม่สร้าง `req.body` ให้เป็น `{}` เมื่อไม่มี body ทำให้ destructuring ล้มเหลวเป็น 500          | ใช้ `req.body \|\| {}` ทุก route และ validator   | `validators.test.js` (body undefined) |
| 3   | `src/index.js`                 | วันที่ default ใช้ `toISOString()` (UTC) ทำให้วันที่ผิดในช่วง 00:00-07:00 ของไทย                        | เพิ่ม `todayStr()` ที่ใช้เวลาท้องถิ่น            | `validators.test.js` (todayStr)       |
| 4   | `src/validators.js`            | `isDate("2026-02-30")` ผ่านการตรวจ ทำให้ MySQL ปฏิเสธและกลายเป็น 500                                    | ตรวจด้วยการแปลงกลับเป็นวันที่                    | `validators.test.js` (isDate)         |
| 5   | `src/index.js`                 | ชื่อ/อีเมล/เบอร์ยาวเกินคอลัมน์ทำให้ MySQL error → 500                                                   | เพิ่ม validation ความยาวคืน 400 VALIDATION_ERROR | `validators.test.js` (ความยาว)        |
| 6   | `src/index.js`                 | ไม่มี route `GET /api/v1/external/notify` ทั้งที่ openapi.yaml และ Postman ระบุไว้                      | เพิ่ม route และคืน 200 / 400 / 503 ตามสัญญา      | Swagger/Code match check              |

## 6. ข้อจำกัดและข้อเสนอแนะ

- ตัวเลขใน section 2 เป็นเพียง baseline ของ unit test ยังไม่ใช่ coverage ทั้งระบบ
- เพื่อให้ได้ตัวเลข coverage ของ routes จริง ควรเพิ่ม integration test ด้วย `supertest` พร้อม MySQL test database แล้วเพิ่ม `--experimental-test-coverage` ให้ครอบคลุม `src/index.js`
- `failure-scenario-results.md` ระบุว่า TC-EXT-02 ผ่านแล้ว แต่ในโค้ดระยะที่ 2 ยังไม่มี route notify จึงควรรันซ้ำหลัง route ถูกเพิ่มเพื่ออัปเดตผล

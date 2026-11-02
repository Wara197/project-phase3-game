# Checklist ตรวจสอบ CLO Requirements — โครงงานระยะที่ 3

**รหัสนิสิต:** 67160197 · **โครงงาน:** ระบบยืม-คืนบอร์ดเกม
**สถานะ:** ครบ = ทำแล้วและมีหลักฐาน · ต้องยืนยัน = ทำแล้วแต่ยังต้องรันจริงยืนยัน · ยังไม่ได้ทำ

---

## CLO8 (PLO14) — Final Integration (5 คะแนน)

| #   | ข้อกำหนด                                                              | สถานะ | หลักฐานอ้างอิง                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------- | :---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1 | รวมโมดูลจากระยะที่ 1-2 และ Microservices (external-api) เป็นระบบเดียว |  ครบ   | `src/index.js` (รวม routes ทั้งหมด), `src/db.js`, `src/validators.js`, `src/services/external-api.js`                                                                                                     |
| 8.2 | ไม่มี merge conflict หลงเหลือ                                         |  ครบ   | ค้นหา conflict marker ทั้งโปรเจกต์แล้วไม่พบ; โครงสร้างไฟล์ทั้งหมดอยู่ใน `src/`, `db/`, `docs/` ไม่มีไฟล์ซ้ำซ้อน                                                                                           |
| 8.3 | ระบบรันได้จริง (ไม่มี error หลงเหลือ)                                 |  ครบ   | รัน `npm start` แล้วเซิร์ฟเวอร์ขึ้นที่ port 3000 (API, `/api-docs`, `/app`); unit test ผ่าน 35/35; หน้าเว็บแสดงข้อมูลจาก MySQL ได้                                                                                     |
| 8.4 | Swagger/Code Match: endpoint ใน openapi.yaml ตรงกับโค้ด               |  ครบ   | ตรวจด้วยสคริปต์เปรียบเทียบ `app.METHOD(path)` ใน `src/index.js` กับ `paths` ใน `openapi.yaml`: ตรงกัน 16/16 operation; route `GET /` เพิ่มเข้า openapi แล้ว; `GET /api/v1/external/notify` ถูกเพิ่มในโค้ด |
| 8.5 | อัปเดต openapi.yaml ให้ครอบคลุม endpoint จาก Microservices            |  ครบ   | `openapi.yaml` (version 3.0.0) มี path `/api/v1/external/notify` พร้อม response 200 / 400 / 503                                                                                                           |
| 8.6 | รายงาน Test Coverage Baseline                                         |  ครบ   | `coverage-report.md` (validators.js และ external-api.js 100%, routes ยังไม่มี automated test ระบุไว้ชัดเจน)                                                                                               |
| 8.7 | Checklist CLO ครบพร้อมหลักฐาน                                         |  ครบ   | ไฟล์นี้                                                                                                                                                                                                   |

**ขั้นตอนการรันทั้งระบบ (8.3):**

1. `npm install` → `mysql -P 3307 < db/schema.sql` → `mysql -P 3307 < db/seed.sql`
2. `cp .env.example .env` และกรอกค่า DB
3. `npm start` แล้ว import `postman_collection.json` รันทั้ง collection

---

## CLO6 (PLO10) — Client-Facing Frontend (10 คะแนน)

### 6.A เรียกใช้ API จริง อย่างน้อย 3 endpoint รวม GET และ POST/PUT/DELETE (4 คะแนน)

| Endpoint                         | Method     | ใช้ที่ไหนใน frontend         | หลักฐาน (`frontend/app.js`)             |
| -------------------------------- | ---------- | ---------------------------- | --------------------------------------- |
| `/api/v1/boardgames`             | GET        | โหลดรายการบอร์ดเกม           | `loadLookups`, `loadGameTable`          |
| `/api/v1/boardgames?players=N`   | GET        | ค้นหาตามจำนวนผู้เล่น         | `loadGameTable`, `#search-form` submit  |
| `/api/v1/boardgames`             | POST       | เพิ่มบอร์ดเกม                | `#game-form` submit                     |
| `/api/v1/boardgames/:id`         | PUT        | แก้ไขบอร์ดเกม                | `#game-form` submit                     |
| `/api/v1/boardgames/:id`         | DELETE     | ลบบอร์ดเกม                   | `deleteGame`                            |
| `/api/v1/members`                | GET / POST | รายชื่อ / เพิ่มสมาชิก        | `loadLookups`, `#member-form` submit    |
| `/api/v1/members/:id`            | DELETE     | ลบสมาชิก                     | `deleteMember`                          |
| `/api/v1/members/:id/borrowings` | GET        | ประวัติการยืมของสมาชิก       | `showHistory`                           |
| `/api/v1/borrowings`             | GET / POST | รายการยืม-คืน (กรองด้วยสถานะและช่วงวันที่ยืม) / บันทึกการยืม | `loadBorrowings`, `#borrow-form` submit |
| `/api/v1/borrowings/:id/return`  | PATCH      | คืนบอร์ดเกม (ไม่ส่งวันที่ = ใช้วันปัจจุบัน) | `returnGame`                            |

เกินเกณฑ์ขั้นต่ำ (เรียก 11 operation บน 7 path, ครบ method ที่ต้องการ: GET, POST, PUT, PATCH, DELETE)

### 6.B การออกแบบหน้าจอ + สถานะ loading/error (3 คะแนน)

| รายการ                                                              | หลักฐาน                                                                                                                                           | สถานะ |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | :---: |
| แสดงข้อมูลเป็นตารางอ่านง่าย มีป้ายสถานะ: บอร์ดเกม "พร้อมให้ยืม / ถูกยืมอยู่" และรายการยืม-คืน "กำลังยืม / คืนแล้ว" | `renderGames`, `renderBorrowings`, `statusLabel`, `badge()` ใน `frontend/app.js` และ `.badge` ใน `frontend/styles.css` | ครบ |
| สถานะ loading ทั้งแถบข้อความและในตาราง                              | `showStatus`, `tableMessage(... "กำลังโหลด…")` (~161, ~177, ~554)                                                                                 |  ครบ   |
| สถานะ error ชัดเจน ไม่ค้างเงียบ (ทั้ง HTTP error และ network error) | `api()` คืน `ApiError` พร้อมข้อความจาก server หรือ "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"; แสดงผลที่ `tableMessage(..., "error")` และ `showStatus("error")` |  ครบ   |
| ปุ่มกันการกดซ้ำและแสดงสถานะระหว่างบันทึก                            | `withBusy` ใช้กับทุกปุ่ม submit                                                                                                                   |  ครบ   |
| Feedback เมื่อสำเร็จ                                                | `showStatus("success")` หายเองหลัง 3.5 วินาที                                                                                                     |  ครบ   |
| ตัวกรองรายการยืม-คืนทำงานทันทีเมื่อเปลี่ยนค่า (สถานะ, ยืมตั้งแต่, ยืมถึง) และเคลียร์ตัวกรองได้ | `loadBorrowings` และ listener ของ `#borrow-filter`, `#borrow-from`, `#borrow-to` | ครบ |
| หน้าเว็บให้บริการจากระบบเดียวกัน                                    | `src/index.js` บรรทัด 49: `app.use("/app", express.static(...))`                                                                                  |  ครบ   |

### 6.C แบบฟอร์มและการตรวจสอบความถูกต้องฝั่ง Frontend (3 คะแนน)

| แบบฟอร์ม                                                                   | กฎที่ตรวจก่อนส่ง                                              | หลักฐาน               | สถานะ |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------- | :---: |
| เพิ่ม/แก้ไขบอร์ดเกม                                                        | ชื่อไม่ว่างและไม่เกิน 150; ผู้เล่นเป็นจำนวนเต็ม ≥1; min ≤ max | `validateGameForm`    |  ครบ   |
| ค้นหาตามจำนวนผู้เล่น                                                       | จำนวนเต็ม ≥1                                                  | `#search-form` submit |  ครบ   |
| เพิ่มสมาชิก                                                                | ชื่อ/เบอร์ไม่ว่างและความยาว; อีเมลรูปแบบถูกต้อง (`EMAIL_RE`)  | `#member-form` submit |  ครบ   |
| บันทึกการยืม                                                               | ต้องเลือกสมาชิกและบอร์ดเกม                                    | `#borrow-form` submit |  ครบ   |
| แสดงข้อผิดพลาดต่อช่องกรอก                                                  | `setFieldError` + `aria-invalid` ใน `frontend/styles.css`     | `setFieldError`       |  ครบ   |
| ตัวกรองรายการยืม-คืน (วันที่ยืมตั้งแต่/ถึง) | รูปแบบ YYYY-MM-DD ตรวจที่ server (`from`, `to`) | `loadBorrowings`, `isDate` ใน `src/index.js` | ครบ |
| Server ปฏิเสธซ้ำ (ชื่อซ้ำ/อีเมลซ้ำ/เกมถูกยืมอยู่) แสดงที่ช่องที่เกี่ยวข้อง | `DUPLICATE_NAME`, `DUPLICATE_EMAIL`, `GAME_NOT_AVAILABLE`     | ครบ                    |

---

## CLO7 (PLO13) — Project Defense (5 คะแนน)

การนำเสนอจะทำสดต่อหน้าผู้สอน ไฟล์นี้จึงเตรียมได้เฉพาะ "แผนการสาธิต" และ "ประเด็นคำถามที่ควรเตรียมตอบ"

### 7.A แผนการสาธิต (3-4 นาที)

1. เปิด server (`npm start`) แล้วเปิด `http://localhost:3000/app`
2. ค้นหาด้วยจำนวนผู้เล่น 4 → แสดงเกมที่รองรับ (Catan, Codenames)
3. เพิ่มบอร์ดเกมใหม่ โดยลองกรอก min > max ให้เห็นข้อความตรวจสอบ แล้วกรอกให้ถูกต้อง
4. ยืมเกมที่ว่าง → สถานะเปลี่ยนเป็น "ถูกยืมอยู่"
5. ลองยืมเกมเดิมซ้ำ → ได้ 409 "บอร์ดเกมนี้ถูกยืมอยู่ในขณะนี้"
6. คืนเกม → ป้ายเปลี่ยนเป็น "คืนแล้ว" และวันที่คืนเป็นวันปัจจุบัน แล้วคืนซ้ำได้ 409 "รายการนี้ถูกคืนไปแล้ว"
6.1 ในส่วนรายการยืม-คืน เลือกสถานะ และช่วง "ยืมตั้งแต่ / ยืมถึง" → ตารางแสดงเฉพาะรายการที่ตรงเงื่อนไข
7. (ทางเลือก) ตั้ง `EXTERNAL_TIMEOUT_MS=1` แล้วยืมเกม → แสดง log retry 3 ครั้ง และการยืมยังบันทึกสำเร็จ (Fallback)
8. เปิด `/api-docs` เพื่อแสดงว่าเอกสารตรงกับระบบ

### 7.B ประเด็นคำถามที่ควรเตรียมตอบ

- **Architecture:** Express 5 เป็น REST API; MySQL ผ่าน connection pool; frontend เป็น static ที่ให้บริการจาก server เดียวกัน จึงไม่ต้องพึ่ง CORS
- **ทำไมการยืมต้องใช้ transaction + `FOR UPDATE`:** unique key `(member_id, boardgame_id, borrow_date)` กันการยืมซ้ำของสมาชิกคนเดียวในวันเดียวกันเท่านั้น แต่ไม่กันสมาชิกสองคนยืมเกมเดียวกันพร้อมกัน จึงล็อกแถวของเกมไว้ระหว่างตรวจสอบและบันทึก
- **ทำไมใช้ 409 แทน 400 สำหรับเกมถูกยืม:** เป็นความขัดแย้งกับสถานะปัจจุบันของทรัพยากร ไม่ใช่ข้อมูลในคำขอผิดรูปแบบ
- **ทำไมลบบอร์ดเกม/สมาชิกแล้วประวัติหายด้วย:** เป็นการตัดสินใจตาม `ON DELETE CASCADE` ในสคีมา และแจ้งเตือนผู้ใช้ใน confirm dialog แล้ว; ในระบบจริงควรพิจารณา soft delete
- **Microservice/External API:** `external-api.js` ใช้ Timeout (AbortSignal), Retry เฉพาะ 5xx และ network error พร้อม exponential backoff, และ Fallback ที่ไม่ทำให้การยืม/คืนล้มเหลว เพราะแจ้งเตือนทำหลัง commit แล้ว
- **ปัญหาที่พบระหว่างพัฒนา:** เช่น Express 5 ไม่ให้ `req.body` เป็น `{}` อัตโนมัติ, วันที่ใช้ UTC ทำให้เพี้ยน, และ attempts ใน retry รายงานผิด (ดูรายละเอียดใน `coverage-report.md` ข้อ 5)
- **สิ่งที่จะทำต่อ:** integration test ด้วย supertest, authentication สำหรับผู้ดูแลระบบ, pagination

---

## สรุปคะแนนโดยประมาณ (ตามเกณฑ์ที่ผู้สอนกำหนด)

| ส่วน                              | CLO  | เต็ม | ประเมินจากหลักฐานในโปรเจกต์                                                             |
| --------------------------------- | ---- | ---: | --------------------------------------------------------------------------------------- |
| ส่วนที่ 1: Final Integration      | CLO8 |    5 | รวมระบบ ครบ · Swagger/Code ครบ · Coverage ครบ · Checklist ครบ (รันจริงกับ DB แล้ว) |
| ส่วนที่ 2: Client-Facing Frontend | CLO6 |   10 | API จริง 11 operation ครบ · UI/loading/error ครบ · Validation ครบ                          |
| ส่วนที่ 3: Project Defense        | CLO7 |    5 | ขึ้นกับการสาธิตสดและการตอบคำถาม                                                         |

## สิ่งที่ผู้ส่งต้องทำก่อนส่งงาน

1. รัน `npm install`, นำเข้าฐานข้อมูล, `npm start` แล้วรัน Postman collection ทั้งชุดเพื่อยืนยัน
2. รัน TC-EXT-01 / TC-EXT-02 ซ้ำและอัปเดต `failure-scenario-results.md` เพราะ route notify เพิ่งถูกเพิ่มในระยะนี้
3. ใน repo เดิมมีไฟล์ที่ถูกลบออกจาก working tree แต่ยังไม่ได้ commit (เช่น `index.js` ระดับ root, `db.js` ระดับ root) โครงสร้างในไฟล์ส่งนี้เป็นฉบับที่ถูกต้องแล้ว ให้ commit ตามนี้
4. สร้าง `package-lock.json` ใหม่ด้วย `npm install` (ไฟล์เดิมตรงกับ package.json เก่า)

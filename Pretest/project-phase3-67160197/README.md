# ระบบยืม-คืนบอร์ดเกม (Boardgame Service) — โครงงานระยะที่ 3

รหัสนิสิต: 67160197

ระบบประกอบด้วย 3 ส่วน

- **MySQL 8.0** รันใน Docker (พอร์ต 3307 บนเครื่อง)
- **Express API** รันด้วย Node.js (พอร์ต 3000)
- **หน้าเว็บ** อยู่ที่ `http://localhost:3000/app` ใช้ API ตัวเดียวกัน

```
หน้าเว็บ (/app) ──► Express API (localhost:3000) ──► MySQL ใน Docker (localhost:3307)
```

---

## 1. สิ่งที่ต้องมีบนเครื่อง

| โปรแกรม        | เวอร์ชัน        | ตรวจสอบด้วย      |
| -------------- | --------------- | ---------------- |
| Node.js        | 20 ขึ้นไป       | `node -v`        |
| npm            | มาพร้อม Node.js | `npm -v`         |
| Docker Desktop | เปิดใช้งานอยู่  | `docker version` |

ไม่ต้องติดตั้ง MySQL client แยก ทุกคำสั่งกับฐานข้อมูลรันผ่าน container ได้เลย

---

## 2. โครงสร้างโปรเจกต์

```
docker-compose.yml          รัน MySQL ใน Docker
.env.example                ตัวอย่างไฟล์ตั้งค่า (คัดลอกเป็น .env)
src/
  index.js                  Express app: routes ทั้งหมด
  db.js                     MySQL connection pool
  validators.js             ฟังก์ชันตรวจสอบข้อมูล
  services/external-api.js  เรียก API ภายนอก (ntfy.sh) พร้อม Timeout / Retry / Fallback
frontend/                   หน้าเว็บ (HTML / CSS / JS) เปิดที่ /app
db/schema.sql               สร้างตาราง (โหลดอัตโนมัติตอนสร้าง container ใหม่)
db/seed.sql                 ข้อมูลตัวอย่าง (โหลดอัตโนมัติตอนสร้าง container ใหม่)
db/migrations/              สคริปต์สำหรับฐานข้อมูลที่มีอยู่แล้ว
docs/                       requirement.md, erd.pdf
test/                       unit tests (node:test)
openapi.yaml                เอกสาร API (ตรวจสอบตรงกับโค้ดแล้ว)
API_MANUAL.md               คู่มือ API ฉบับเต็ม (ภาษาไทย)
postman_collection.json     Postman collection (37 requests)
coverage-report.md          รายงาน test coverage
clo-requirements-checklist.md  ตรวจสอบ CLO6 / CLO7 / CLO8
failure-scenario-results.md    ผลทดสอบ failure scenarios
```

---

## 3. การติดตั้งครั้งแรกบนเครื่องใหม่

ทำตามลำดับนี้ที่โฟลเดอร์โปรเจกต์ (โฟลเดอร์ที่มี `docker-compose.yml`)

**ขั้นที่ 1: สร้างไฟล์ตั้งค่า**

```
copy .env.example .env
```

เปิดไฟล์ `.env` แล้วแก้ค่าต่อไปนี้

```
DB_USER=root
DB_PASSWORD=w12345678
```

ค่า `DB_PASSWORD` ต้องเป็นรหัสเดียวกับที่ Docker ใช้ตั้งรหัส root ตอนสร้าง container

**ขั้นที่ 2: ตรวจว่าพอร์ต 3307 ว่างอยู่**
ถ้ามี container MySQL อื่นรันอยู่ที่พอร์ต 3307 ให้หยุดก่อน

```
docker ps
docker stop <ชื่อ container นั้น>
```

**ขั้นที่ 3: เปิดฐานข้อมูล**

```
docker compose up -d
```

รอประมาณ 30 วินาทีในการเริ่มครั้งแรก แล้วตรวจว่าฐานข้อมูลพร้อมใช้งาน

```
docker compose ps
docker compose logs mysql --tail 20
```

- `docker compose ps` ต้องแสดงสถานะ `running` (หรือ `Up`)
- ใน logs ต้องมีบรรทัด `ready for connections`

**ขั้นที่ 4: ติดตั้ง dependencies**

```
npm install
```

**ขั้นที่ 5: เริ่มระบบ**

```
npm start
```

ควรเห็นข้อความ `Server กำลังทำงานที่ http://localhost:3000`

**ขั้นที่ 6: เปิดหน้าเว็บ**
เปิด `http://localhost:3000/app` ในเบราว์เซอร์

---

## 4. การเปิดและปิดระบบในแต่ละวัน

**เปิดระบบ**

```
docker compose up -d
npm start
```

ใช้ `npm run dev` แทน `npm start` ได้ถ้าต้องการให้ server รีสตาร์ตเองเมื่อแก้โค้ด

**ปิดระบบ**

| คำสั่ง                         | ผลที่เกิด                | ข้อมูลในฐานข้อมูล          |
| ------------------------------ | ------------------------ | -------------------------- |
| กด `Ctrl+C` ที่หน้าต่าง server | หยุด API                 | ไม่กระทบ                   |
| `docker compose stop`          | หยุด MySQL ชั่วคราว      | **คงอยู่**                 |
| `docker compose down`          | ลบ container และ network | **คงอยู่** (เก็บใน volume) |
| `docker compose down -v`       | ลบ container และ volume  | **ถูกลบทั้งหมด**           |

> คำเตือน: `docker compose down -v` ลบข้อมูลทั้งหมดถาวร ใช้เฉพาะเมื่อต้องการสร้างฐานข้อมูลใหม่จริง ๆ

---

## 5. ตรวจสอบว่าระบบทำงานได้

รันทีละข้อ ถ้าข้อใดไม่ผ่านให้ดูหัวข้อ "แก้ปัญหาที่พบบ่อย"

**5.1 ฐานข้อมูลมีตารางและข้อมูลตัวอย่าง**

```
docker compose exec mysql mysql -uroot -p<DB_PASSWORD> boardgame_db -e "SELECT COUNT(*) AS games FROM boardgames; SELECT COUNT(*) AS members FROM members;"
```

ควรได้ `games` เท่ากับ 3 และ `members` เท่ากับ 3 (จากข้อมูลตัวอย่าง)

**5.2 API ตอบกลับ**

```
curl.exe http://localhost:3000/
```

ควรได้ `{"message":"Boardgames API พร้อมใช้งานแล้ว"}`

```
curl.exe "http://localhost:3000/api/v1/boardgames?players=4"
```

ควรได้รายการบอร์ดเกมที่รองรับ 4 คน (อย่างน้อย Catan และ Codenames)

**5.3 หน้าเว็บ**

- เปิด `http://localhost:3000/app` ข้อมูลบอร์ดเกมต้องแสดงในตาราง ไม่มีข้อความ error สีแดงด้านบน
- เปิด `http://localhost:3000/api-docs` ต้องเห็น Swagger UI

**5.4 unit tests**

```
npm test
```

ควรได้ `# pass 35` และ `# fail 0`

---

## 6. ทดสอบการยืม-คืน (ตรวจแบบด้วยตาหรือ curl)

ยืมบอร์ดเกมที่ยังว่าง (id 1 สมาชิก id 3)

```
curl.exe -X POST http://localhost:3000/api/v1/borrowings -H "Content-Type: application/json" -d "{\"memberId\":3,\"boardgameId\":1}"
```

- ได้ `201` ครั้งแรก
- ยืมซ้ำอีกครั้งต้องได้ `409 GAME_NOT_AVAILABLE`

---

## 7. ย้ายข้อมูลจากเครื่องเดิม

ข้อมูลในฐานข้อมูลไม่ได้ไปกับโฟลเดอร์โปรเจกต์ ต้อง export ก่อนแล้ว import บนเครื่องใหม่

**บนเครื่องเดิม: export**

```
docker compose exec -T mysql mysqldump -uroot -p<DB_PASSWORD> --default-character-set=utf8mb4 --single-transaction boardgame_db > backup.sql
```

ถ้าใช้ container เดิมที่ไม่ได้มาจาก compose ให้เปลี่ยนชื่อ service และ container ตามจริง (ดูด้วย `docker ps`)

ตรวจไฟล์: ต้องมีขนาดหลายกิโลไบต์ และเปิดดูแล้วขึ้นต้นด้วย `-- MySQL dump`

**บนเครื่องใหม่: import** (หลังขั้นที่ 3 ของหัวข้อ 3)

```
type backup.sql | docker compose exec -T mysql mysql --default-character-set=utf8mb4 -uroot -p<DB_PASSWORD> boardgame_db
```

- ต้อง import บนฐานข้อมูลที่ว่างหรือ import ทับ เพราะคำสั่งนี้จะสร้างตารางซ้ำ ถ้าฐานมีตารางอยู่แล้วให้ใช้ `docker compose down -v` แล้ว `up -d` ใหม่ก่อน
- ถ้าชื่อภาษาไทยขึ้นเป็น `???` ให้ export ใหม่ด้วย `--default-character-set=utf8mb4` ตามคำสั่งข้างต้น

**ไม่มี backup** ระบบจะได้ข้อมูลจาก `db/seed.sql` (ตัวอย่าง) เท่านั้น

---

## 8. ฐานข้อมูลที่มีอยู่แล้ว: รัน migration

สคริปต์ `db/schema.sql` มี UNIQUE key ของชื่อบอร์ดเกมอยู่แล้ว แต่ฐานข้อมูลที่สร้างก่อนการแก้ไขนี้ยังไม่มี ให้รัน migration ครั้งเดียว (สำรองข้อมูลก่อนเสมอ)

```
type db\migrations\001_unique_boardgame_name.sql | docker compose exec -T mysql mysql --default-character-set=utf8mb4 -uroot -p<DB_PASSWORD>
```

ตรวจผล

```
docker compose exec mysql mysql -uroot -p<DB_PASSWORD> boardgame_db -e "SHOW INDEX FROM boardgames WHERE Key_name='uq_boardgame_name';"
```

ควรเห็น 1 แถว

ถ้า migration หยุดกลางคันเพราะประวัติการยืมชนกันจาก `unique_active_borrowing` ให้ส่ง error มาดู อย่ารันซ้ำโดยไม่ตรวจ

---

## 9. การทดสอบ

```
npm test
```

ผลการทดสอบ unit test และ coverage ดูได้ที่ `coverage-report.md`

Postman: import `postman_collection.json` แล้วรันทั้ง collection (37 requests) โดยตั้ง `EXTERNAL_TIMEOUT_MS=2000` ใน `.env` ก่อน

ทดสอบ TC-EXT-01 (การ retry) เท่านั้น: ตั้ง `EXTERNAL_TIMEOUT_MS=1` ใน `.env` แล้ว restart server และตั้งค่ากลับเป็น `2000` เมื่อทดสอบเสร็จ

---

## 10. Endpoints สรุป

คู่มือ API ฉบับเต็มพร้อมตัวอย่างทุก endpoint อยู่ที่ `API_MANUAL.md`

| Method             | Path                                | คำอธิบาย                                |
| ------------------ | ----------------------------------- | --------------------------------------- |
| GET                | /api/v1/boardgames                  | รายการบอร์ดเกม (ค้นหาด้วย `?players=N`) |
| POST               | /api/v1/boardgames                  | เพิ่มบอร์ดเกม                           |
| GET / PUT / DELETE | /api/v1/boardgames/:id              | ดู / แก้ไข / ลบบอร์ดเกม                 |
| GET / POST         | /api/v1/members                     | ดูรายชื่อ / เพิ่มสมาชิก                 |
| GET / PUT / DELETE | /api/v1/members/:id                 | ดู / แก้ไข / ลบสมาชิก                   |
| GET                | /api/v1/members/:id/borrowings      | ประวัติการยืมของสมาชิก                  |
| GET / POST         | /api/v1/borrowings                  | ดูรายการยืม-คืน (กรองได้) / ยืมบอร์ดเกม |
| GET                | /api/v1/borrowings/:id              | ดูรายการยืมตาม id                       |
| PATCH              | /api/v1/borrowings/:id/return       | คืนบอร์ดเกม                             |
| GET                | /api/v1/external/notify?message=... | ส่งการแจ้งเตือนผ่าน External API        |

รูปแบบ error ทั้งระบบ: `{ "error": { "code": "...", "message": "..." } }`

---

## 11. แก้ปัญหาที่พบบ่อย

| อาการ                                               | สาเหตุที่เป็นไปได้                                            | วิธีแก้                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `port is already allocated` ตอน `docker compose up` | มี container อื่นใช้พอร์ต 3307                                | `docker ps` แล้วหยุด container นั้น                                                                                    |
| `Access denied for user 'root'`                     | `DB_PASSWORD` ใน `.env` ไม่ตรงกับรหัสใน volume                | ถ้าไม่มีข้อมูลสำคัญ ใช้ `docker compose down -v` แล้ว `up -d` ใหม่ ถ้ามีข้อมูลต้องเปลี่ยนรหัสใน MySQL ให้ตรงกับ `.env` |
| `Table 'boardgames' doesn't exist`                  | volume ว่างแต่ init script ไม่ทำงาน หรือ schema ยังไม่ถูกโหลด | ตรวจ `docker compose logs mysql`; ถ้าต้องการ ให้ใช้ `down -v` แล้ว `up -d`                                             |
| หน้าเว็บขึ้น `เชื่อมต่อเซิร์ฟเวอร์ไม่ได้`           | `npm start` ไม่ได้รัน หรือพอร์ตไม่ใช่ 3000                    | รัน `npm start` ใหม่ และเปิดผ่าน `localhost:3000/app`                                                                  |
| หน้าเว็บขึ้น `ไม่พบ API` หรือ CORS error            | เปิดผ่าน Live Server แต่ server ไม่ได้รันที่พอร์ต 3000        | เปิด `http://localhost:3000/app` โดยตรง                                                                                |
| หน้าเว็บขึ้น `เกิดข้อผิดพลาดที่ไม่คาดคิด` (500)     | API ต่อ MySQL ไม่ได้                                          | ดู log ใน terminal ที่รัน `npm start` และตรวจ `DB_*` ใน `.env`                                                         |
| ชื่อภาษาไทยเป็น `???`                               | import หรือ export โดยไม่ใช้ UTF-8                            | ใช้ `--default-character-set=utf8mb4` และ `type file.sql \| ...`                                                       |
| `mysql` ไม่รู้จักใน cmd                             | ไม่ได้ติดตั้ง MySQL client บนเครื่อง                          | ใช้ `docker compose exec mysql mysql ...` แทน                                                                          |
| ยืมเกมแล้วไม่มีแจ้งเตือน                            | `EXTERNAL_TIMEOUT_MS` ตั้งไว้ต่ำ (เช่น 1)                     | ตั้งเป็น `2000` ตามปกติ                                                                                                |

---

## 12. ความปลอดภัย

- ไม่ commit หรือแชร์ไฟล์ `.env` (อยู่ใน `.gitignore` แล้ว)
- ไม่แชร์ `node_modules` หรือ `backup.sql` ที่มีข้อมูลจริง
- การใช้ user `root` เหมาะกับการพัฒนาเท่านั้น หากนำขึ้นใช้งานจริงควรสร้าง user ที่มีสิทธิ์เฉพาะ `boardgame_db`
- `docker-compose.yml` ผูกพอร์ตฐานข้อมูลกับ `127.0.0.1` เท่านั้น เครื่องอื่นในเครือข่ายเข้าไม่ได้

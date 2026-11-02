/**
 * ไฟล์หลักของ Backend (Boardgame Service API)
 *
 * ระบบยืม-คืนบอร์ดเกม แบ่ง API ออกเป็น 4 กลุ่ม
 *   1. BOARDGAMES : จัดการข้อมูลบอร์ดเกม        (/api/v1/boardgames)
 *   2. MEMBERS    : จัดการข้อมูลสมาชิก           (/api/v1/members)
 *   3. BORROWINGS : บันทึกการยืมและการคืน        (/api/v1/borrowings)
 *   4. EXTERNAL   : ส่งการแจ้งเตือนผ่าน API ภายนอก (/api/v1/external/notify)
 *
 * ลำดับการทำงานของโปรแกรม (ตั้งแต่เริ่มรัน)
 *   ขั้นที่ 1: โหลดค่าจากไฟล์ .env
 *   ขั้นที่ 2: สร้าง Express app และตั้งค่า middleware
 *   ขั้นที่ 3: ลงทะเบียน route ทั้งหมด
 *   ขั้นที่ 4: เปิด server ให้รับ request (เฉพาะตอนรันไฟล์นี้โดยตรง)
 *
 * ===== วิธีเรียกใช้งานแบบย่อ =====
 *   1) เปิดฐานข้อมูล      : docker compose up -d          (ครั้งแรกรอประมาณ 30 วินาที)
 *   2) ติดตั้งแพ็กเกจ     : npm install                   (ทำครั้งแรกครั้งเดียว)
 *   3) เปิดเซิร์ฟเวอร์    : npm start                     (ใช้ npm run dev ถ้าอยากให้รีสตาร์ตเองเมื่อแก้โค้ด)
 *   4) เปิดหน้าเว็บ       : http://localhost:3000/app
 *   5) เอกสาร API         : http://localhost:3000/api-docs
 *   6) รันเทสต์           : npm test
 *
 * ตัวอย่างการทดสอบ API ด้วย curl (Windows CMD / PowerShell ใช้ curl.exe)
 * รายละเอียดทุก endpoint อยู่ในไฟล์ API_MANUAL.md
 */

// ===== ขั้นที่ 1: โหลดค่าจากไฟล์ .env ต้องทำก่อนอย่างอื่น เพราะโค้ดด้านล่างใช้ process.env =====
require("dotenv").config();

// ===== นำเข้าไลบรารีที่ใช้ =====
const express = require("express"); // เฟรมเวิร์กสำหรับสร้าง web server
const helmet = require("helmet"); // เพิ่ม HTTP header เพื่อความปลอดภัย
const cors = require("cors"); // อนุญาตให้เว็บจากโดเมนอื่นเรียก API นี้ได้
const morgan = require("morgan"); // พิมพ์ log ของทุก request ออกทาง console
const fs = require("fs"); // อ่านไฟล์จากเครื่อง
const path = require("path"); // จัดการ path ของไฟล์
const yaml = require("js-yaml"); // อ่านไฟล์ YAML
const swaggerUi = require("swagger-ui-express"); // หน้าเอกสาร API (Swagger UI)

// ===== นำเข้าโมดูลของโปรเจกต์เอง =====
const pool = require("./db"); // connection pool ไปยังฐานข้อมูล
const {
  notifyBorrowed,
  notifyReturned,
  sendNotification,
} = require("./services/external-api");
const {
  toPosInt,
  isDate,
  todayStr,
  validateBoardgame,
  validateMember,
} = require("./validators");

// ===== ขั้นที่ 2: สร้าง app และค่าพื้นฐาน =====
const app = express();
const PORT = process.env.PORT || 3000; // ถ้าไม่ได้ตั้ง PORT จะใช้ 3000

// โหลด OpenAPI spec จากไฟล์ openapi.yaml ที่อยู่ที่ root ของโปรเจกต์
// ไฟล์นี้ใช้สร้างหน้าเอกสาร API ใน /api-docs
const openapiSpec = yaml.load(
  fs.readFileSync(path.join(__dirname, "..", "openapi.yaml"), "utf8"),
);

// ----- ตั้งค่า middleware -----
// middleware คือโค้ดที่ทำงาน "ก่อน" จะถึง route ของเรา
// ลำดับการลงทะเบียนสำคัญมาก เพราะ Express จะทำงานตามลำดับที่เขียน

// (ก) Swagger UI ต้องลงทะเบียนก่อน helmet
// เพราะ CSP เริ่มต้นของ helmet อาจทำให้หน้า docs แสดงผลผิดเพี้ยน
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

// (ข) helmet: ตั้งค่า HTTP header เพื่อป้องกันการโจมตีทั่วไป
app.use(helmet());

// (ค) Frontend: ให้บริการไฟล์ในโฟลเดอร์ frontend ที่ path /app
// script อยู่ในไฟล์ app.js (origin เดียวกัน) จึงผ่านนโยบาย CSP script-src 'self'
app.use("/app", express.static(path.join(__dirname, "..", "frontend")));

// (ง) cors: กำหนดว่าเว็บไซต์ใดบ้างเรียก API นี้ได้
// - ถ้าตั้ง ALLOWED_ORIGIN ไว้ในไฟล์ .env ให้ใช้ค่านั้น
//   (รองรับหลาย origin โดยคั่นด้วยเครื่องหมายจุลภาค เช่น "http://a.com,http://b.com")
// - ถ้าไม่ได้ตั้งค่า ให้อนุญาตเฉพาะ Live Server ของเครื่องพัฒนา (พอร์ต 5500)
const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(",").map((origin) => origin.trim())
  : ["http://127.0.0.1:5500", "http://localhost:5500"];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }),
);

// (จ) morgan: พิมพ์ log ของแต่ละ request ออกทาง console ในรูปแบบ "dev"
app.use(morgan("dev"));

// (ฉ) express.json: แปลง body ที่เป็น JSON ให้กลายเป็น object ใน req.body
// จำกัดขนาดไว้ที่ 10 KB เพื่อป้องกัน request ที่ใหญ่ผิดปกติ
app.use(express.json({ limit: "10kb" }));

// ===== ฟังก์ชันช่วยเหลือ (Helpers) =====

/**
 * ส่ง error กลับไปในรูปแบบมาตรฐานเดียวกันทั้งระบบ:
 * { "error": { "code": "...", "message": "..." } }
 */
const sendError = (res, status, code, message) => {
  res.status(status).json({ error: { code, message } });
};

/**
 * ตรวจค่า id ที่อยู่บน URL (เช่น /api/v1/members/:id) ว่าเป็นจำนวนเต็มบวกหรือไม่
 *
 * - ถ้าถูกต้อง: คืนค่า id เป็นตัวเลข
 * - ถ้าไม่ถูกต้อง: ส่ง error 400 กลับไปให้ผู้เรียกแล้วคืนค่า null
 *
 * วิธีใช้ในแต่ละ route:
 *   const id = parseId(req, res);
 *   if (id === null) return; // หยุดทันที เพราะตอบ error ไปแล้ว
 */
const parseId = (req, res) => {
  const id = toPosInt(req.params.id);
  if (id === null) {
    sendError(res, 400, "INVALID_ID", "id ต้องเป็นจำนวนเต็มบวก");
  }
  return id;
};

// คอลัมน์ของตาราง boardgames ที่จะดึงออกมา
// ใช้ AS เพื่อเปลี่ยนชื่อคอลัมน์เป็นแบบ camelCase ที่ฝั่ง frontend ใช้งาน
// ประกาศไว้ที่เดียวเพราะถูกเรียกใช้หลายจุด
const BOARDGAME_COLS =
  "id, name, min_players AS minPlayers, max_players AS maxPlayers, created_at AS createdAt";

// คำสั่ง SELECT ของตาราง borrowings
// ใช้ JOIN กับตาราง members และ boardgames เพื่อดึงชื่อสมาชิกและชื่อเกมมาด้วย เพื่อให้ frontend ใช้ได้สะดวก
const BORROWING_SELECT = `
  SELECT b.id,
         b.member_id    AS memberId,
         m.name         AS memberName,
         b.boardgame_id AS boardgameId,
         g.name         AS boardgameName,
         b.borrow_date  AS borrowDate,
         b.return_date  AS returnDate,
         b.status
  FROM borrowings b
  JOIN members m    ON m.id = b.member_id
  JOIN boardgames g ON g.id = b.boardgame_id`;

// ----- Root endpoint: ใช้ตรวจสอบว่า server ทำงานอยู่หรือไม่ -----
// ตัวอย่างการเรียก (CMD): curl.exe http://localhost:3000/
app.get("/", (req, res) => {
  res.status(200).json({ message: "Boardgames API พร้อมใช้งานแล้ว" });
});

// =====================================================
// BOARDGAMES: ข้อมูลบอร์ดเกม
// =====================================================

// 1. GET /api/v1/boardgames : ดึงรายการบอร์ดเกมทั้งหมด
//    - ค้นหาตามจำนวนผู้เล่นได้ด้วย ?players=N เช่น ?players=4 จะได้เกมที่เล่นได้ 4 คน
// ตัวอย่างการเรียก (CMD): curl.exe "http://localhost:3000/api/v1/boardgames?players=4"
app.get("/api/v1/boardgames", async (req, res, next) => {
  try {
    // เริ่มจากคำสั่ง SELECT พื้นฐาน
    let sql = `SELECT ${BOARDGAME_COLS} FROM boardgames`;
    const params = []; // ค่าที่จะแทนที่เครื่องหมาย ? ใน SQL (ป้องกัน SQL Injection)

    // ถ้าผู้ใช้ส่ง ?players มาด้วย ให้เพิ่มเงื่อนไขกรอง
    if (req.query.players !== undefined) {
      const players = toPosInt(req.query.players);

      // ค่าที่ส่งมาไม่ถูกต้อง เช่น ?players=abc
      if (players === null) {
        return sendError(
          res,
          400,
          "VALIDATION_ERROR",
          "players ต้องเป็นจำนวนเต็มบวก",
        );
      }

      // เกมที่ดีต้อง รองรับจำนวนผู้เล่นขั้นต่ำ <= players และ รองรับขั้นสูงสุด >= players
      sql += " WHERE min_players <= ? AND max_players >= ?";
      params.push(players, players);
    }

    // เรียงตาม id จากน้อยไปมาก แล้วส่งผลลัพธ์กลับ
    const [rows] = await pool.query(sql + " ORDER BY id", params);
    res.status(200).json({ message: "สำเร็จ", data: rows });
  } catch (err) {
    next(err); // ส่ง error ไปให้ตัวจัดการ error กลาง (Error-Handling Middleware)
  }
});

// 2. GET /api/v1/boardgames/:id : ดึงข้อมูลบอร์ดเกมตาม id
// ตัวอย่างการเรียก (CMD): curl.exe http://localhost:3000/api/v1/boardgames/1
app.get("/api/v1/boardgames/:id", async (req, res, next) => {
  const id = parseId(req, res);
  if (id === null) return; // id ไม่ถูกต้อง และได้ตอบ error ไปแล้ว

  try {
    const [rows] = await pool.query(
      `SELECT ${BOARDGAME_COLS} FROM boardgames WHERE id = ?`,
      [id],
    );

    // ไม่พบข้อมูล
    if (rows.length === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลของบอร์ดเกม");
    }

    res.status(200).json({ message: "สำเร็จ", data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// 3. POST /api/v1/boardgames : เพิ่มบอร์ดเกมใหม่
// ตัวอย่างการเรียก (CMD): curl.exe -X POST http://localhost:3000/api/v1/boardgames -H "Content-Type: application/json" -d "{\\\"name\\\":\\\"Ticket to Ride\\\",\\\"minPlayers\\\":2,\\\"maxPlayers\\\":5}"
app.post("/api/v1/boardgames", async (req, res, next) => {
  // ถ้าไม่มี body ให้ใช้ object ว่างแทน เพื่อให้ validator ทำงานได้โดยไม่พัง
  const body = req.body || {};

  // ตรวจความถูกต้องของข้อมูล ถ้าไม่ผ่านจะได้ข้อความ error กลับมา
  const validationError = validateBoardgame(body);
  if (validationError) {
    return sendError(res, 400, "VALIDATION_ERROR", validationError);
  }

  // ตัดช่องว่างหัวท้ายของชื่อออกก่อนบันทึก
  const name = body.name.trim();
  const { minPlayers, maxPlayers } = body;

  try {
    const [result] = await pool.query(
      "INSERT INTO boardgames (name, min_players, max_players) VALUES (?, ?, ?)",
      [name, minPlayers, maxPlayers],
    );

    // result.insertId คือ id ที่ฐานข้อมูลสร้างให้อัตโนมัติ
    res.status(201).json({
      message: "เพิ่มข้อมูลสำเร็จ",
      data: { id: result.insertId, name, minPlayers, maxPlayers },
    });
  } catch (err) {
    // ER_DUP_ENTRY = ชื่อซ้ำ (ฐานข้อมูลตั้งค่า UNIQUE ไว้ที่คอลัมน์ name)
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(
        res,
        409,
        "DUPLICATE_NAME",
        "ชื่อบอร์ดเกมนี้มีอยู่ในระบบแล้ว",
      );
    }
    next(err);
  }
});

// 4. PUT /api/v1/boardgames/:id : แก้ไขข้อมูลบอร์ดเกมทั้งระเบียน
// ตัวอย่างการเรียก (CMD): curl.exe -X PUT http://localhost:3000/api/v1/boardgames/4 -H "Content-Type: application/json" -d "{\\\"name\\\":\\\"Ticket to Ride\\\",\\\"minPlayers\\\":2,\\\"maxPlayers\\\":5}"
app.put("/api/v1/boardgames/:id", async (req, res, next) => {
  const id = parseId(req, res);
  if (id === null) return;

  const body = req.body || {};
  const validationError = validateBoardgame(body);
  if (validationError) {
    return sendError(res, 400, "VALIDATION_ERROR", validationError);
  }

  const name = body.name.trim();
  const { minPlayers, maxPlayers } = body;

  try {
    const [result] = await pool.query(
      "UPDATE boardgames SET name = ?, min_players = ?, max_players = ? WHERE id = ?",
      [name, minPlayers, maxPlayers, id],
    );

    // affectedRows = 0 หมายความว่าไม่มีแถวไหนถูกแก้ไข (เพราะไม่พบ id นี้)
    if (result.affectedRows === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลบอร์ดเกม");
    }

    res.status(200).json({
      message: "แก้ไขข้อมูลสำเร็จ",
      data: { id, name, minPlayers, maxPlayers },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(
        res,
        409,
        "DUPLICATE_NAME",
        "ชื่อบอร์ดเกมนี้มีอยู่ในระบบแล้ว",
      );
    }
    next(err);
  }
});

// 5. DELETE /api/v1/boardgames/:id : ลบบอร์ดเกม
//    ประวัติการยืมของเกมนี้จะถูกลบไปด้วยอัตโนมัติ (ON DELETE CASCADE ที่ฐานข้อมูล)
// ตัวอย่างการเรียก (CMD): curl.exe -X DELETE http://localhost:3000/api/v1/boardgames/4
app.delete("/api/v1/boardgames/:id", async (req, res, next) => {
  const id = parseId(req, res);
  if (id === null) return;

  try {
    const [result] = await pool.query("DELETE FROM boardgames WHERE id = ?", [
      id,
    ]);

    if (result.affectedRows === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลของบอร์ดเกม");
    }

    res.status(200).json({ message: "ลบข้อมูลสำเร็จ" });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// MEMBERS: ข้อมูลสมาชิก
// =====================================================

// 6. GET /api/v1/members : ดึงรายชื่อสมาชิกทั้งหมด
// ตัวอย่างการเรียก (CMD): curl.exe http://localhost:3000/api/v1/members
app.get("/api/v1/members", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM members ORDER BY id");
    res.status(200).json({ message: "สำเร็จ", data: rows });
  } catch (err) {
    next(err);
  }
});

// 7. GET /api/v1/members/:id : ดึงข้อมูลสมาชิกตาม id
// ตัวอย่างการเรียก (CMD): curl.exe http://localhost:3000/api/v1/members/1
app.get("/api/v1/members/:id", async (req, res, next) => {
  const id = parseId(req, res);
  if (id === null) return;

  try {
    const [rows] = await pool.query("SELECT * FROM members WHERE id = ?", [id]);

    if (rows.length === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลสมาชิก");
    }
    res.status(200).json({ message: "สำเร็จ", data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// 8. GET /api/v1/members/:id/borrowings : ดูประวัติการยืมของสมาชิกคนนั้น
// ตัวอย่างการเรียก (CMD): curl.exe http://localhost:3000/api/v1/members/1/borrowings
app.get("/api/v1/members/:id/borrowings", async (req, res, next) => {
  const id = parseId(req, res);
  if (id === null) return;

  try {
    // ตรวจก่อนว่ามีสมาชิกคนนี้อยู่จริงหรือไม่
    // ถ้าไม่มี จะได้ 404 ที่ชัดเจน แทนที่จะได้รายการว่างเปล่า
    const [members] = await pool.query("SELECT id FROM members WHERE id = ?", [
      id,
    ]);
    if (members.length === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลสมาชิก");
    }

    // ดึงประวัติ เรียงจากการยืมล่าสุดไปเก่าสุด
    const [rows] = await pool.query(
      `${BORROWING_SELECT} WHERE b.member_id = ? ORDER BY b.borrow_date DESC, b.id DESC`,
      [id],
    );
    res.status(200).json({ message: "สำเร็จ", data: rows });
  } catch (err) {
    next(err);
  }
});

// 9. POST /api/v1/members : เพิ่มสมาชิกใหม่
// ตัวอย่างการเรียก (CMD): curl.exe -X POST http://localhost:3000/api/v1/members -H "Content-Type: application/json" -d "{\\\"name\\\":\\\"ปรีชา\\\",\\\"email\\\":\\\"preecha@example.com\\\",\\\"phone\\\":\\\"0855556666\\\"}"
app.post("/api/v1/members", async (req, res, next) => {
  const body = req.body || {};
  const validationError = validateMember(body);
  if (validationError) {
    return sendError(res, 400, "VALIDATION_ERROR", validationError);
  }

  const name = body.name.trim();
  const { email, phone } = body;

  try {
    const [result] = await pool.query(
      "INSERT INTO members (name, email, phone) VALUES (?, ?, ?)",
      [name, email, phone],
    );
    res.status(201).json({
      message: "เพิ่มข้อมูลสำเร็จ",
      data: { id: result.insertId, name, email, phone },
    });
  } catch (err) {
    // ER_DUP_ENTRY = อีเมลซ้ำ (ฐานข้อมูลตั้งค่า UNIQUE ไว้ที่คอลัมน์ email)
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(
        res,
        409,
        "DUPLICATE_EMAIL",
        "อีเมลนี้ถูกใช้งานในระบบแล้ว",
      );
    }
    next(err);
  }
});

// 10. PUT /api/v1/members/:id : แก้ไขข้อมูลสมาชิก
// ตัวอย่างการเรียก (CMD): curl.exe -X PUT http://localhost:3000/api/v1/members/4 -H "Content-Type: application/json" -d "{\\\"name\\\":\\\"ปรีชา\\\",\\\"email\\\":\\\"preecha@example.com\\\",\\\"phone\\\":\\\"0855556666\\\"}"
app.put("/api/v1/members/:id", async (req, res, next) => {
  const id = parseId(req, res);
  if (id === null) return;

  const body = req.body || {};
  const validationError = validateMember(body);
  if (validationError) {
    return sendError(res, 400, "VALIDATION_ERROR", validationError);
  }

  const name = body.name.trim();
  const { email, phone } = body;

  try {
    const [result] = await pool.query(
      "UPDATE members SET name = ?, email = ?, phone = ? WHERE id = ?",
      [name, email, phone, id],
    );

    if (result.affectedRows === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลสมาชิก");
    }

    res.status(200).json({
      message: "แก้ไขข้อมูลสำเร็จ",
      data: { id, name, email, phone },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(
        res,
        409,
        "DUPLICATE_EMAIL",
        "อีเมลนี้ถูกใช้งานในระบบแล้ว",
      );
    }
    next(err);
  }
});

// 11. DELETE /api/v1/members/:id : ลบสมาชิก
//     ประวัติการยืมของสมาชิกจะถูกลบไปด้วยอัตโนมัติ (ON DELETE CASCADE ที่ฐานข้อมูล)
// ตัวอย่างการเรียก (CMD): curl.exe -X DELETE http://localhost:3000/api/v1/members/4
app.delete("/api/v1/members/:id", async (req, res, next) => {
  const id = parseId(req, res);
  if (id === null) return;

  try {
    const [result] = await pool.query("DELETE FROM members WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลสมาชิก");
    }
    res.status(200).json({ message: "ลบข้อมูลสำเร็จ" });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// BORROWINGS: การยืม-คืนบอร์ดเกม
// =====================================================

// 12. GET /api/v1/borrowings : ดูรายการยืม-คืน พร้อมตัวกรอง
//     ตัวกรองที่ใช้ได้ (ทุกตัวเป็นทางเลือก ใส่หรือไม่ใส่ก็ได้):
//       memberId     : กรองตามสมาชิก
//       boardgameId  : กรองตามบอร์ดเกม
//       status       : BORROWED (กำลังยืม) หรือ RETURNED (คืนแล้ว)
//       from, to     : กรองตามช่วงวันที่ยืม รูปแบบ YYYY-MM-DD
// ตัวอย่างการเรียก (CMD): curl.exe "http://localhost:3000/api/v1/borrowings?status=BORROWED&from=2026-08-01"
app.get("/api/v1/borrowings", async (req, res, next) => {
  const { memberId, boardgameId, status, from, to } = req.query;

  // where  = รายการเงื่อนไข SQL ที่จะนำมาต่อกันด้วย AND
  // params = ค่าที่จะแทนที่เครื่องหมาย ? ตามลำดับเงื่อนไข
  const where = [];
  const params = [];

  // ตรวจและเพิ่มเงื่อนไขของ memberId
  if (memberId !== undefined) {
    const value = toPosInt(memberId);
    if (value === null) {
      return sendError(res, 400, "VALIDATION_ERROR", "memberId ไม่ถูกต้อง");
    }
    where.push("b.member_id = ?");
    params.push(value);
  }

  // ตรวจและเพิ่มเงื่อนไขของ boardgameId
  if (boardgameId !== undefined) {
    const value = toPosInt(boardgameId);
    if (value === null) {
      return sendError(res, 400, "VALIDATION_ERROR", "boardgameId ไม่ถูกต้อง");
    }
    where.push("b.boardgame_id = ?");
    params.push(value);
  }

  // ตรวจและเพิ่มเงื่อนไขของ status ต้องเป็นค่าใดค่าหนึ่งในสองค่านี้เท่านั้น
  if (status !== undefined) {
    const allowedStatuses = ["BORROWED", "RETURNED"];
    if (!allowedStatuses.includes(status)) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        "status ต้องเป็น BORROWED หรือ RETURNED",
      );
    }
    where.push("b.status = ?");
    params.push(status);
  }

  // ตรวจและเพิ่มเงื่อนไขของวันเริ่มต้น (from)
  if (from !== undefined) {
    if (!isDate(from)) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        "from ต้องเป็น YYYY-MM-DD",
      );
    }
    where.push("b.borrow_date >= ?");
    params.push(from);
  }

  // ตรวจและเพิ่มเงื่อนไขของวันสิ้นสุด (to)
  if (to !== undefined) {
    if (!isDate(to)) {
      return sendError(res, 400, "VALIDATION_ERROR", "to ต้องเป็น YYYY-MM-DD");
    }
    where.push("b.borrow_date <= ?");
    params.push(to);
  }

  try {
    // ประกอบ SQL: ถ้ามีเงื่อนไข ให้ต่อด้วย WHERE ... AND ... ถ้าไม่มีก็ไม่ต้องใส่ WHERE
    let sql = BORROWING_SELECT;
    if (where.length > 0) {
      sql += ` WHERE ${where.join(" AND ")}`;
    }
    sql += " ORDER BY b.borrow_date DESC, b.id DESC";

    const [rows] = await pool.query(sql, params);
    res.status(200).json({ message: "สำเร็จ", data: rows });
  } catch (err) {
    next(err);
  }
});

// 13. GET /api/v1/borrowings/:id : ดูรายการยืมตาม id
// ตัวอย่างการเรียก (CMD): curl.exe http://localhost:3000/api/v1/borrowings/2
app.get("/api/v1/borrowings/:id", async (req, res, next) => {
  const id = parseId(req, res);
  if (id === null) return;

  try {
    const [rows] = await pool.query(`${BORROWING_SELECT} WHERE b.id = ?`, [id]);

    if (rows.length === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบรายการยืม");
    }
    res.status(200).json({ message: "สำเร็จ", data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// 14. POST /api/v1/borrowings : ยืมบอร์ดเกม
//     ขั้นตอนสำคัญ: ตรวจว่าเกมยังว่างอยู่หรือไม่ ก่อนจะบันทึกการยืม
//     ทั้งหมดทำใน transaction เดียว เพื่อกันกรณีสองคนยืมเกมเดียวกันพร้อมกัน
// ตัวอย่างการเรียก (CMD): curl.exe -X POST http://localhost:3000/api/v1/borrowings -H "Content-Type: application/json" -d "{\\\"memberId\\\":3,\\\"boardgameId\\\":1}"
app.post("/api/v1/borrowings", async (req, res, next) => {
  const body = req.body || {};

  // แปลง memberId และ boardgameId เป็นจำนวนเต็มบวก
  const memberId = toPosInt(body.memberId);
  const boardgameId = toPosInt(body.boardgameId);

  if (memberId === null || boardgameId === null) {
    return sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "กรุณาระบุ memberId และ boardgameId เป็นจำนวนเต็มบวก",
    );
  }

  // ถ้าส่ง borrowDate มาด้วย ต้องอยู่ในรูปแบบ YYYY-MM-DD
  if (body.borrowDate !== undefined && !isDate(body.borrowDate)) {
    return sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "borrowDate ต้องเป็นรูปแบบ YYYY-MM-DD",
    );
  }

  // ถ้าไม่ได้ส่ง borrowDate มา ให้ใช้วันที่ปัจจุบันแทน
  // (?? หมายถึง ถ้าค่าซ้ายเป็น null หรือ undefined ให้ใช้ค่าขวา)
  const borrowDate = body.borrowDate ?? todayStr();

  let conn; // การเชื่อมต่อที่จะใช้ภายใน transaction
  try {
    // ขอการเชื่อมต่อ 1 ตัวจาก pool แล้วเริ่ม transaction
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // ขั้นที่ 1: ล็อกแถวของบอร์ดเกมนี้ (FOR UPDATE)
    // ทำให้ request อื่นที่จะยืมเกมเดียวกันต้องรอ จนกว่า transaction นี้จะจบ
    const [games] = await conn.query(
      "SELECT id, name FROM boardgames WHERE id = ? FOR UPDATE",
      [boardgameId],
    );
    if (games.length === 0) {
      await conn.rollback(); // ยกเลิกทุกอย่างใน transaction
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลบอร์ดเกม");
    }

    // ขั้นที่ 2: ตรวจว่าสมาชิกคนนี้มีอยู่จริง
    const [members] = await conn.query("SELECT id FROM members WHERE id = ?", [
      memberId,
    ]);
    if (members.length === 0) {
      await conn.rollback();
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลสมาชิก");
    }

    // ขั้นที่ 3: ตรวจว่าเกมนี้กำลังถูกยืมอยู่หรือไม่
    const [activeBorrowings] = await conn.query(
      "SELECT id FROM borrowings WHERE boardgame_id = ? AND status = 'BORROWED'",
      [boardgameId],
    );
    if (activeBorrowings.length > 0) {
      await conn.rollback();
      return sendError(
        res,
        409,
        "GAME_NOT_AVAILABLE",
        "บอร์ดเกมนี้ถูกยืมอยู่ในขณะนี้",
      );
    }

    // ขั้นที่ 4: บันทึกการยืม โดยสถานะเริ่มต้นเป็น BORROWED
    const [result] = await conn.query(
      "INSERT INTO borrowings (member_id, boardgame_id, borrow_date, status) VALUES (?, ?, ?, 'BORROWED')",
      [memberId, boardgameId, borrowDate],
    );

    // ขั้นที่ 5: ยืนยัน transaction (บันทึกลงฐานข้อมูลจริง)
    await conn.commit();

    // ขั้นที่ 6: ส่งแจ้งเตือนภายนอก หลังจาก commit แล้ว
    // ถ้าแจ้งเตือนล้มเหลว จะไม่กระทบรายการที่บันทึกไปแล้ว
    // (ไม่ใช้ await เพื่อไม่ให้ผู้ใช้ต้องรอการแจ้งเตือน)
    notifyBorrowed({
      memberId,
      boardgameName: games[0].name || "Boardgame",
      borrowDate,
    });

    res.status(201).json({
      message: "บันทึกการยืมสำเร็จ",
      data: {
        id: result.insertId,
        memberId,
        boardgameId,
        borrowDate,
        returnDate: null,
        status: "BORROWED",
      },
    });
  } catch (err) {
    // ถ้าเกิด error ระหว่างทาง ให้ยกเลิก transaction
    // .catch(() => {}) คือถ้า rollback เองก็พัง ก็ไม่ต้องทำให้โปรแกรมพังซ้ำ
    if (conn) {
      await conn.rollback().catch(() => {});
    }
    next(err);
  } finally {
    // ไม่ว่าจะสำเร็จหรือล้มเหลว ต้องคืนการเชื่อมต่อกลับเข้า pool เสมอ
    if (conn) {
      conn.release();
    }
  }
});

// 15. PATCH /api/v1/borrowings/:id/return : คืนบอร์ดเกม
//     บันทึกวันที่คืน และเปลี่ยนสถานะจาก BORROWED เป็น RETURNED
// ตัวอย่างการเรียก (CMD): curl.exe -X PATCH http://localhost:3000/api/v1/borrowings/4/return -H "Content-Type: application/json" -d "{}"
app.patch("/api/v1/borrowings/:id/return", async (req, res, next) => {
  const id = parseId(req, res);
  if (id === null) return;

  const body = req.body || {};

  // ถ้าไม่ได้ส่ง returnDate มา ให้ใช้วันที่ปัจจุบัน
  let returnDate = body.returnDate;
  if (returnDate !== undefined && !isDate(returnDate)) {
    return sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "returnDate ต้องเป็นรูปแบบ YYYY-MM-DD",
    );
  }
  if (returnDate === undefined) {
    returnDate = todayStr();
  }

  try {
    // ขั้นที่ 1: ดึงข้อมูลการยืมนี้มาตรวจสอบ
    const [rows] = await pool.query(
      "SELECT borrow_date AS borrowDate, status FROM borrowings WHERE id = ?",
      [id],
    );
    if (rows.length === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบรายการยืม");
    }
    if (rows[0].status === "RETURNED") {
      return sendError(res, 409, "ALREADY_RETURNED", "รายการนี้ถูกคืนไปแล้ว");
    }

    // ขั้นที่ 2: แปลงวันที่ยืมให้เป็น string รูปแบบ YYYY-MM-DD
    // เพื่อนำไปเทียบกับ returnDate ได้ถูกต้อง
    // (ถ้าฐานข้อมูลส่งมาเป็น string อยู่แล้ว ก็ตัดเอาแค่ 10 ตัวอักษรแรก)
    const rawBorrowDate = rows[0].borrowDate;
    let borrowDateStr;
    if (typeof rawBorrowDate === "string") {
      borrowDateStr = rawBorrowDate.slice(0, 10);
    } else {
      borrowDateStr = todayStr(new Date(rawBorrowDate));
    }

    // ขั้นที่ 3: วันที่คืนต้องไม่ก่อนวันที่ยืม
    // เปรียบเทียบเป็น string ได้เลย เพราะรูปแบบ YYYY-MM-DD เรียงลำดับตามตัวอักษรได้ถูกต้อง
    if (returnDate < borrowDateStr) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        "returnDate ต้องไม่ก่อน borrowDate",
      );
    }

    // ขั้นที่ 4: อัปเดตการคืน
    // เงื่อนไข status = 'BORROWED' ใน WHERE ช่วยกันการคืนซ้ำ
    // ในกรณีที่มี request สองตัวเข้ามาพร้อมกัน ตัวที่มาทีหลังจะไม่มีแถวถูกแก้ไข
    const [result] = await pool.query(
      "UPDATE borrowings SET return_date = ?, status = 'RETURNED' WHERE id = ? AND status = 'BORROWED'",
      [returnDate, id],
    );
    if (result.affectedRows === 0) {
      return sendError(res, 409, "ALREADY_RETURNED", "รายการนี้ถูกคืนไปแล้ว");
    }

    // ขั้นที่ 5: ดึงข้อมูลล่าสุดกลับมาเพื่อส่งให้ผู้ใช้ (มีชื่อสมาชิกและชื่อเกมด้วย)
    const [updatedRows] = await pool.query(
      `${BORROWING_SELECT} WHERE b.id = ?`,
      [id],
    );
    const updated = updatedRows[0];

    // ขั้นที่ 6: ส่งแจ้งเตือนภายนอก (ไม่ใช้ await เพื่อไม่ให้ผู้ใช้ต้องรอ)
    notifyReturned({
      memberId: updated.memberId,
      boardgameName: updated.boardgameName,
      returnDate,
    });

    res.status(200).json({ message: "คืนบอร์ดเกมสำเร็จ", data: updated });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// EXTERNAL: การเรียกใช้ API ภายนอก
// =====================================================

// 16. GET /api/v1/external/notify?message=... : ส่งข้อความแจ้งเตือนด้วยตนเอง
//     ใช้ระบบ Retry / Timeout / Fallback จากไฟล์ external-api.js
// ตัวอย่างการเรียก (CMD): curl.exe "http://localhost:3000/api/v1/external/notify?message=ทดสอบ"
app.get("/api/v1/external/notify", async (req, res, next) => {
  const { message } = req.query;

  // ตรวจว่ามีข้อความ และไม่ใช่ข้อความว่าง
  if (typeof message !== "string" || message.trim() === "") {
    return sendError(res, 400, "VALIDATION_ERROR", "กรุณาระบุ message");
  }

  // จำกัดความยาวไม่เกิน 500 ตัวอักษร
  if (message.length > 500) {
    return sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "message ต้องมีความยาวไม่เกิน 500 ตัวอักษร",
    );
  }

  try {
    const result = await sendNotification(message.trim(), {
      title: "Manual notification",
      tags: "bell",
    });

    // ส่งไม่สำเร็จ ตอบ 503 พร้อมข้อความจาก fallback
    if (!result.delivered) {
      return sendError(
        res,
        503,
        "EXTERNAL_SERVICE_UNAVAILABLE",
        result.message,
      );
    }

    res.status(200).json({
      message: result.message,
      data: { delivered: true, attempts: result.attempts },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// ตัวจัดการ error ท้ายสุด (ต้องอยู่หลัง route ทั้งหมดเสมอ)
// =====================================================

// 404: ถ้า request ไม่ตรงกับ route ใด ๆ ที่ลงทะเบียนไว้ จะมาถึงตรงนี้
app.use((req, res) => {
  sendError(res, 404, "ROUTE_NOT_FOUND", "ไม่พบเส้นทางที่ร้องขอ");
});

// Error-Handling Middleware: รับ error ทุกตัวที่ถูกส่งด้วย next(err)
// (Express จะรู้ว่าเป็นตัวนี้เพราะมี parameter ครบ 4 ตัว: err, req, res, next)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // พิมพ์ stack trace ออกทาง console เพื่อให้นักพัฒนาตรวจสอบ
  console.error(err.stack);

  // AggregateError (เช่น mysql2 ต่อฐานข้อมูลไม่ได้) จะเก็บสาเหตุจริงไว้ใน err.errors
  // ต้องพิมพ์ออกมาด้วย ไม่อย่างนั้น log จะเห็นแค่คำว่า "AggregateError" เฉย ๆ
  if (Array.isArray(err.errors)) {
    const innerMessages = err.errors
      .map((e) => `${e.code || e.name}: ${e.message}`)
      .join(" | ");
    console.error("inner errors:", innerMessages);
  }

  // ถ้าเป็น error จากฐานข้อมูล ให้พิมพ์รหัสและข้อความของ SQL ด้วย
  if (err.code || err.sqlMessage) {
    console.error("db error:", err.code, err.sqlMessage || "");
  }

  // หา status code: ถ้า error มีค่า status ให้ใช้ค่านั้น ถ้าไม่มีใช้ 500
  const statusCode = err.status || err.statusCode || 500;

  // ตอบกลับไปหาผู้ใช้
  // - ถ้าเป็น 500 (ข้อผิดพลาดภายใน) จะไม่แสดงรายละเอียดจริงให้ผู้ใช้เห็น เพื่อความปลอดภัย
  // - ถ้าเป็น error อื่น (เช่น 400 จาก body parser) ให้แสดงข้อความจริงของ error นั้น
  const isInternalError = statusCode === 500;
  res.status(statusCode).json({
    error: {
      code: isInternalError ? "INTERNAL_SERVER_ERROR" : err.type || "ERROR",
      message: isInternalError
        ? "เกิดข้อผิดพลาดที่ไม่คาดคิดภายในระบบ"
        : err.message,
    },
  });
});

// ===== ขั้นที่ 4: เปิด server =====
// require.main === module หมายความว่า "ไฟล์นี้ถูกรันโดยตรง" (เช่น npm start)
// ถ้าไฟล์นี้ถูก require จากที่อื่น (เช่น จากการทดสอบ) จะไม่เปิด server ให้อัตโนมัติ
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server กำลังทำงานที่ http://localhost:${PORT}`);
    console.log(
      `Server กำลังทำงานที่ http://localhost:${PORT}/api-docs (Swagger UI)`,
    );
    console.log(`Server กำลังทำงานที่ http://localhost:${PORT}/app (Frontend)`);
  });
}

// ส่งออก app เพื่อให้ไฟล์ทดสอบนำไปใช้งานได้
module.exports = { app };

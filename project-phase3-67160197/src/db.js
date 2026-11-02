/**
 * ไฟล์สร้าง "Connection Pool" สำหรับเชื่อมต่อฐานข้อมูล MySQL
 *
 * Pool คือกลุ่มการเชื่อมต่อที่เปิดค้างไว้ให้ใช้ซ้ำได้
 * ช่วยให้ไม่ต้องเปิด-ปิดการเชื่อมต่อใหม่ทุกครั้งที่มี request เข้ามา
 *
 * ค่าการเชื่อมต่อทั้งหมดอ่านจากไฟล์ .env
 * (index.js เรียก dotenv ก่อนที่จะ require ไฟล์นี้ จึงมั่นใจว่าค่าโหลดแล้ว)
 */

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST, // ที่อยู่ของเซิร์ฟเวอร์ฐานข้อมูล
  user: process.env.DB_USER, // ชื่อผู้ใช้ฐานข้อมูล
  password: process.env.DB_PASSWORD, // รหัสผ่าน
  database: process.env.DB_NAME, // ชื่อฐานข้อมูลที่จะใช้
  port: process.env.DB_PORT || 3307, // พอร์ต ถ้าไม่ได้ตั้งค่าจะใช้ 3307

  waitForConnections: true, // ถ้า connection เต็ม ให้รอคิว แทนการ error ทันที
  connectionLimit: 10, // เปิดการเชื่อมต่อพร้อมกันได้สูงสุด 10 ตัว
  queueLimit: 0, // จำนวนคำขอที่รอคิวได้ไม่จำกัด (0 = ไม่จำกัด)

  dateStrings: true, // อ่านค่า DATE/DATETIME ออกมาเป็น string เช่น "2026-10-29" แทนการเป็น Date object
});

module.exports = pool;

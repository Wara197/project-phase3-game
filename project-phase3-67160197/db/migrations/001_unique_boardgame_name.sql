-- Migration: ทำให้ชื่อบอร์ดเกมไม่ซ้ำ
-- ** สำรองข้อมูลก่อนรันเสมอ: mysqldump -P 3307 -uroot -p boardgame_db > backup.sql **
USE boardgame_db;

-- 1) ย้ายประวัติการยืมจากรายการซ้ำ ไปยังรายการที่ id น้อยที่สุดของชื่อเดียวกัน
UPDATE borrowings br
JOIN boardgames dup ON dup.id = br.boardgame_id
SET br.boardgame_id = (SELECT MIN(k.id) FROM boardgames k WHERE k.name = dup.name)
WHERE dup.id <> (SELECT MIN(k.id) FROM boardgames k WHERE k.name = dup.name);

-- 2) ลบรายการบอร์ดเกมที่ซ้ำ (เก็บ id ที่น้อยที่สุดไว้)
DELETE g FROM boardgames g
JOIN boardgames k ON k.name = g.name AND k.id < g.id;

-- 3) เพิ่ม UNIQUE key
ALTER TABLE boardgames ADD UNIQUE KEY uq_boardgame_name (name);

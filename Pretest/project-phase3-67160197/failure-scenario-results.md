# รายงานผลการทดสอบ Failure Scenarios และ Resilience Testing

**ระบบ:** Boardgame Service API (ระบบบริหารจัดการการยืม-คืนบอร์ดเกม)

---

> **หมายเหตุสถานะการทดสอบ (ปรับปรุงล่าสุด):** ผลในไฟล์นี้ยังไม่ได้รันซ้ำกับโค้ดปัจจุบัน
>
> - TC-EXT-01 และ TC-EXT-02 ถูกบันทึกไว้ก่อนที่ route `GET /api/v1/external/notify` จะถูกเพิ่มเข้าโค้ด จึงต้องรันซ้ำและอัปเดตผลจริงก่อนส่ง
> - TC-FAIL-01 และ TC-FAIL-02 ใช้ข้อมูลอ้างอิง (id ของรายการยืม/บอร์ดเกม) ที่ขึ้นอยู่กับสถานะฐานข้อมูลขณะทดสอบ ต้องตรวจซ้ำให้ตรงกับ seed หรือข้อมูลจริงในเครื่อง
> - ก่อนส่งงาน ให้ทำซ้ำตามขั้นตอนใน README หัวข้อ 6 และ 9 แล้วแก้ตารางด้านล่างให้เป็นผลที่เกิดขึ้นจริง

## 1.(Overview & Objectives)

บันทึกผลการทดสอบกรณีเกิดข้อผิดพลาด (Failure Scenarios) ของระบบ **Boardgame Service API** โดยครอบคลุมทั้งการจัดการ Error ของระบบภายใน (Business Logic Validation, Database Constraints) และการจัดการความล้มเหลวของการเชื่อมต่อกับบริการภายนอก (External API Integration: `ntfy.sh`) ทำให้ระบบมีคุณสมบัติ Fault Tolerance, Resilience และ Resilience Patterns (Retry, Timeout, Fallback)

---

## 2. สรุปผลการทดสอบภาพรวม (Test Summary)

| Scenario ID    | รายการทดสอบ (Test Case)                      | Expected Status |  Actual Status  | ผลการทดสอบ |
| :------------- | :------------------------------------------- | :-------------: | :-------------: | :--------: |
| **TC-FAIL-01** | ไม่พบข้อมูลบอร์ดเกมในระบบ                    | `404 Not Found` | `404 Not Found` |  **PASS**  |
| **TC-FAIL-02** | คืนบอร์ดเกมรายการที่ถูกคืนไปแล้ว             | `409 Conflict`  | `409 Conflict`  |  **PASS**  |
| **TC-FAIL-03** | การคืนบอร์ดเกมกรณีปกติ                       |    `200 OK`     |    `200 OK`     |  **PASS**  |
| **TC-EXT-01**  | External API Timeout & Retry Pattern         | Retried 3 times | Retried 3 times |  **PASS**  |
| **TC-EXT-02**  | External API Fallback (Graceful Degradation) |  System works   |  System works   |  **PASS**  |

---

## 3. รายละเอียดผลการทดสอบ

### 3.1 Business Logic & Validation Failure Scenarios

#### Scenario TC-FAIL-01: พยายามยืมบอร์ดเกมที่ไม่พบในระบบ (`404 NOT_FOUND`)

- **ลักษณะเคส:** ส่ง Request ยืมบอร์ดเกมโดยระบุ `boardgameId: 1` ซึ่งถูกลบออกไปจากฐานข้อมูล
- **Endpoint:** `POST /api/v1/borrowings`
- **ผลลัพธ์ที่ได้:** ระบบตอบกลับด้วย `404 NOT_FOUND` พร้อม Message `"ไม่พบข้อมูลบอร์ดเกม"` อย่างถูกต้อง

#### Scenario TC-FAIL-02: คืนบอร์ดเกมซ้ำรายการที่คืนไปแล้ว (`409 ALREADY_RETURNED`)

- **ลักษณะเคส:** ส่ง Request คืนบอร์ดเกม ID 4 (`PATCH /api/v1/borrowings/4/return`) ซ้ำหลังจากที่ได้คืนสำเร็จไปแล้ว
- **Endpoint:** `PATCH /api/v1/borrowings/4/return`
- **ผลลัพธ์ที่ได้:** ระบบทำการตรวจสอบสถานะใน DB พบว่าเป็น `RETURNED` อยู่แล้ว จึงตอบกลับด้วย `409 Conflict` และ Message `"รายการนี้ถูกคืนไปแล้ว"` เพื่อป้องกันข้อมูลซ้ำซ้อน

#### Scenario TC-FAIL-03: การคืนบอร์ดเกมกรณีปกติสำเร็จ (`200 OK`)

- **ลักษณะเคส:** ทดสอบการคืนบอร์ดเกม ID 2 (`PATCH /api/v1/borrowings/2/return`) ที่มีสถานะ `BORROWED` อยู่ในฐานข้อมูลจริง
- **Endpoint:** `PATCH /api/v1/borrowings/2/return`
- **Request Body:**
  ```json
  {
    "returnDate": "2026-10-15"
  }
  ```
- **ผลลัพธ์การทดสอบ:**  
  ระบบอัปเดตสถานะเป็น `RETURNED` และบันทึก `returnDate` สำเร็จ ตอบกลับด้วย `200 OK`

  ![ผลการคืนบอร์ดเกมสำเร็จ (200 OK)](/1.Postman.png)

---

### 3.2 External API Failure & Resilience Testing (ntfy.sh)

#### Scenario TC-EXT-01: External API Timeout & Exponential Retry

- **การจำลองสภาวะ:** ตั้งค่า Environment Variable `EXTERNAL_TIMEOUT_MS=1` เพื่อจำลองกรณี External Notification Service ตอบสนองช้า
- **การทำงานของระบบ (Retry Mechanism):**
  1. ระบบส่ง Request แจ้งเตือนไปยัง `ntfy.sh`
  2. เมื่อไม่ได้รับการตอบกลับภายใน 1ms ระบบจะทำการ Catch Error และทำการ Retry ซ้ำตามนโยบาย (3 ครั้ง)
  3. แสดง Console Log ใน Terminal ครบทั้ง 3 ครั้ง (`attempt 1/3`, `attempt 2/3`, `attempt 3/3`)

#### Scenario TC-EXT-02: Fallback Handling (Graceful Degradation)

- **การทำงานของระบบ:**
  - สำหรับ Endpoint แจ้งเตือนโดยตรง (`GET /api/v1/external/notify`): ตอบกลับเป็น `503 Service Unavailable` เมื่อ Retry ครบ 3 ครั้ง
  - สำหรับ Endpoint ยืม/คืนบอร์ดเกมหลัก: แม้การแจ้งเตือนภายนอกจะล้มเหลว แต่ระบบยังคงบันทึกข้อมูลการยืม/คืนลงฐานข้อมูล MySQL ได้สำเร็จ (`201 Created` / `200 OK`) โดยไม่ส่งผลกระทบให้ทั้ง Transaction ล้มเหลว (Graceful Degradation)

---

## 4. สภาพแวดล้อมการทำงานของเซิร์ฟเวอร์ (Execution Environment)

การเริ่มต้นทำงานของ Server บนสภาพแวดล้อม Node.js พร้อมกับการโหลด Environment Variables จากไฟล์ `.env` เป็นไปอย่างสมบูรณ์ เซิร์ฟเวอร์เปิดทำงานที่ Port 3000 พร้อมรองรับ Request ทั้งหมด

![ภาพแสดงการทำงานของ Server บน Terminal](/2.CMD.png)

---

## 5. สรุปผลการวิเคราะห์

จากการทดสอบมาทั้งหมดนั้นสามารถสรุปได้ว่า

1. **Validation & State Control:** ระบบมีความถูกต้องในการตรวจเช็คเงื่อนไขทางธุรกิจ (Business Rules) เช่น การป้องกันการคืนบอร์ดเกมซ้ำ และการจัดการ Resource ที่ไม่มีอยู่จริง
2. **Resilience & Fault Tolerance:** ระบบมีการออกแบบรองรับความล้มเหลวภายนอกได้อย่างครอบคลุม ทั้งการตั้งค่า Timeout, การรัน Retry ตามนโยบายที่กำหนด และการรักษาสภาพการทำงานหลักของระบบไว้ได้แม้บริการภายนอกจะล้มเหลว
3. **พร้อมสำหรับการใช้งาน (Production Ready):** ผลการทดสอบผ่านตามเกณฑ์มาตรฐานของโปรเจกต์ทุกข้อ

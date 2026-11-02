/**
 * ไฟล์เชื่อมต่อ API ภายนอก (ntfy.sh) เพื่อส่งการแจ้งเตือนการยืม/คืนบอร์ดเกม
 *
 * มีระบบป้องกันความล้มเหลว 3 อย่าง
 *   1. Retry      : ถ้าเรียกไม่สำเร็จ จะลองใหม่อีกหลายครั้ง โดยรอนานขึ้นเรื่อย ๆ (Exponential Backoff)
 *   2. Timeout    : ถ้าเซิร์ฟเวอร์ปลายทางตอบช้าเกินกำหนด จะตัดการรอทิ้ง
 *   3. Fallback   : ถ้าส่งไม่สำเร็จจริง ๆ จะไม่ทำให้ระบบหลักพัง แค่คืนสถานะกลับไป
 */

/** ฟังก์ชันหยุดรอ (หน่วงเวลา) ตามจำนวน ms ที่กำหนด */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * อ่านค่าตัวเลขจาก environment variable
 * ถ้าไม่มีค่า หรือค่าไม่ใช่ตัวเลขที่ไม่ติดลบ จะใช้ค่า fallback แทน
 */
const readNonNegativeNumberEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  const isValidNumber = Number.isFinite(value) && value >= 0;
  return isValidNumber ? value : fallback;
};

/**
 * ค่าตั้งต้นของระบบ Retry และ Timeout
 * สามารถปรับได้จากไฟล์ .env โดยไม่ต้องแก้โค้ด
 */
const getDefaultSettings = () => {
  return {
    // ตัดการรอเมื่อเกินเวลานี้ (ค่าตั้งต้น 2 วินาที)
    timeoutMs: readNonNegativeNumberEnv("EXTERNAL_TIMEOUT_MS", 2000),

    // จำนวนครั้งที่ "ลองใหม่" หลังจากครั้งแรก (ค่าตั้งต้น 2 ครั้ง รวมครั้งแรกเป็น 3 ครั้ง)
    retries: readNonNegativeNumberEnv("EXTERNAL_MAX_RETRIES", 2),

    // ระยะเวลารอก่อนลองใหม่ครั้งแรก (ค่าตั้งต้น 300 ms)
    baseDelayMs: readNonNegativeNumberEnv("EXTERNAL_RETRY_DELAY_MS", 300),
  };
};

/**
 * ฟังก์ชันเรียก HTTP request พร้อม Timeout และ Retry
 *
 * @param {string} url      ที่อยู่ปลายทาง
 * @param {object} init     ตัวเลือกของ fetch เช่น method, headers, body
 * @param {object} options  ค่าที่จะ override จากค่าตั้งต้น (timeoutMs, retries, baseDelayMs)
 * @returns {Promise<object>} ผลลัพธ์ที่มี ok, attempts, status และ error (ถ้าล้มเหลว)
 */
async function requestWithRetry(url, init = {}, options = {}) {
  // รวมค่าตั้งต้นกับค่าที่ส่งเข้ามา (ค่าที่ส่งมาจะทับค่าตั้งต้น)
  const settings = { ...getDefaultSettings(), ...options };
  const { timeoutMs, retries, baseDelayMs } = settings;

  // จำนวนครั้งสูงสุดที่จะเรียก = ลองใหม่ + 1 (ครั้งแรก)
  const maxAttempts = retries + 1;

  // ตัวแปรเก็บสถานะล่าสุด ไว้ใช้ตอนสรุปผลตอนท้าย
  let lastError = "unknown error";
  let lastStatus;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptsMade = attempt;

    // ค่าเริ่มต้นว่า "ควร retry ได้" เสมอ จนกว่าจะพบว่าไม่ควร
    let shouldRetry = true;

    try {
      // Timeout: AbortSignal.timeout จะยกเลิก request ทันทีเมื่อเกินเวลาที่กำหนด
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      lastStatus = response.status;

      // ถ้าสำเร็จ (status 2xx) ให้คืนผลทันที ไม่ต้อง retry อีก
      if (response.ok) {
        console.log(
          `[external-api] attempt ${attempt}/${maxAttempts} OK (${response.status})`,
        );
        return { ok: true, attempts: attempt, status: response.status };
      }

      // ถ้าไม่สำเร็จ บันทึกข้อผิดพลาดไว้
      lastError = `HTTP ${response.status}`;

      // Retry เฉพาะกรณี Server Error (5xx) เท่านั้น
      // ส่วน 4xx (เช่น 400, 404) เป็นความผิดของคำขอเอง ลองใหม่ก็ไม่ได้ผล จึงไม่ retry
      shouldRetry = response.status >= 500;
    } catch (err) {
      // เข้ามาที่นี่เมื่อเกิด Timeout หรือปัญหาเครือข่าย (เช่น เชื่อมต่อไม่ได้)
      lastStatus = undefined;

      const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
      if (isTimeout) {
        lastError = `Timeout after ${timeoutMs}ms`;
      } else {
        lastError = `Network error: ${err.message}`;
      }

      // ปัญหาเครือข่ายหรือ timeout ถือว่าชั่วคราว จึง retry ได้
      shouldRetry = true;
    }

    console.warn(
      `[external-api] attempt ${attempt}/${maxAttempts} failed: ${lastError}`,
    );

    // ถ้าไม่ควร retry หรือ ครบจำนวนครั้งแล้ว ให้หยุดวนลูป
    const isLastAttempt = attempt === maxAttempts;
    if (!shouldRetry || isLastAttempt) {
      break;
    }

    // Exponential Backoff: รอนานขึ้นทุกครั้ง เช่น 300ms -> 600ms -> 1200ms
    // สูตร: baseDelayMs * 2^(attempt - 1)
    const delay = baseDelayMs * 2 ** (attempt - 1);
    await sleep(delay);
  }

  // ลองครบแล้วยังไม่สำเร็จ คืนผลแบบล้มเหลว
  return {
    ok: false,
    attempts: attemptsMade,
    status: lastStatus,
    error: lastError,
  };
}

/**
 * ส่งข้อความแจ้งเตือนไปยัง ntfy.sh
 *
 * ไม่ throw error ออกไปเลย แม้จะส่งไม่สำเร็จ
 * เพื่อไม่ให้การแจ้งเตือนไปกระทบการยืม/คืนที่บันทึกไปแล้ว (Fallback)
 *
 * @param {string} message       ข้อความที่จะส่ง
 * @param {object} opts          ตัวเลือก เช่น url, topic, title, tags
 * @param {object} retryOptions  ค่าที่ส่งต่อให้ requestWithRetry
 */
async function sendNotification(message, opts = {}, retryOptions = {}) {
  try {
    // เลือกที่อยู่ปลายทาง: ใช้ opts.url ก่อน ถ้าไม่มีค่อยใช้ NOTIFY_URL ถ้าไม่มีอีกใช้ ntfy.sh
    const baseUrl = opts.url || process.env.NOTIFY_URL || "https://ntfy.sh";

    // เลือกหัวข้อ (topic) ที่จะส่งเข้า
    const topic =
      opts.topic || process.env.NOTIFY_TOPIC || "boardgames-notification";

    // ตัด "/" ท้ายของ baseUrl ออก แล้วต่อด้วยชื่อ topic (encode ให้ปลอดภัยกับ URL)
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    const fullUrl = `${cleanBaseUrl}/${encodeURIComponent(topic)}`;

    // ส่งข้อความด้วย POST พร้อมระบบ retry และ timeout
    const result = await requestWithRetry(
      fullUrl,
      {
        method: "POST",
        headers: {
          Title: opts.title || "Boardgames Notification",
          Tags: opts.tags || "game_die",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: message,
      },
      retryOptions,
    );

    // ส่งสำเร็จ
    if (result.ok) {
      return {
        delivered: true,
        attempts: result.attempts,
        message: "ส่งการแจ้งเตือนสำเร็จ",
      };
    }

    // ส่งไม่สำเร็จ (หลัง retry ครบแล้ว): บันทึก log และคืนสถานะ Fallback
    // ไม่ throw error เพื่อไม่ให้แอปหลักพัง
    console.error(
      `[external-api] Notification failed after ${result.attempts} attempt(s): ${result.error}. Fallback executed.`,
    );
    return {
      delivered: false,
      attempts: result.attempts,
      message:
        "ทำรายการสำเร็จ แต่ระบบแจ้งเตือนภายนอกไม่พร้อมใช้งานในขณะนี้ (Fallback Executed)",
    };
  } catch (fatalErr) {
    // กรณีผิดพลาดที่ไม่คาดคิด (เช่น โค้ดภายในพัง) ก็ยังไม่ให้แอปหลักล่ม
    console.error(
      "[external-api] Unexpected error (Fallback):",
      fatalErr.message,
    );
    return {
      delivered: false,
      attempts: 1,
      message: "ทำรายการสำเร็จ แต่ระบบแจ้งเตือนภายนอกขัดข้อง",
    };
  }
}

/**
 * แจ้งเตือนเมื่อมีการยืมบอร์ดเกม
 * ข้อความตัวอย่าง: สมาชิก #3 ยืม "Catan" เมื่อ 2026-10-29
 */
const notifyBorrowed = ({ memberId, boardgameName, borrowDate }) => {
  const message = `สมาชิก #${memberId} ยืม "${boardgameName}" เมื่อ ${borrowDate}`;
  return sendNotification(message, {
    title: "Boardgame borrowed",
    tags: "inbox_tray",
  });
};

/**
 * แจ้งเตือนเมื่อมีการคืนบอร์ดเกม
 * ข้อความตัวอย่าง: สมาชิก #3 คืน "Catan" เมื่อ 2026-10-30
 */
const notifyReturned = ({ memberId, boardgameName, returnDate }) => {
  const message = `สมาชิก #${memberId} คืน "${boardgameName}" เมื่อ ${returnDate}`;
  return sendNotification(message, {
    title: "Boardgame returned",
    tags: "outbox_tray",
  });
};

module.exports = {
  requestWithRetry,
  sendNotification,
  notifyBorrowed,
  notifyReturned,
};

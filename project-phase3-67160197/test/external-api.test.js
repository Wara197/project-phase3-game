const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const ext = require("../src/services/external-api");

const ENV_KEYS = [
  "EXTERNAL_TIMEOUT_MS",
  "EXTERNAL_MAX_RETRIES",
  "EXTERNAL_RETRY_DELAY_MS",
  "NOTIFY_URL",
  "NOTIFY_TOPIC",
];

const realFetch = globalThis.fetch;
let savedEnv;

/** mock fetch: responder(callNumber, url, init) ต้องคืน { status } หรือ throw */
function mockFetch(responder) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return responder(calls.length, url, init);
  };
  return calls;
}

const res = (status) => ({ ok: status >= 200 && status < 300, status });
const fast = { timeoutMs: 200, retries: 2, baseDelayMs: 1 };

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  mock.method(console, "log", () => {});
  mock.method(console, "warn", () => {});
  mock.method(console, "error", () => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  mock.restoreAll();
});

describe("requestWithRetry", () => {
  it("สำเร็จในครั้งแรกไม่ retry", async () => {
    const calls = mockFetch(() => res(200));
    const out = await ext.requestWithRetry("https://x.test", {}, fast);
    assert.deepEqual(out, { ok: true, attempts: 1, status: 200 });
    assert.equal(calls.length, 1);
  });

  it("retry เมื่อเจอ 5xx จนกว่าจะสำเร็จ", async () => {
    mockFetch((n) => res(n < 3 ? 503 : 200));
    const out = await ext.requestWithRetry("https://x.test", {}, fast);
    assert.equal(out.ok, true);
    assert.equal(out.attempts, 3);
  });

  it("ไม่ retry เมื่อเจอ 4xx (ปัญหาจากฝั่ง client)", async () => {
    const calls = mockFetch(() => res(404));
    const out = await ext.requestWithRetry("https://x.test", {}, fast);
    assert.equal(out.ok, false);
    assert.equal(out.attempts, 1);
    assert.equal(out.status, 404);
    assert.equal(out.error, "HTTP 404");
    assert.equal(calls.length, 1);
  });

  it("หยุดที่จำนวน retry สูงสุดเมื่อ 5xx ต่อเนื่อง", async () => {
    const calls = mockFetch(() => res(500));
    const out = await ext.requestWithRetry("https://x.test", {}, fast);
    assert.equal(out.ok, false);
    assert.equal(out.attempts, 3); // 1 ครั้งแรก + retry 2 ครั้ง
    assert.equal(out.error, "HTTP 500");
    assert.equal(calls.length, 3);
  });

  it("retry เมื่อเกิด network error และรายงานข้อความ error เมื่อล้มเหลวทั้งหมด", async () => {
    mockFetch((n) => {
      if (n === 1) throw new Error("ECONNRESET");
      return res(200);
    });
    const ok = await ext.requestWithRetry("https://x.test", {}, fast);
    assert.equal(ok.ok, true);
    assert.equal(ok.attempts, 2);

    mockFetch(() => {
      throw new Error("boom");
    });
    const fail = await ext.requestWithRetry("https://x.test", {}, fast);
    assert.equal(fail.ok, false);
    assert.equal(fail.error, "Network error: boom");
    assert.equal(fail.status, undefined);
  });

  it("ตัดการเชื่อมต่อเมื่อเกิน timeout และรายงาน Timeout", async () => {
    // จำลอง server ที่ไม่ตอบกลับ: ใช้ interval ที่ ref ไว้เพื่อให้ event loop ยังทำงานรอ
    // (AbortSignal.timeout ใช้ timer ที่ unref อยู่ จึงไม่ค้าง process เอง)
    mockFetch(
      (_n, _url, init) =>
        new Promise((_resolve, reject) => {
          const keepAlive = setInterval(() => {}, 1000);
          init.signal.addEventListener("abort", () => {
            clearInterval(keepAlive);
            reject(init.signal.reason);
          });
        }),
    );
    const out = await ext.requestWithRetry(
      "https://x.test",
      {},
      { timeoutMs: 20, retries: 1, baseDelayMs: 1 },
    );
    assert.equal(out.ok, false);
    assert.equal(out.attempts, 2);
    assert.equal(out.error, "Timeout after 20ms");
  });

  it("ใช้ Exponential Backoff ระหว่างการ retry", async () => {
    mockFetch(() => res(500));
    const start = Date.now();
    await ext.requestWithRetry("https://x.test", {}, { ...fast, baseDelayMs: 30 });
    // delay = 30ms + 60ms = 90ms (ตรวจเฉพาะขอบล่างเพื่อกัน test flaky)
    assert.ok(Date.now() - start >= 85, "ควรรอตาม exponential backoff");
  });

  it("อ่านค่า retry/timeout จาก environment variable และ fallback เมื่อค่าไม่ถูกต้อง", async () => {
    process.env.EXTERNAL_MAX_RETRIES = "0";
    process.env.EXTERNAL_RETRY_DELAY_MS = "1";
    const calls = mockFetch(() => res(500));
    const out = await ext.requestWithRetry("https://x.test");
    assert.equal(out.attempts, 1);
    assert.equal(calls.length, 1);

    process.env.EXTERNAL_MAX_RETRIES = "abc"; // ไม่ถูกต้อง -> ใช้ค่าเริ่มต้น 2
    const calls2 = mockFetch(() => res(500));
    const out2 = await ext.requestWithRetry("https://x.test");
    assert.equal(out2.attempts, 3);
    assert.equal(calls2.length, 3);
  });
});

describe("sendNotification", () => {
  it("ส่ง POST พร้อม header และ body ตามที่กำหนด แล้วคืน delivered = true", async () => {
    const calls = mockFetch(() => res(200));
    const out = await ext.sendNotification("hello", { title: "T", tags: "bell" }, fast);

    assert.equal(out.delivered, true);
    assert.equal(out.attempts, 1);
    assert.equal(out.message, "ส่งการแจ้งเตือนสำเร็จ");
    assert.equal(calls[0].url, "https://ntfy.sh/boardgames-notification");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.body, "hello");
    assert.equal(calls[0].init.headers.Title, "T");
    assert.equal(calls[0].init.headers.Tags, "bell");
  });

  it("ใช้ opts.url / opts.topic, ตัด / ท้ายสุดของ url และ encode topic", async () => {
    const calls = mockFetch(() => res(200));
    await ext.sendNotification("m", { url: "https://custom.test/", topic: "a b/c" }, fast);
    assert.equal(calls[0].url, "https://custom.test/a%20b%2Fc");
  });

  it("ใช้ค่าจาก environment variable เมื่อไม่ได้ส่ง opts", async () => {
    process.env.NOTIFY_URL = "https://env.test";
    process.env.NOTIFY_TOPIC = "env-topic";
    const calls = mockFetch(() => res(200));
    await ext.sendNotification("m", {}, fast);
    assert.equal(calls[0].url, "https://env.test/env-topic");
  });

  it("เมื่อล้มเหลวทั้งหมดต้องไม่ throw และคืน Fallback message", async () => {
    mockFetch(() => res(500));
    const out = await ext.sendNotification("m", {}, fast);
    assert.equal(out.delivered, false);
    assert.equal(out.attempts, 3);
    assert.match(out.message, /Fallback|ไม่พร้อมใช้งาน/);
  });

  it("ดักข้อผิดพลาดที่ไม่คาดคิด (fatal) และคืน fallback โดยไม่ throw", async () => {
    mockFetch(() => res(200));
    const out = await ext.sendNotification("m", { url: 123 }, fast); // 123.replace ไม่มี -> TypeError
    assert.equal(out.delivered, false);
    assert.equal(out.attempts, 1);
    assert.match(out.message, /ขัดข้อง/);
  });
});

describe("notifyBorrowed / notifyReturned", () => {
  it("notifyBorrowed สร้างข้อความและ header ของการยืม", async () => {
    const calls = mockFetch(() => res(200));
    const out = await ext.notifyBorrowed({
      memberId: 7,
      boardgameName: "Catan",
      borrowDate: "2026-10-25",
    });
    assert.equal(out.delivered, true);
    assert.equal(calls[0].init.body, 'สมาชิก #7 ยืม "Catan" เมื่อ 2026-10-25');
    assert.equal(calls[0].init.headers.Title, "Boardgame borrowed");
  });

  it("notifyReturned สร้างข้อความและ header ของการคืน", async () => {
    const calls = mockFetch(() => res(200));
    await ext.notifyReturned({
      memberId: 3,
      boardgameName: "Uno",
      returnDate: "2026-10-30",
    });
    assert.equal(calls[0].init.body, 'สมาชิก #3 คืน "Uno" เมื่อ 2026-10-30');
    assert.equal(calls[0].init.headers.Title, "Boardgame returned");
  });
});

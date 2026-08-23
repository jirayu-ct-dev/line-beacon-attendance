# แผนที่โค้ด: LINE Beacon Attendance (repo นี้)

เฉพาะ repo นี้ — โปรเจกต์ใช้ LINE Beacon ทำระบบเช็คชื่อนักศึกษา ถ้าคัดลอก skill นี้ไป
โปรเจกต์อื่น ลบไฟล์นี้ทิ้งได้

## ไฟล์หลักฝั่ง API (`apps/api/src/modules/line/`)

| ไฟล์ | หน้าที่ |
|---|---|
| `line-webhook.controller.ts` + `line-webhook.service.ts` | pipeline รับ webhook: verify signature → persist (UNIQUE `webhook_event_id`) → ตอบ 200 → ประมวลผล async (fire-and-forget ผ่าน `setImmediate`, decision D1) |
| `beacon-event.service.ts` | engine ตัดสินผลต่อ event: หา student จาก line_accounts → beacon ตาม hwid → activity PUBLISHED ที่ลิงก์ beacon → ตัดสิน PRESENT/LATE ด้วย event timestamp → สร้าง attendance (UNIQUE(activity_id, student_id) เป็นด่านสุดท้าย) → DUPLICATE ส่งข้อความ ALREADY_CHECKED_IN |
| `line-notification.service.ts` | reply ก่อน push, บันทึกตาราง `notifications` ทุกครั้ง, cooldown ต่อ (student, type, activity) ภายใน `NOTIFICATION_COOLDOWN_MINUTES` (ดีฟอลต์ 10) |
| `line-token.service.ts` | verify LINE ID token กับ JWKS (issuer + audience = LINE_LOGIN_CHANNEL_ID, ES256) |
| `line-link.service.ts` + `me.controller.ts` + `line-link.controller.ts` | ผูก/ถอนบัญชี (`/line/link`, `/line/unlink` — รหัสนักศึกษา 12 หลัก + วันเกิด DDMMYYYY ค.ศ. + rate limit 5 ครั้ง/ชม.) และ endpoint ฝั่งผู้ใช้ (`GET /me`, `/me/attendances`, `/me/activities`) ด้วย Bearer ID token |
| `line-messages.ts` | ข้อความไทยทุกแบบ (plain text) + NOTIFICATION_TYPES |
| `line-auth.guard.ts` | guard Bearer ID token สำหรับทุก endpoint `/me*`, `/line/*` |

## ฝั่งเว็บ (`apps/web/app/`)

- `composables/useLiff.ts` — state LIFF (`initializing/ready/error/unconfigured`), `getIdToken()`, `login()`
- `composables/useLiffSession.ts` — session กลาง (token + `GET /me`) แชร์ทั้ง layout และทุกหน้า
- `components/LiffPageGate.vue` — state ร่วมของทุกหน้า LIFF + redirect ผู้ยังไม่ลิงก์ไป `/liff/register`
- `pages/liff/` — register / activities / activities/[id] / history / profile
- งาน UI ทุกชนิดยึด skill `web-ui-coding-standards`

## เอกสาร

- `docs/line-beacon-attendance-project-spec.md` — requirement ต้นทาง (§54 core rules มีลำดับสูงสุด)
- `docs/system-design-tech-stack.md` — สถาปัตยกรรม + Decision Log D1–D7

## Env ที่เกี่ยวข้อง (ห้าม commit จริง)

| ตัวแปร | ใช้ที่ไหน |
|---|---|
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | Messaging API (verify signature / reply+push) |
| `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` | LINE Login (audience ตอน verify ID token) |
| `LIFF_ID` (api) / `NUXT_PUBLIC_LIFF_ID` (web) | LIFF app id — ตัว web สำคัญจริง, ตัว api ประกาศตามสเปก |
| `NOTIFICATION_COOLDOWN_MINUTES` | หน้าต่าง cooldown ข้อความ |

## กฎธุรกิจที่ห้ามละเมิด (สรุปจากสเปก — เกี่ยวกับโค้ด LINE โดยตรง)

- Attendance ห้ามซ้ำ: `UNIQUE(activity_id, student_id)` คือด่านสุดท้าย
- `check_in_at` = LINE event timestamp เสมอ; PRESENT/LATE ตัดสินจากเวลาเดียวกัน
- Notification ล้มเหลวห้าม rollback attendance ที่สร้างสำเร็จ
- การ Link LINE: รหัสนักศึกษา 12 หลัก + วันเกิด DDMMYYYY ปี ค.ศ. + rate limit กันเดา
- ทุก path ของ webhook ต้อง idempotent; LINE อาจ redeliver

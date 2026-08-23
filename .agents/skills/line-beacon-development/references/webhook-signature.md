# Webhook และ Signature Verification (LINE Messaging API)

อ่านไฟล์นี้เมื่อต้องเขียน/แก้ webhook endpoint รับ beacon event, ดีบั๊ก signature,
หรือออกแบบการเก็บ/ประมวลผล event — ใช้ได้กับทุก use case (แจ้งเตือน, check-in,
คูปอง, analytics, automation)

## 1. รูปร่าง request ที่ LINE ส่งมา

```text
POST <webhook URL ที่ตั้งใน console>
Content-Type: application/json
x-line-signature: <base64 HMAC-SHA256 ของ raw body ทั้งหมด>
```

Body (beacon event หนึ่ง event):

```json
{
  "destination": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "events": [
    {
      "type": "beacon",
      "replyToken": "nHuyWiB7yP5Z4M3v...",
      "source": { "type": "user", "userId": "Ud34a0658744fe5078c89604c887803ad" },
      "timestamp": 1787497599263,
      "webhookEventId": "01JAZ6F3EXAMPLE00000000000",
      "deliveryContext": { "isRedelivery": false },
      "beacon": { "type": "enter", "hwid": "00000ac5bb", "dm": "" }
    }
  ]
}
```

ฟิลด์ที่ต้องใช้จริง:

| ฟิลด์ | ความหมาย | ข้อควรระวัง |
|---|---|---|
| `webhookEventId` | รหัส event หนึ่งเดียว — idempotency key | LINE retry ใช้ค่าเดิม; ให้ UNIQUE ใน DB |
| `timestamp` | มิลลิวินาที epoch ที่ LINE ตรวจจับเหตุการณ์ | ใช้เป็น "เวลาเหตุการณ์" ไม่ใช่เวลารับ webhook |
| `source.userId` | lineUserId ของผู้ใช้ (ขึ้นต้น `U`) | เชื่อถือได้เพราะผ่าน signature แล้ว |
| `beacon.hwid` | รหัสอุปกรณ์ hex 10 ตัว | เทียบกับตาราง beacon/สถานที่ของระบบ |
| `beacon.type` | `enter` = เข้าพื้นที่; `banner` = กดแบนเนอร์; บางอุปกรณ์มี `stay` | เช็ค type ก่อนประมวลผล — ส่วนใหญ่ใช้เฉพาะ `enter` |
| `beacon.dm` | device message (เฉพาะอุปกรณ์ certified) | ปกติว่างเปล่า อย่าพึ่งพา |
| `replyToken` | ใช้ตอบกลับได้ครั้งเดียว ภายใน ~1 นาที | เก็บไว้ใน raw payload เพื่อใช้ตอนประมวลผล |
| `destination` | bot id ปลายทาง | มักไม่ต้องใช้ |

หมายเหตุ: request เดียวมีได้หลาย event ใน `events[]` (burst ตอนหลายคนเข้าพื้นที่พร้อมกัน)
และ webhook เดียวกันจะส่ง event ประเภทอื่นด้วย (message/follow/unfollow ฯลฯ) —
ให้กรองเฉพาะ `type === 'beacon'` แล้วปล่อยที่เหลือผ่าน (หรือเก็บ log เฉย ๆ)

## 2. Signature verification

หลักการ: `x-line-signature` = `base64(HMAC-SHA256(channelSecret, rawBody))` —
ต้อง verify กับ **raw bytes ที่รับมา** ก่อนแตะอะไรอื่น การ parse JSON แล้ว re-serialize
ก่อน hash จะทำให้ผลเพี้ยน (ลำดับ key/whitespace เปลี่ยน)

Express/NestJS ต้องเปิด raw body สำหรับ route นี้:

```ts
// NestJS: main.ts — เปิด rawBody แล้วอ่าน request.rawBody ใน controller
const app = await NestFactory.create(AppModule, { rawBody: true })
```

```ts
import { validateSignature } from '@line/bot-sdk'

if (!rawBody || !signature || !validateSignature(rawBody, channelSecret, signature)) {
  throw new UnauthorizedException('ลายเซ็น LINE ไม่ถูกต้อง') // → 401, ไม่ persist อะไร
}
```

กรณีไม่มี `channelSecret` ใน config (dev ที่ยังไม่ตั้งค่า): ตอบ 503 เพื่อให้ LINE retry
ภายหลัง ดีกว่าปล่อยผ่านหรือตอบ 200 เฉย ๆ

## 3. รูปแบบ endpoint ที่ถูกต้อง (persist → 200 → process)

```text
ตรวจ signature ──ไม่ผ่าน──> 401 (จบ, ไม่มีร่องรอย)
      |
    ผ่าน
      v
parse JSON ──พัง──> 400
      |
  สำหรับทุก beacon event:
      persist แถว event ดิบ (RECEIVED, UNIQUE webhook_event_id)
      ├── ชน unique ──> ข้าม (retry จาก LINE)
      └── สำเร็จ ──> จัดประมวลผลต่อคิว (fire-and-forget ใน process ก็พอ
                       สำหรับระบบ single-instance)
      v
ตอบ 200 ทันที (อย่ารอประมวลผลเสร็จ)
```

ตาราง event ดิบควรมีอย่างน้อย: `webhook_event_id` (UNIQUE), `line_user_id`, `hwid`,
`event_type`, `event_timestamp`, `processing_status`, `raw_payload`, `created_at`
(เวลาที่ server ได้รับ — ต่างจาก event_timestamp)

`processing_status` ที่ใช้ได้ดี (ปิดทุก event ด้วยผลลัพธ์ชัดเจนเสมอ):
`RECEIVED → PROCESSED | DUPLICATE | UNKNOWN_USER | UNKNOWN_BEACON | NO_ACTIVE_CONTEXT |
OUTSIDE_WINDOW | ERROR` (ปรับชื่อ status ตามโดเมนของงานได้)

## 4. แบบแผนประมวลผล `enter` event (กันซ้ำสองชั้น + ผลลัพธ์ชัดเจน)

ไม่ว่า use case ใด (สร้าง record, ให้คูปอง, นับสแตม, ส่งต่อ automation) โครงเหมือนกัน:

```ts
if (eventType !== 'enter') { markProcessed(); return }   // banner/stay มักไม่ใช้
const user = await mapLineUserToSystemUser(lineUserId)   // line_user_id → ผู้ใช้ของเรา
if (!user) { mark('UNKNOWN_USER'); replyInviteToAddOrRegister(); return }
const place = await findPlaceByHwid(hwid)                // hwid → สถานที่/beacon ของเรา
if (!place) { mark('UNKNOWN_BEACON'); return }           // ไม่ auto-create
if (!isContextActive(place, ts)) { mark('NO_ACTIVE_CONTEXT'); notifyWithCooldown(); return }
// สร้าง "ผลลัพธ์" แบบกันซ้ำ:
const existing = await findByUniqueKey(place.id, user.id)
if (existing) {
  mark('DUPLICATE')
  reply(alreadyDoneMessage(place.name, existing.createdAt)) // ข้อความคนละแบบจาก success
  return
}
await createOutcome({ place, user, at: ts })              // + UNIQUE constraint กัน race
// การส่งแจ้งเตือนล้มเหลวต้องไม่กระทบผลลัพธ์ที่สร้างแล้ว
```

จุดสำคัญ:
- **ตัดสินเวลาด้วย `event_timestamp`** เท่านั้น (ทุกเกณฑ์เวลา เช่น ช่วงเวลาที่ context เปิด)
- **กันซ้ำสองชั้น**: เช็ค existing ก่อน create แล้วให้ **UNIQUE constraint ของตารางผลลัพธ์**
  (เช่น UNIQUE(place_id, user_id) หรือ UNIQUE(context_id, user_id)) เป็นด่านสุดท้าย —
  แพ้ race (P2002 ใน Prisma) = ถือเป็น duplicate ไม่ใช่ error
- **duplicate ≠ เงียบ** — ตอบผู้ใช้ด้วยข้อความคนละแบบจาก success ภายใต้ cooldown
- **ระวังงานที่ต้องนับทุกครั้ง** (analytics/footfall): อย่าใช้ pattern "ข้ามเมื่อเจอซ้ำ"
  กับตารางนับ — ให้ persist ทุก event แล้วนับที่ตาราง event ดิบแทน

## 5. การส่งข้อความหลังประมวลผล

- ใช้ `replyToken` จาก raw payload ของ event ตัวนั้นก่อน (ฟรี) — token หมดอายุ ~1 นาที
  จึงต้องประมวลผลเร็ว; reply ล้ม → push fallback (`to: lineUserId`) — push นับโควตาและ
  ผู้รับต้องเป็นเพื่อน bot
- บันทึกทุกครั้งลงตาราง `notifications` (status PENDING → SENT/FAILED + error_message)
  และ **ห้ามเก็บ token/secret ใน log**
- Cooldown: ก่อนส่ง type ใด เช็ค `findFirst({ status: 'SENT', type, ผู้ใช้, บริบท,
  sentAt >= now - N นาที })` — มีแล้ว = SKIPPED (ไม่ส่ง ไม่บันทึกซ้ำ)
- การส่งล้มเหลวทั้งหมดต้องไม่ทำให้: ผลลัพธ์ธุรกิจที่สร้างแล้ว rollback, หรือ HTTP response
  กลายเป็น non-200

## 6. การทดสอบ (ไม่ต้องมีอุปกรณ์/บัญชีจริง)

1. จำลอง request ที่ลงนามถูกต้อง (สูตร node + openssl ใน SKILL.md §8)
2. Test หลักที่ชุด test ของ webhook engine ควรมี:
   - signature ผิด/หาย → 401 และไม่มีแถว event
   - event ใหม่ → สร้างผลลัพธ์ + reply หนึ่งครั้ง (ข้อความ/เนื้อหาถูกต้อง)
   - `webhookEventId` ซ้ำ → ข้าม ไม่ประมวลผลซ้ำ
   - enter ครั้งที่สอง (id ต่างกัน) → ไม่สร้างผลลัพธ์ซ้ำ + ข้อความ "ทำแล้ว" + cooldown
   - context ไม่ active / ผู้ใช้ไม่รู้จัก / hwid ไม่มีในระบบ → status + การแจ้งตามตาราง §3
   - reply ล้ม → push ถูกเรียก, แถว notifications เป็นตามผลจริง
3. โครง test ที่ใช้ได้จริง (แบบใน repo นี้): integration test บน testing module + DB จริง,
   override provider client LINE ด้วย jest.fn() (replyMessage/pushMessage), ยิง request
   ผ่าน supertest ด้วย body ที่ลงนามด้วย secret ใน env ของ test, แล้วเรียก `drain()`
   ของ webhook service เพื่อรอ background processing จบก่อน assert

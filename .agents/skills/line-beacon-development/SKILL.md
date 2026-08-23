---
name: line-beacon-development
description: หลักการทำงานและการพัฒนา LINE Beacon + LINE Messaging API + LIFF — flow ของ beacon event ตั้งแต่อุปกรณ์จริงถึง webhook, signature verification, reply/push message, LINE Login ID token, การตั้งค่า LINE Developers Console, การดีบั๊กเมื่อ beacon ไม่ทริกเกอร์ และการจำลอง/ทดสอบ webhook โดยไม่ต้องมีอุปกรณ์จริง ใช้ทุกครั้งที่งานแตะ LINE Beacon, LINE Official Account/bot, Messaging API webhook, LINE Login, LIFF, หรือการส่งข้อความแจ้งเตือนผ่าน LINE — แม้ผู้ใช้แค่พูดว่า "beacon ไม่ทำงาน", "เช็คชื่ออัตโนมัติ" หรือ "ส่งข้อความ LINE"
---

# LINE Beacon Development

คู่มือสำหรับ agent ที่ต้องพัฒนา/ดีบั๊กระบบที่ใช้ LINE Beacon หรือ LINE Messaging API
ข้อมูลบางส่วนมาจากการใช้งานจริงในโปรเจกต์นี้ (LINE Beacon Attendance) — ส่วนที่เป็น
กฎเฉพาะของ repo นี้จะระบุชัดว่า "ใน repo นี้"

## 1. หลักการทำงาน — beacon event เกิดขึ้นได้อย่างไร

```text
[อุปกรณ์ Beacon] --BLE--> [แอป LINE บนมือถือ] --> [เซิร์ฟเวอร์ LINE]
                                                       |
                                       POST webhook (beacon event)
                                                       v
                                    [webhook URL ของ Official Account เจ้าของ beacon]
```

ประเด็นสำคัญที่ต้องเข้าใจก่อนเขียนโค้ดใด ๆ:

1. **เซิร์ฟเวอร์ของเราไม่เคยคุยกับ beacon โดยตรง** — อุปกรณ์ broadcast สัญญาณ BLE
   (LINE Simple Beacon frame) ที่มี **HW ID** (hex 10 ตัว) เป็นตัวระบุ แอป LINE บน
   มือถือเป็นคนฟังสัญญาณแล้วรายงานขึ้นเซิร์ฟเวอร์ของ LINE และ LINE เป็นคนยิง webhook
   มาหาเรา ดังนั้น "beacon ไม่ทำงาน" ส่วนใหญ่ปัญหาอยู่ที่ขั้นตอนกลาง ไม่ใช่โค้ดเรา
2. **Beacon ทุกตัวสังกัด Official Account (OA/bot) ตัวเดียว** — HW ID ถูกออกให้ OA ใด
   event ก็ถูกส่งไป webhook ของ OA นั้นเท่านั้น ตั้ง webhook ถูกแต่ beacon สังกัด OA
   อื่น = ไม่มี event มาถึงเราเลย (พลาดบ่อยมากเมื่อทำหลายโปรเจกต์ใน LINE account เดียวกัน)
3. **เวลาใน event (`timestamp`) คือเวลาที่ LINE ตรวจจับ beacon เป็น milliseconds epoch** —
   ถ้าระบบใช้เวลานี้เป็นเวลาเหตุการณ์ (เช่น check-in) ให้ใช้ค่านี้เสมอ ห้ามใช้เวลาที่
   server ได้รับ webhook เพราะ LINE อาจ retry ทีหลัง
4. **`replyToken` ใช้ได้ครั้งเดียว หมดอายุ ~1 นาที** — ถ้าจะตอบกลับผู้ใช้ ต้องเรียก
   reply โดยเร็ว หลังจากนั้นต้องใช้ push แทน (ดู §4)

## 2. เงื่อนไขครบ 5 ข้อที่ beacon event จะถึง webhook ของเรา

ตรวจตามลำดับนี้ทุกครั้งที่ "beacon ไม่ทริกเกอร์" (เรียงจากที่คนพลาดบ่อยที่สุด):

1. **ผู้ใช้เพิ่ม OA เป็นเพื่อนแล้วก่อนหน้านี้** — LINE ส่ง beacon event เฉพาะผู้ใช้ที่
   "แอด OA ที่เป็นเจ้าของ beacon เป็นเพื่อนไว้ก่อนแล้ว" (ยืนยันจากเอกสารทางการของ LINE)
   แบนเนอร์ที่เด้งตอนเจอ beacon ใช้ชวนให้กดแอดเพื่อนได้ แต่ event จะเริ่มมาหลังแอดแล้วเท่านั้น
2. **มือถือเปิด Bluetooth** และแอป LINE ไม่ถูกหยุดทำงานเบื้องหลัง
3. **เปิด "Use LINE Beacon" ในแอป LINE** — Settings → Privacy → Use LINE Beacon
   (คนพลาดข้อนี้บ่อยที่สุด เพราะปิดอยู่โดยดีฟอลต์)
4. **Webhook URL ถูกตั้งและเปิดใช้งาน** ใน Messaging API channel — กดปุ่ม **Verify**
   แล้วต้องขึ้นสำเร็จ และสวิตช์ **Use webhook = ON** (ตั้ง URL อย่างเดียวไม่พอ)
5. **Beacon นั้นลงทะเบียนสังกัด OA ตัวเดียวกับ channel ที่เราตั้ง webhook** และอุปกรณ์
   เปิดอยู่จริง / อยู่ในระยะ (LINE Beacon ใช้ได้ในญี่ปุ่น ไต้หวัน และไทย)

การตรวจว่า event มาถึงจริงหรือไม่: ดู **log ของ webhook endpoint** หรือตารางที่
persist event ดิบ (ใน repo นี้คือตาราง `beacon_logs`) — ถ้าไม่มีแถวเลยแปลว่าปัญหา
อยู่ข้อ 1–5 ไม่ใช่โค้ดประมวลผล

## 3. สถาปัตยกรรม LINE ที่ต้องตั้งค่าก่อน

```text
Provider (บริษัท/ทีม)
 ├── Messaging API channel   ← webhook เข้า, ส่งข้อความ reply/push
 |    ├── Channel secret            (ใช้ verify signature)
 |    ├── Channel access token      (ใช้เรียก reply/push API)
 |    └── Webhook URL + Use webhook
 ├── LINE Login channel      ← LIFF + ID token
 |    ├── Channel ID                (ใช้เป็น audience ตอน verify ID token)
 |    └── LIFF app (endpoint URL, scope: openid profile)
 └── Beacon ทั้งหมดลงทะเบียนสังกัด OA ของ Messaging API channel
```

- ทั้งสอง channel ควรอยู่ **Provider เดียวกัน** และอย่าปน credential ระหว่างหลาย
  โปรเจกต์ — สับสน secret/token/LIFF id ข้ามโปรเจกต์เป็นบั๊กที่เจอซ้ำ ๆ
- ใน dev ที่ต้องการ HTTPS public URL ใช้ tunnel (เช่น cloudflared) — ระวัง URL
  เปลี่ยนทุกครั้งที่รันใหม่ (quick tunnel) ต้องมาอัพเดต webhook URL/LIFF endpoint ใหม่
  และ dev server บางตัวบล็อก host ที่ไม่ใช่ localhost (เช่น Vite ต้องเพิ่ม
  `server.allowedHosts`)

## 4. ข้อความ LINE — reply ก่อน push เสมอ

| | replyMessage | pushMessage |
|---|---|---|
| เงื่อนไข | ต้องมี `replyToken` ที่ยังไม่ถูกใช้ (< ~1 นาที) | ไม่ต้องมี แต่ผู้รับต้องเป็นเพื่อนของ bot |
| โควตา | ฟรี ไม่นับโควตา | นับโควตาของ channel |
| ล้มเหลวเมื่อ | token หมดอายุ/ใช้ไปแล้ว (400) | ผู้รับไม่ได้แอดเพื่อน (400), token ผิด (401) |

รูปแบบที่ใช้ได้ทั้งสอง channel — plain text:

```json
{ "type": "text", "text": "✅ เช็คชื่อสำเร็จ\nกิจกรรม: อบรม Nuxt\nเวลา: 22:06 น." }
```

แนวทางที่ควรยึด:
- **ตอบกลับด้วย reply ก่อน** (ฟรีและเร็ว) แล้วค่อย fallback เป็น push เมื่อ reply ล้มเหลว
- **บันทึกผลการส่งทุกครั้ง** ลงตาราง (ใน repo นี้คือตาราง `notifications`: type, status
  PENDING/SENT/FAILED, message, error_message) เพื่อใช้ดีบั๊กและทำ cooldown
- **การส่งข้อความล้มเหลวต้องไม่กระทบข้อมูลหลัก** — สร้างข้อมูลธุรกิจ (เช่น attendance)
  สำเร็จก่อน แล้วค่อยส่งแจ้งเตือนแบบ fire-safe (try/catch ทั้งกระบวนการส่ง)
- **กันสแปมด้วย cooldown** — ถ้า beacon ยิง event ซ้ำต่อเนื่อง อย่าส่งข้อความเดิมซ้ำ:
  เช็คว่ามีแถว `status='SENT'` ของ type+ผู้ใช้+กิจกรรมนั้นภายในหน้าต่างเวลา (เช่น 10 นาที)
  ก่อนส่ง — ทำได้ด้วย query ตาราง notifications ไม่ต้องมี Redis
- **ข้อความตอนเช็คซ้ำควรเป็นข้อความคนละแบบจาก success** (เช่น "คุณเช็คชื่อไปแล้ว")
  เพราะการส่ง success message ซ้ำคือสแปมโดยตรง

## 5. กฎเหล็กของ webhook endpoint

1. **ตรวจ signature ก่อนทำอย่างอื่นเสมอ** — header `x-line-signature` คือ
   `base64(HMAC-SHA256(channelSecret, rawBody))`; ใช้ raw body จริง ๆ (ไม่ใช่
   JSON ที่ re-serialize แล้ว) เทียบไม่ตรง → ตอบ 401 ทันที ไม่บันทึกอะไรทั้งสิ้น
2. **ตอบ 200 เร็วที่สุด** — LINE มี timeout สั้น ๆ; ถ้าตอบ non-200 หรือหมดเวลา LINE
   จะ **retry ด้วย `webhookEventId` เดิม** ทำให้ได้ event ซ้ำ
3. **Idempotent ด้วย `webhookEventId`** — persist event ดิบพร้อม UNIQUE constraint
   บน `webhookEventId` **ก่อน** ตอบ 200 แล้วค่อยประมวลผลจริงแบบ background; duplicate
   key = retry จาก LINE = ข้ามได้เลย
4. **ห้ามไว้ใจข้อมูลที่ client ส่งมาเอง** — user id ต้องอ่านจาก `source.userId` ใน
   event ที่ผ่าน signature แล้วเท่านั้น; สำหรับ LIFF ให้ verify ID token (§6) ไม่ใช่
   เชื่อ `userId` ที่หน้าเว็บส่งมา
5. **ประมวลผลทุก event แบบมีผลลัพธ์ชัดเจน** — เก็บ processing status ต่อ event
   (เช่น PROCESSED / DUPLICATE / UNKNOWN_USER / NO_ACTIVE_ACTIVITY / ERROR) ไว้
   ตรวจสอบย้อนหลัง

ตัวอย่าง payload จริง, โค้ด verify signature และรูปแบบการ persist: อ่าน
`references/webhook-signature.md` เมื่อต้องเขียน/แก้ webhook endpoint

## 6. LIFF + LINE Login (ฝั่งนักศึกษา/ผู้ใช้ทั่วไป)

- **LIFF** = เว็บแอปที่เปิดใน browser ในแอป LINE (หรือ external browser) — เรียก
  `liff.init({ liffId })` แล้วใช้ `liff.getIDToken()` ได้เมื่อ logged in
- ส่ง ID token เป็น `Authorization: Bearer <idToken>` ให้ backend แล้ว **backend เป็น
  คน verify กับ JWKS ของ LINE** — issuer `https://access.line.org`, **audience =
  Channel ID ของ LINE Login channel** (ไม่ใช่ LIFF id), อัลกอริทึม ES256; เคลม
  `sub` คือ lineUserId ที่เชื่อถือได้
- External browser ที่ยังไม่ logged in → `liff.login({ redirectUri: window.location.href })`
  จะพาไป LINE Login แล้วกลับมาหน้าเดิม (ต้องลงทะเบียน Callback URL ให้ตรง)
- LIFF id อยู่ใน runtime config ฝั่งเว็บ (เช่น `NUXT_PUBLIC_LIFF_ID`) — ค่าว่าง = หน้า
  ควรมี state "ยังไม่ได้ตั้งค่า" แทนการ crash

โค้ด verify ID token และรายละเอียด config: อ่าน `references/liff-line-login.md`
เมื่อแตะ LIFF, LINE Login หรือการยืนยันตัวตนฝั่งผู้ใช้

## 7. ทดสอบโดยไม่ต้องมีอุปกรณ์ beacon จริง

จำลอง webhook ที่ LINE จะส่งมา (สูตรที่ใช้ได้จริง — ลงนามเองด้วย channel secret):

```bash
# 1) สร้าง body (เขียนด้วย node กันปัญหา encoding/ภาษาไทยบน Windows shell)
node -e "const now=Date.now();require('fs').writeFileSync('wh.json',JSON.stringify({
  destination:'Uffffffffffffffffffffffffffffffff',
  events:[{type:'beacon',replyToken:'sim-invalid',source:{type:'user',userId:'U1234...'},
  timestamp:now,webhookEventId:'sim-'+now,beacon:{type:'enter',hwid:'00000ac5bb',dm:''}}]}))"

# 2) คำนวณ signature และยิงเข้า endpoint ของตัวเอง
SIG=$(openssl dgst -sha256 -hmac "$CHANNEL_SECRET" -binary wh.json | base64)
curl -X POST https://<host>/api/v1/line/webhook \
  -H 'Content-Type: application/json' -H "x-line-signature: $SIG" \
  --data-binary @wh.json
```

- ทดสอบ idempotency: ยิงซ้ำด้วย `webhookEventId` เดิม → ต้องถูกข้าม ไม่ประมวลผลซ้ำ
- ทดสอบ signature ผิด (แก้ body หลัง hash หรือใช้ secret ผิด) → ต้องได้ 401
- ใน unit/integration test: mock ตัว LINE client (reply/push) ที่ระดับ DI แล้ว assert
  ข้อความ + แถว notifications; mock `@line/liff` ใน frontend test
- ยิง event ซ้ำสองลูก (webhookEventId ต่างกัน) เพื่อทดสอบเส้นทาง duplicate + cooldown

## 8. ตารางอาการ → สาเหตุ → วิธีเช็ค

| อาการ | สาเหตุที่พบบ่อย | วิธีเช็ค |
|---|---|---|
| ไม่มี webhook เข้าเลย | ข้อ 1–5 ใน §2 | ดูว่ามี request ถึง endpoint ไหม / กด Verify ใน console / ตาราง event ดิบ |
| Verify ผ่านแต่ไม่มี event จริง | ไม่ได้แอดเพื่อน หรือไม่เปิด Use LINE Beacon | แอด OA แล้วเดินเข้าระยะใหม่ |
| push ตอบ 400 | ผู้รับไม่ได้แอด bot เป็นเพื่อน (หรือ userId ไม่ได้มาจาก bot นี้) | ลอง reply แทน / เช็คว่าเป็นเพื่อนแล้ว |
| push/reply ตอบ 401 | channel access token ผิด/หมดอายุ หรือปนจากโปรเจกต์อื่น | สร้าง token ใหม่จาก channel ที่ถูกต้อง |
| signature ไม่ผ่านตลอด | channel secret ผิด channel, หรือ hash ไม่ได้อยู่บน raw body เดียวกับที่ส่ง | hash กับส่งต้องใช้ไฟล์/บัฟเฟอร์เดียวกัน |
| ได้ event เดิมซ้ำ ๆ | ตอบ non-200 ทำให้ LINE retry | ตอบ 200 หลัง persist + idempotent ด้วย webhookEventId |
| ผู้ใช้ได้ข้อความรัว ๆ | ไม่มี cooldown | เพิ่ม cooldown ตาม §4 |
| แจ้งเตือนไม่หน้าเว็บ/ข้อมูลหลักพังตาม | ปล่อยให้ notification failure ไป rollback | แยกการส่งออกจากธุรกรรมหลัก (§4) |

## 9. แผนที่โค้ดใน repo นี้ (LINE Beacon Attendance)

เมื่อทำงานกับ repo นี้ ให้ยึด pattern ที่มีอยู่ อย่าประดิษฐ์ใหม่:

- `apps/api/src/modules/line/line-webhook.controller.ts` + `line-webhook.service.ts` —
  pipeline: verify signature → persist (UNIQUE webhook_event_id) → ตอบ 200 → ประมวลผล async
- `beacon-event.service.ts` — engine ตัดสินผลต่อ event (attendance, DUPLICATE,
  ALREADY_CHECKED_IN, ฯลฯ)
- `line-notification.service.ts` — reply ก่อน push, บันทึกตาราง notifications, cooldown
- `line-token.service.ts` — verify LINE ID token กับ JWKS
- `me.controller.ts` + `line-link.service.ts` — endpoint ฝั่งผู้ใช้ (`/me*`) ด้วย Bearer ID token
- `apps/web/app/composables/useLiff.ts` / `useLiffSession.ts` / `useLiffApi.ts` และ
  `pages/liff/*` — ฝั่ง LIFF (ดู skill `web-ui-coding-standards` สำหรับงาน UI)
- `docs/line-beacon-attendance-project-spec.md` (สเปกต้นทาง) และ
  `docs/system-design-tech-stack.md` (สถาปัตยกรรม + decision log)
- Env ที่เกี่ยวข้อง: `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` (Messaging),
  `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` (Login), `LIFF_ID` /
  `NUXT_PUBLIC_LIFF_ID` — ห้าม commit จริง

## 10. สิ่งที่ควรบอกผู้ใช้เสมอ

- ระบบเช็คชื่อผ่าน beacon ได้ **ต่อเมื่อผู้ใช้แอด OA เป็นเพื่อนและเปิด Use LINE Beacon**
  แล้วเท่านั้น — ใส่ข้อความชวนแอดเพื่อนไว้ใน onboarding ของแอป
- ทุกการเปลี่ยน webhook endpoint (เช่น tunnel URL ใหม่) ต้องอัพเดตใน LINE Console
  และกด Verify ยืนยันด้วยทุกครั้ง
- อย่า hard delete ข้อมูลธุรกิจเพื่อ "แก้ปัญหา event ซ้ำ" — ใช้ idempotency/cooldown
  จัดการที่ต้นเหตุแทน

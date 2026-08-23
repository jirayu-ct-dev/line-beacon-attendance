---
name: line-beacon-development
description: คู่มือพัฒนา LINE Beacon และแพลตฟอร์ม LINE สำหรับใช้งานหลากหลายงาน — proximity notification, แจ้งเตือนตามสถานที่, check-in/presence, คูปองหน้าร้าน, ไกด์นิทรรศการ, stamp rally, analytics — ครอบคลุมหลักการทำงานของ beacon event, webhook + signature verification, reply/push/multicast/broadcast API, LIFF + LINE Login ID token, อุปกรณ์ (LINE Beacon และ LINE Simple Beacon แบบ DIY เช่น ESP32), การตั้งค่า LINE Developers Console, การดีบั๊ก และการทดสอบโดยไม่ต้องมีอุปกรณ์จริง ใช้ทุกครั้งที่งานแตะ LINE Beacon, LINE Official Account/bot, Messaging API, LINE Login, LIFF, อุปกรณ์ BLE beacon หรือการส่งข้อความ LINE — แม้ผู้ใช้แค่พูดว่า "beacon ไม่ทำงาน" หรือ "ส่งข้อความ LINE"
---

# LINE Beacon Development

คู่มือระดับ "รู้ว่าใช้ยังไง" สำหรับ agent ที่ต้องสร้างหรือดีบั๊กระบบที่ใช้ LINE Beacon / LINE
Messaging API / LIFF — เนื้อหาเป็นกลางต่อทุก use case (โปรเจกต์ใน repo นี้ใช้ทำระบบเช็คชื่อ
ซึ่งเป็นเพียงหนึ่งตัวอย่าง — ดูท้ายไฟล์) ข้อเท็จจริงเชิงเทคนิคยึดจากเอกสารทางการของ LINE
บวกประสบการณ์ใช้งานจริง

## 1. LINE Beacon ใช้ทำอะไรได้บ้าง (เลือก pattern ให้ตรงงาน)

LINE Beacon = รู้ว่า "ผู้ใช้ LINE อยู่ใกล้จุดใด" แล้วให้ระบบเราทำอะไรบางอย่างต่อ

| Use case | กลไกหลัก |
|---|---|
| ข้อความต้อนรับ/โปรโมชันตอนเดินผ่านหน้าร้าน (proximity marketing, O2O) | enter event → reply/push ข้อความ |
| Check-in / ทำเนียบการเข้าใช้พื้นที่ (ออฟฟิศ, ห้องแล็บ, ห้องสมุด, คลาสเรียน, งานอีเวนต์) | enter event → สร้าง record แบบกันซ้ำ |
| Stamp rally / เกมเก็บแสตมทัวร์หลายจุด | หลาย hwid → นับครบชุดแล้วให้รางวัล |
| คูปอง/สิทธิพิเศษตามสถานที่ | enter event → บันทึกสิทธิ + แจ้งเตือน |
| ไกด์ตามจุด (พิพิธภัณฑ์, นิทรรศการ, โรงพยาบาล, สาขา) | LIFF + beacon → เปิดหน้าเว็บเนื้อหาตามจุด |
| วัด footfall / สถิติคนเข้าพื้นที่รายช่วงเวลา | นับ event ที่ persist ไว้ (อย่าส่งข้อความทุก event) |
| Automation ตาม presence (เปิดอุปกรณ์, แจ้งทีมหน้างาน) | webhook ส่งต่อไประบบอื่น (webhook relay) |
| หลักฐานการปฏิบัติงานภาคสนาม (proof-of-presence) | event timestamp ของ LINE เป็นเวลาอ้างอิง |

ข้อจำกัดพื้นฐานที่ต้องบอกผู้ใช้ตั้งแต่ต้น: **LINE Beacon ใช้ได้เฉพาะประเทศญี่ปุ่น
ไต้หวัน และไทย** และระบบจะได้ event เฉพาะผู้ใช้ที่ **แอด OA เป็นเพื่อนแล้ว** (§3)

## 2. Capability map — สิ่งที่แพลตฟอร์ม LINE ให้ใช้ (มองเป็นชุดเครื่องมือ)

| ความสามารถ | กลไก | หมายเหตุ |
|---|---|---|
| รับรู้ว่าผู้ใช้อยู่ใกล้ beacon | Webhook `beacon` event | หัวใจของทุก use case — §4 |
| ตอบกลับทันทีหลังได้ event | `POST /v2/bot/message/reply` | ฟรี ไม่นับโควตา แต่ใช้ replyToken ครั้งเดียว ~1 นาที |
| ส่งข้อความเองเมื่อไรก็ได้ | `POST /v2/bot/message/push` | นับโควตาตามแพ็กเกจ OA; ผู้รับต้องเป็นเพื่อน bot |
| ส่งกลุ่มผู้ใช้พร้อมกัน | `POST /v2/bot/message/multicast` | เอาผู้รับหลาย id ในคำขอเดียว |
| ประกาศทุกคนที่เป็นเพื่อน | `POST /v2/bot/message/broadcast` | ใช้กับข่าวประกาศ ไม่ใช่ per-location |
| เว็บแอปใน LINE | LIFF (`liff.init` + endpoint URL) | เปิดหน้าเว็บแบบ login อัตโนมัติ — §7 |
| ยืนยันตัวตนผู้ใช้ฝั่งเว็บ/backend | LINE Login ID token + JWKS | `sub` = lineUserId ที่เชื่อถือได้ |
| ข้อมูลโปรไฟล์ผู้ใช้ | `GET /v2/bot/profile/{userId}` | ชื่อ/รูป สำหรับแสดงผล |
| เมนูคงที่ในห้องแชท | Rich Menu | ทางลัดเข้า LIFF/ฟีเจอร์ — ทำผ่าน console ได้ |

ทุก endpoint อยู่ที่ `https://api.line.me` พร้อม header
`Authorization: Bearer <channel access token>` และส่งได้สูงสุด 5 ข้อความต่อคำขอ
(ตัวอย่างโค้ดจริงอยู่ §6)

## 3. หลักการทำงาน — event เดินทางอย่างไร และเงื่อนไขที่มันจะเกิดจริง

```text
[อุปกรณ์ Beacon] --BLE--> [แอป LINE บนมือถือ] --> [เซิร์ฟเวอร์ LINE]
                                                       |
                                       POST webhook (beacon event)
                                                       v
                                    [webhook URL ของ OA เจ้าของ beacon]
```

- **เซิร์ฟเวอร์ของเราไม่เคยคุยกับ beacon โดยตรง** — อุปกรณ์ broadcast สัญญาณ BLE ที่มี
  **HW ID** เป็นตัวระบุ แอป LINE เป็นคนฟังแล้วรายงานเซิร์ฟเวอร์ LINE และ LINE เป็นคนยิง
  webhook มาหาเรา — "beacon ไม่ทำงาน" ส่วนใหญ่ปัญหาอยู่ขั้นตอนกลาง ไม่ใช่โค้ดเรา
- **Beacon ทุกตัวสังกัด OA ตัวเดียว** — HWID ถูกออกให้ OA ใด event ก็ไป webhook ของ OA
  นั้นเท่านั้น (พลาดบ่อยมากเมื่อมีหลายโปรเจกต์ใน LINE account เดียวกัน)

เงื่อนไขครบ 5 ข้อที่ event จะถึง webhook (ไล่ตามลำดับนี้ทุกครั้งที่ "ไม่ทริกเกอร์"):

1. **ผู้ใช้เพิ่ม OA เป็นเพื่อนแล้วก่อนหน้านี้** — LINE ส่ง beacon event เฉพาะผู้ที่แอด OA
   เจ้าของ beacon ไว้ก่อนแล้ว (แบนเนอร์ที่เด้งตอนเจอ beacon ช่วยชวนให้กดแอดได้)
2. **มือถือเปิด Bluetooth** และแอป LINE ไม่ถูกหยุดทำงานเบื้องหลัง
3. **เปิด "Use LINE Beacon" ในแอป LINE** — Settings → Privacy → Use LINE Beacon
   (ปิดอยู่โดยดีฟอลต์ — คนพลาดข้อนี้บ่อยที่สุด)
4. **Webhook URL ถูกตั้ง + กด Verify สำเร็จ + สวิตช์ Use webhook = ON** ใน Messaging API channel
5. **Beacon สังกัด OA ตัวเดียวกับ channel ที่ตั้ง webhook** อุปกรณ์เปิดอยู่จริง อยู่ในระยะ
   และอยู่ในประเทศที่รองรับ (JP/TW/TH)

การตรวจว่า event มาถึงจริง: ดู log ของ webhook endpoint หรือตารางที่ persist event ดิบ —
ถ้าไม่มีเลย = ปัญหาอยู่ข้อ 1–5 ไม่ใช่โค้ดประมวลผล

## 4. อุปกรณ์ 2 แบบ — เลือกให้ถูกงาน

| | **LINE Simple Beacon** (DIY) | **LINE Beacon** (อุปกรณ์ certified) |
|---|---|---|
| เหมาะกับ | ต้นแบบ/งานภายใน/นวัตกรรม — ESP32, micro:bit, obniz, Node.js BLE | งาน production ที่ต้องการความน่าเชื่อถือ |
| ได้ HW ID จาก | LINE Developers Console (ออกเองได้) | ติดต่อ LY Corporation (บริษัทแม่ของ LINE) ขอออกให้ |
| สเปกเฟรม | เปิดเผยที่ [github.com/line/line-simple-beacon](https://github.com/line/line-simple-beacon) (BLE advertising, HWID hex 10 ตัว = 5 bytes) | BLE 4.0 + iBeacon + secure message (SHA-256/XOR หมุนทุก ~15 วินาที กัน replay); แนะนำ interval 152.5ms |
| ความปลอดภัย | **ปลอมและอ้าง HW ID กันได้** (ไม่มีกลไกพิสูจน์ตัวจริง) | มี message auth จากอุปกรณ์ certified |
| ข้อควรระวัง | ตามคำเตือนทางการ: **อย่าใช้การเจอ beacon เป็นหลักฐานระดับความปลอดภัยสูง** (เช่น ยืนยันธุรกรรม) — ใช้เป็น trigger/ความสะดวกเท่านั้น | ราคา/ขั้นตอนจัดหาสูงกว่า |

ตัวอย่างการทำ DIY: [linedevth/LINE-Simple-Beacon-ESP32](https://github.com/linedevth/LINE-Simple-Beacon-ESP32),
[taichunmin/line-simplebeacon-esp32](https://github.com/taichunmin/line-simplebeacon-esp32)

## 5. สถาปัตยกรรม LINE ที่ต้องตั้งค่าก่อน

```text
Provider (บริษัท/ทีม — ควรรวมทุกอย่างไว้ที่นี่)
 ├── Messaging API channel   ← webhook เข้า, ส่งข้อความ
 |    ├── Channel secret            (verify signature)
 |    ├── Channel access token      (เรียก message API)
 |    └── Webhook URL + Use webhook
 ├── LINE Login channel      ← LIFF + ID token
 |    ├── Channel ID                (audience ตอน verify ID token)
 |    └── LIFF app (endpoint URL, scope: openid profile)
 └── Beacon ทุกตัวลงทะเบียนสังกัด OA ของ Messaging API channel
```

- อย่าปน credential ระหว่างหลายโปรเจกต์ — สับสน secret/token/LIFF id ข้ามโปรเจกต์เป็นบั๊กซ้ำ ๆ
- Dev ที่ต้องการ HTTPS public: tunnel (เช่น cloudflared) — quick tunnel เปลี่ยน URL ทุกครั้ง
 ที่รัน ต้องอัพเดต webhook/LIFF ใหม่; dev server บางตัวบล็อก host นอก localhost
  (Vite → `server.allowedHosts`)

## 6. Webhook + ส่งข้อความ — กฎที่ต้องยึด

**Webhook** (ละเอียดทั้ง payload จริง + โค้ด: `references/webhook-signature.md`):
1. ตรวจ `x-line-signature` (= `base64(HMAC-SHA256(channelSecret, rawBody))`) **ก่อนอ่านอะไร**
2. **ตอบ 200 ให้เร็ว** — ตอบไม่ดี LINE จะ retry ด้วย `webhookEventId` เดิม
3. **Idempotent ด้วย `webhookEventId`** — persist event ดิบ (UNIQUE) ก่อนตอบ 200 แล้วค่อย
   ประมวลผลเบื้องหลัง; duplicate = ข้าม
4. ใช้ `timestamp` ของ event เป็นเวลาเหตุการณ์ ไม่ใช่เวลาที่ server ได้รับ
5. เก็บ processing status ต่อ event เสมอ (PROCESSED/DUPLICATE/.../ERROR) เพื่อตรวจย้อนหลัง

**ส่งข้อความ** — reply ก่อน push เสมอ:

```bash
# reply: ฟรี + ทันที แต่ต้องมี replyToken ที่ยังไม่ถูกใช้ (~1 นาที)
curl -X POST https://api.line.me/v2/bot/message/reply \
  -H "Authorization: Bearer $CHANNEL_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"replyToken":"<จาก event>","messages":[{"type":"text","text":"สวัสดี!"}]}'

# push: ส่งเองเมื่อไรก็ได้ (นับโควตา; ผู้รับต้องเป็นเพื่อน bot ไม่งั้นได้ 400)
curl -X POST https://api.line.me/v2/bot/message/push \
  -H "Authorization: Bearer $CHANNEL_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"to":"U1234...","messages":[{"type":"text","text":"มีอะไรใหม่บ้าง"}]}'
# multicast = {"to":["U1..","U2.."],...}   broadcast = {"messages":[...]} (ทุกเพื่อน)
```

แนวปฏิบัติ:
- **บันทึกผลการส่งทุกครั้ง** (ตาราง notifications: type/status/message/error) และ
  **การส่งล้มเหลวต้องไม่กระทบข้อมูลหลัก**หรือ response ของ webhook
- **กันสแปมด้วย cooldown** — beacon ยิง event รัว ๆ; ก่อนส่ง type ใดเช็คแถว SENT ล่าสุด
  ของ type+ผู้ใช้+บริบทภายในหน้าต่างเวลา (เช่น 10 นาที) — ทำได้ด้วย DB ไม่ต้องมี Redis
- ข้อความ "กรณีซ้ำ" ควรเป็นคนละแบบจากข้อความสำเร็จ (เช่น "คุณทำรายการนี้แล้ว") ไม่ใช่
  ส่งข้อความเดิมซ้ำ
- ข้อความเป็น plain text JSON (`{"type":"text","text":...}`) — Flex/sticker/image มีให้
  ใช้เพิ่มเติมได้ตาม Messaging API reference

## 7. LIFF + LINE Login (เมื่อต้องมีหน้าเว็บหรือการยืนยันตัวตน)

- **LIFF** = เว็บแอปใน browser ของ LINE: `liff.init({ liffId })` → `liff.getIDToken()` →
  ส่งเป็น `Authorization: Bearer <idToken>` ให้ backend แล้ว backend **verify กับ JWKS ของ
  LINE** (issuer `https://access.line.org`, audience = **Channel ID** ของ LINE Login channel,
  ES256) — เคลม `sub` คือ lineUserId ที่เชื่อถือได้; ห้ามเชื่อ userId ที่ client ส่งมาเอง
- รายละเอียดโค้ด + การตั้งค่า console (Endpoint/Callback URL): `references/liff-line-login.md`
- ใช้ LIFF เมื่อ: ต้องฟอร์ม/เนื้อหามากกว่าข้อความแชท, ต้องผูกบัญชี LINE กับข้อมูลผู้ใช้ของเรา,
  หรือต้องหน้าเว็บเฉพาะจุด (ไกด์/คูปอง/สแตม)

## 8. ทดสอบโดยไม่ต้องมีอุปกรณ์ beacon จริง

```bash
# 1) สร้าง body (เขียนด้วย node กันปัญหา encoding บน Windows shell)
node -e "const now=Date.now();require('fs').writeFileSync('wh.json',JSON.stringify({
  destination:'Uffffffffffffffffffffffffffffffff',
  events:[{type:'beacon',replyToken:'sim-invalid',source:{type:'user',userId:'U1234...'},
  timestamp:now,webhookEventId:'sim-'+now,beacon:{type:'enter',hwid:'00000ac5bb',dm:''}}]}))"

# 2) ลงนามเองด้วย channel secret แล้วยิงเข้า endpoint ของตัวเอง
SIG=$(openssl dgst -sha256 -hmac "$CHANNEL_SECRET" -binary wh.json | base64)
curl -X POST https://<host>/<webhook path> \
  -H 'Content-Type: application/json' -H "x-line-signature: $SIG" \
  --data-binary @wh.json
```

- ทดสอบ idempotency (ยิงซ้ำ `webhookEventId` เดิม), signature ผิด (ต้อง 401), event ซ้ำ
  สองลูก id ต่างกัน (ทาง duplicate + cooldown), reply ล้ม → push fallback
- ใน unit test: mock ตัว LINE client (reply/push) ที่ระดับ DI; frontend mock `@line/liff`

## 9. ตารางอาการ → สาเหตุ → วิธีเช็ค

| อาการ | สาเหตุที่พบบ่อย | วิธีเช็ค |
|---|---|---|
| ไม่มี webhook เข้าเลย | ข้อ 1–5 ใน §3 | มี request ถึง endpoint ไหม / กด Verify / ดูตาราง event ดิบ |
| Verify ผ่านแต่ไม่มี event จริง | ไม่ได้แอดเพื่อน หรือไม่เปิด Use LINE Beacon | แอด OA แล้วเข้าระยะใหม่ |
| push ตอบ 400 | ผู้รับไม่ได้แอด bot เป็นเพื่อน (หรือ userId ไม่ใช่ของ bot นี้) | ลอง reply แทน / เช็คสถานะเพื่อน |
| push/reply ตอบ 401 | token ผิด channel/หมดอายุ/ปนโปรเจกต์อื่น | ออก token ใหม่จาก channel ที่ถูก |
| signature ไม่ผ่านตลอด | secret ผิด channel หรือ hash ไม่ได้อยู่บน raw body เดียวกับที่ส่ง | hash กับส่งต้องใช้ bytes เดียวกัน |
| ได้ event เดิมซ้ำ ๆ | ตอบ non-200 ทำให้ LINE retry | ตอบ 200 หลัง persist + idempotent |
| ผู้ใช้ได้ข้อความรัว ๆ | ไม่มี cooldown | เพิ่ม cooldown ตาม §6 |
| ข้อมูลหลักพังตามการส่งข้อความ | ปล่อยให้ notification failure rollback | แยกการส่งออกจากธุรกรรมหลัก |

## 10. ถ้าทำงานใน repo นี้ (LINE Beacon Attendance)

โปรเจกต์นี้ใช้ LINE Beacon ทำระบบเช็คชื่อนักศึกษา — แผนที่โค้ด ไฟล์เอกสาร และ env vars
ที่เกี่ยวข้อง อยู่ที่ `references/project-line-beacon-attendance.md` (ยึด pattern ของ
repo อย่าประดิษฐ์ใหม่; งาน UI ฝั่งเว็บใช้คู่กับ skill `web-ui-coding-standards`)

**แหล่งอ้างอิงหลัก**: [LINE Beacon device spec](https://developers.line.biz/en/docs/messaging-api/beacon-device-spec/)
· [Using beacons with LINE](https://developers.line.biz/en/docs/messaging-api/using-beacons/)
· [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/)
· [line-simple-beacon (GitHub)](https://github.com/line/line-simple-beacon)

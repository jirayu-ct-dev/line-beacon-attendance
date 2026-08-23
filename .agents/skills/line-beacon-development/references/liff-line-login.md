# LIFF และ LINE Login (ฝั่งผู้ใช้: LINE ID Token)

อ่านไฟล์นี้เมื่อแตะ LIFF, การผูกบัญชี LINE กับผู้ใช้ของระบบ, หรือการ verify LINE ID token
ที่ backend — ใช้ได้กับทุก use case (ฟอร์มลงทะเบียน, หน้าคูปอง, ไกด์นิทรรศการ, สแตมรัลลี่,
การจัดการโปรไฟล์ผู้ใช้)

## 1. สายข้อมูล LIFF

```text
เบราว์เซอร์ใน LINE (หรือ external browser)
  liff.init({ liffId })
  liff.isLoggedIn() ? liff.getIDToken() : liff.login({ redirectUri })
        |
        | Authorization: Bearer <ID token>          (ไม่ใช่ cookie ของระบบหลังบ้านอื่น!)
        v
Backend: verify กับ LINE JWKS → เคลม sub = lineUserId ที่เชื่อถือได้
```

- LIFF id อยู่ในหน้า **LINE Login channel → LIFF tab** (รูป `<channelId>-<random>`)
  และเปิดผ่าน `https://liff.line.me/<liffId>` (อย่าใช้ `line://app/...` — เลิกใช้แล้ว)
- LIFF id เป็นค่า public — ใส่ใน runtime config ของเว็บ (เช่น `NUXT_PUBLIC_LIFF_ID`
  ซึ่ง Nuxt map เป็น `runtimeConfig.public.liffId`)
- โหลด SDK แบบ lazy + client-only (`await import('@line/liff')`) เพื่อไม่ให้กระทบ SSR
  และหน้าอื่นที่ไม่เกี่ยว
- ใช้ LIFF เมื่อต้องการสิ่งที่เกินกว่าข้อความแชท: ฟอร์ม, เนื้อหารวย ๆ, สแตม/คูปอง,
  การผูกบัญชีกับข้อมูลผู้ใช้ของเรา

## 2. Backend: verify ID token (jose)

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL('https://access.line.org/.well-known/openid-configuration/JWKS'),
)

const { payload } = await jwtVerify(idToken, JWKS, {
  issuer: ['https://access.line.org', 'https://api.line.org'],
  audience: LINE_LOGIN_CHANNEL_ID, // Channel ID ของ LINE Login channel — ไม่ใช่ LIFF id!
  algorithms: ['ES256'],
})
// ใช้ได้: payload.sub (lineUserId), payload.name, payload.picture
```

ข้อผิดพลาดที่พบบ่อย:
- **ใส่ LIFF id เป็น audience** → ตรวจไม่ผ่านเสมอ; audience ต้องเป็น Channel ID ตัวเลข
- เชื่อ `userId` ที่หน้าเว็บส่งมาเองโดยไม่ verify token — ห้าม; lineUserId ต้องได้จาก
  `sub` ของ token ที่ verify แล้วเท่านั้น
- token หมดอายุ/ถูก revoke → ตอบ 401 ให้หน้าเว็บเปิดใหม่ (LIFF flow ไม่มี refresh token)
- ใช้ `LINE_LOGIN_CHANNEL_SECRET` กับ ID token ไม่ได้ — การ verify นี้ใช้ JWKS
  สาธารณะของ LINE

## 3. Guard และการผูกบัญชีฝั่ง backend

- Endpoint ที่ใช้ Bearer ID token ต้องแยกจากระบบ auth อื่น (เช่น session/JWT ของ
  dashboard หลังบ้าน) — สองโลกต้องไม่ปนกัน: ผู้ใช้ LIFF ที่ถูก 401 ต้องไม่ถูกดันไปหน้า
  login ของระบบหลังบ้าน
- การผูกบัญชี (account linking): รับข้อมูลยืนยันจากผู้ใช้ (เช่น รหัสลูกค้า/รหัสพนักงาน +
  ข้อมูลลับส่วนตัว เช่น วันเกิด) **คู่กับ** ID token ที่ verify แล้ว — เก็บในตาราง
  `line_accounts` โดย `line_user_id` UNIQUE ทั้งสองทิศ (หนึ่ง LINE = หนึ่งผู้ใช้)
  พร้อม **rate limit การลองผิด** (กันการเดาข้อมูลลับ เช่น 5 ครั้ง/ชั่วโมง/รหัส)
- ค่า `name`/`picture` จาก token ใช้ refresh โปรไฟล์ที่แสดงได้

## 4. หน้าเว็บ (pattern ที่ผ่านการใช้จริง)

- State machine ของ LIFF: `initializing → ready | error | unconfigured`
  (`unconfigured` = ยังไม่ตั้ง LIFF id — แสดงการ์ดบอกวิธีตั้งค่าแทน crash)
- เปิดจาก external browser และยังไม่ login → `getIDToken()` คืน null → แสดงปุ่ม
  "เข้าสู่ระบบด้วย LINE" ที่เรียก `liff.login({ redirectUri: window.location.href })`
- หลัง login กลับมาหน้าจะ reload — ทุก state ต้องทน route reload ได้; มี session
  กลาง (composable เดียว: resolve token + `GET /me`) แชร์ระหว่าง layout กับทุกหน้า
  แทนการ copy bootstrap ทุกหน้า
- แยก API client ของ LIFF (Bearer ID token) ออกจาก client อื่นของระบบ — error/401
  handling คนละแบบ
- Frontend test: mock `@line/liff` ทั้งโมดูล (init/isInClient/isLoggedIn/getIDToken/login)
  และ mock endpoint ด้วย `registerEndpoint` ของ @nuxt/test-utils

## 5. การตั้งค่าใน LINE Developers Console (เช็คลิสต์)

ใน **LINE Login channel**:

| ฟิลด์ | ใส่ค่าอะไร |
|---|---|
| LIFF → Endpoint URL | URL สาธารณะของหน้าเข้า (เช่น `https://<host>/liff/<entry>`) |
| LIFF → Scope | `openid` + `profile` |
| LIFF → Bot link | ตามต้องการ (เชื่อม OA อัตโนมัติเมื่อเปิด LIFF) |
| LINE Login → Callback URL | ให้ตรงกับ endpoint URL (ใช้ตอน `liff.login()` บน external browser กลับมาหน้าเดิม) |

ข้อควรระวัง:
- dev ผ่าน tunnel: ทุกครั้งที่ URL เปลี่ยน ต้องอัพเดตทั้ง Endpoint และ Callback
- เปิด LIFF ผิด channel/ผิดโปรเจกต์ (มีหลาย LIFF app ใน account เดียว) จะโหลดหน้า
  คนละแอป — เช็ค endpoint URL ที่หน้า interstitial ของ `liff.line.me/<id>` ก่อน
- LINE Login channel กับ Messaging API channel ควรอยู่ Provider เดียวกัน —
  lineUserId ต้องใช้ร่วมกันได้ทั้งสองทาง (webhook และ LIFF)
